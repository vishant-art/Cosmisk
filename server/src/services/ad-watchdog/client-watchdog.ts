import { getDbAdapter } from '../../db/adapter.js';
import { decryptToken } from '../token-crypto.js';
import { MetaApiService } from '../meta-api.js';
import { logger } from '../../utils/logger.js';
import { runOOSCheckForClient } from '../oos-detector.js';
import { runDiscountLeakageForClient } from '../discount-leakage-detector.js';
import {
  getClientContext, getWatchdogStore, updateWatchdogStore, getWatchdogUrgencyThreshold,
  createRecommendation,
  type ServiceClient,
} from '../service-clients.js';
// CLOSED-LOOP OPERATING SYSTEM: Track recommendations with predictions
import { agentRecommend } from '../recommendation-loop.js';
import { gatherAccountSnapshot } from './snapshot.js';
import { reasonAboutPerformance } from './reasoning.js';
import { mapDecisionTypeToRecommendationType, parseEstimatedImpact } from './decision-helpers.js';
import type { ClientWatchdogReport } from './types.js';

/* ------------------------------------------------------------------ */
/*  Client-aware Watchdog                                              */
/* ------------------------------------------------------------------ */

/**
 * Run Watchdog for a specific client
 * - Uses client's Meta token
 * - Applies revenue-level urgency filtering
 * - Tracks watchdog runs for deduplication
 * - Integrates OOS and Leakage checks with client context
 */
export async function runWatchdogForClient(
  clientId: string,
  options: { metaToken?: string; shopifyToken?: string } = {},
): Promise<ClientWatchdogReport | null> {
  const ctx = await getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[Watchdog Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const watchdogStore = await getWatchdogStore(clientId);

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel,
  }, '[Watchdog Client] Starting run');

  // Get client's Meta token
  const db = getDbAdapter();
  let metaToken = options.metaToken;
  let metaAccountId = client.metaAdAccountId;

  if (!metaToken && client.metaAdAccountId) {
    // Try to get token from service_clients.meta_access_token
    const clientRow = await db.get<{ meta_access_token?: string }>('SELECT meta_access_token FROM service_clients WHERE id = ?', [clientId]);
    if (clientRow?.meta_access_token) {
      metaToken = decryptToken(clientRow.meta_access_token);
      logger.info({ clientId }, '[Watchdog Client] Using token from service_clients');
    } else {
      logger.warn({ clientId }, '[Watchdog Client] No Meta token found');
    }
  }

  if (!metaToken || !metaAccountId) {
    logger.error({ clientId }, '[Watchdog Client] Missing Meta credentials');
    return null;
  }

  const meta = new MetaApiService(metaToken);

  // Get urgency threshold for this client
  const urgencyThreshold = getWatchdogUrgencyThreshold(client);
  const urgencyOrder = { low: 1, medium: 2, high: 3, critical: 4 };
  const minUrgency = urgencyOrder[urgencyThreshold];

  logger.info({ urgencyThreshold }, '[Watchdog Client] Using urgency threshold');

  try {
    // Gather account snapshot
    const snapshot = await gatherAccountSnapshot(meta, metaAccountId);

    // Get AI-powered decisions with intelligence integration.
    // Client-mode watchdog uses clientId as the LLM-gateway principal — the
    // run has no separate userId in scope, and per-client billing matches
    // the service-clients ownership model.
    const decisions = await reasonAboutPerformance(clientId, snapshot, [], '', clientId);

    // Run OOS check with client context
    let oosReport = null;
    if (options.shopifyToken) {
      try {
        oosReport = await runOOSCheckForClient(clientId, {
          metaToken,
          days: 7,
        });

        if (oosReport && oosReport.shouldAlert) {
          decisions.push({
            type: 'oos_wasted_spend',
            targetId: 'oos_products',
            targetName: `${oosReport.newOOSProducts?.length || 0} OOS products with active ads`,
            reasoning: `Found ${oosReport.enhanced?.topWasted?.length || 0} products running ads while out of stock. Verified wasted spend: Rs ${oosReport.verifiedWastedSpend?.toLocaleString() || 0}`,
            confidence: 'high',
            urgency: oosReport.verifiedWastedSpend > 5000 ? 'high' : 'medium',
            suggestedAction: 'pause',
            estimatedImpact: `Save Rs ${oosReport.verifiedWastedSpend?.toFixed(0) || 0}/week`,
          });
        }
      } catch (oosErr: any) {
        logger.warn({ err: oosErr.message }, '[Watchdog Client] OOS check failed');
      }
    }

    // Run Discount Leakage check with client context
    let leakageReport = null;
    if (options.shopifyToken) {
      try {
        leakageReport = await runDiscountLeakageForClient(clientId, {
          shopifyToken: options.shopifyToken,
        });

        if (leakageReport && leakageReport.shouldAlert) {
          decisions.push({
            type: 'discount_leakage',
            targetId: 'discount_codes',
            targetName: `${leakageReport.newLeakedCodes?.length || 0} new leaked codes`,
            reasoning: `Found ${leakageReport.leakedCodes?.length || 0} discount codes on coupon sites. New codes: ${leakageReport.newLeakedCodes?.slice(0, 3).join(', ') || 'none'}. Revenue leaked: Rs ${leakageReport.totalRevenueLeakage?.toLocaleString() || 0}`,
            confidence: 'high',
            urgency: leakageReport.totalRevenueLeakage > 10000 ? 'high' : 'medium',
            suggestedAction: 'monitor',
            estimatedImpact: `Rs ${leakageReport.totalRevenueLeakage?.toLocaleString() || 0} leaked this month`,
          });
        }
      } catch (leakageErr: any) {
        logger.warn({ err: leakageErr.message }, '[Watchdog Client] Leakage check failed');
      }
    }

    // Filter decisions by urgency threshold
    const filteredDecisions = decisions.filter(d => {
      const decisionUrgency = urgencyOrder[d.urgency] || 2;
      return decisionUrgency >= minUrgency;
    });

    // Determine if we should alert
    const shouldAlert = filteredDecisions.length > 0;
    const alertReason = shouldAlert
      ? `${filteredDecisions.length} issues at ${urgencyThreshold}+ urgency`
      : undefined;

    logger.info({
      totalDecisions: decisions.length,
      filteredDecisions: filteredDecisions.length,
      shouldAlert,
    }, '[Watchdog Client] Run complete');

    // Update watchdog store
    await updateWatchdogStore(clientId, {
      lastRunAt: new Date().toISOString(),
      totalDecisions: (watchdogStore?.totalDecisions || 0) + decisions.length,
      alertsSent: shouldAlert ? (watchdogStore?.alertsSent || 0) + 1 : watchdogStore?.alertsSent || 0,
      lastAlertAt: shouldAlert ? new Date().toISOString() : watchdogStore?.lastAlertAt,
      recentDecisionTypes: filteredDecisions.map(d => d.type),
    });

    // Create recommendations for filtered decisions
    for (const decision of filteredDecisions) {
      await createRecommendation(clientId, 'watchdog', decision.type, {
        targetName: decision.targetName,
        reasoning: decision.reasoning,
        suggestedAction: decision.suggestedAction,
        urgency: decision.urgency,
        estimatedImpact: decision.estimatedImpact,
      });

      // === CLOSED-LOOP OPERATING SYSTEM ===
      // Track recommendation with prediction for validation
      try {
        const recType = mapDecisionTypeToRecommendationType(decision.type);
        const predictedSavings = parseEstimatedImpact(decision.estimatedImpact);

        await agentRecommend(clientId, 'watchdog', {
          type: recType,
          entityType: 'campaign',
          entityId: decision.targetId,
          entityName: decision.targetName,
          action: `${decision.suggestedAction}: ${decision.targetName}`,
          reasoning: decision.reasoning,
          evidence: [
            `Confidence: ${decision.confidence}`,
            `Urgency: ${decision.urgency}`,
            `Impact: ${decision.estimatedImpact}`,
          ],
          confidence: decision.confidence === 'high' ? 90 : decision.confidence === 'moderate' ? 70 : 50,
          predictedSavings,
        });
      } catch (loopErr) {
        logger.warn({ err: loopErr }, '[Watchdog Client] Closed-loop tracking failed');
      }
    }

    return {
      clientId,
      clientName: client.brandName,
      revenueLevel: client.revenueLevel || 'unknown',
      accountName: snapshot.accountName,
      decisions,
      filteredDecisions,
      oosReport,
      leakageReport,
      shouldAlert,
      alertReason,
      runAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error({ err: err.message, clientId }, '[Watchdog Client] Run failed');
    return null;
  }
}

/**
 * Generate Smashed-branded HTML report for Watchdog
 */
export function generateWatchdogHTMLReport(report: ClientWatchdogReport, client: ServiceClient): string {
  const urgencyColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Watchdog Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .status-badge { display: inline-block; background: ${report.shouldAlert ? '#ef4444' : '#22c55e'}; color: #fff; padding: 8px 20px; border-radius: 20px; font-weight: 700; text-transform: uppercase; margin-top: 20px; }
    .meta { margin-top: 30px; display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
    .meta-item { text-align: center; }
    .meta-value { font-size: 32px; font-weight: 700; color: #EC8A23; }
    .meta-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }

    /* Sections */
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }

    /* Decisions Grid */
    .decisions-grid { display: grid; gap: 20px; }
    .decision-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .decision-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .decision-type { font-size: 14px; color: #EC8A23; font-weight: 600; text-transform: uppercase; }
    .decision-urgency { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .decision-target { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 12px; }
    .decision-reasoning { font-size: 14px; color: #aaa; margin-bottom: 16px; line-height: 1.6; }
    .decision-action { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid #2a2a2a; }
    .action-label { font-size: 12px; color: #666; }
    .action-value { font-size: 14px; color: #6ee7b7; font-weight: 600; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
    .summary-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; text-align: center; }
    .summary-value { font-size: 36px; font-weight: 700; color: #EC8A23; margin-bottom: 8px; }
    .summary-label { font-size: 14px; color: #888; }

    /* Footer */
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Ad Watchdog Report</h1>
    <div class="subtitle">${client.brandName} — ${report.accountName}</div>
    <div class="status-badge">${report.shouldAlert ? 'Action Required' : 'All Clear'}</div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-value">${report.decisions.length}</div>
        <div class="meta-label">Issues Found</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.filteredDecisions.length}</div>
        <div class="meta-label">Requires Action</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.oosReport?.enhanced?.topWasted?.length || 0}</div>
        <div class="meta-label">OOS Products</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.leakageReport?.leakedCodes?.length || 0}</div>
        <div class="meta-label">Leaked Codes</div>
      </div>
    </div>
  </div>

  <div class="container">
    ${report.filteredDecisions.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Action Required</h2>
      <div class="decisions-grid">
        ${report.filteredDecisions.map(d => `
          <div class="decision-card" style="border-left: 4px solid ${urgencyColors[d.urgency] || '#888'};">
            <div class="decision-header">
              <span class="decision-type">${d.type.replace(/_/g, ' ')}</span>
              <span class="decision-urgency" style="background: ${urgencyColors[d.urgency] || '#888'};">${d.urgency}</span>
            </div>
            <div class="decision-target">${d.targetName}</div>
            <div class="decision-reasoning">${d.reasoning}</div>
            <div class="decision-action">
              <div>
                <div class="action-label">Suggested Action</div>
                <div class="action-value">${d.suggestedAction.replace(/_/g, ' ').toUpperCase()}</div>
              </div>
              <div style="text-align:right;">
                <div class="action-label">Estimated Impact</div>
                <div class="action-value">${d.estimatedImpact}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : `
    <div class="section">
      <h2 class="section-title">Status</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #22c55e;border-radius:12px;padding:24px;">
        <div style="font-size:18px;color:#fff;margin-bottom:8px;">All Clear</div>
        <div style="font-size:14px;color:#888;">No issues requiring attention at the ${report.revenueLevel} threshold level.</div>
      </div>
    </div>
    `}

    ${report.decisions.length > report.filteredDecisions.length ? `
    <div class="section">
      <h2 class="section-title">Lower Priority (${report.decisions.length - report.filteredDecisions.length} items)</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-radius:12px;padding:24px;">
        <div style="font-size:14px;color:#888;margin-bottom:16px;">
          These issues are below the urgency threshold for ${client.brandName}'s revenue level (${report.revenueLevel}).
        </div>
        ${report.decisions.filter(d => !report.filteredDecisions.includes(d)).map(d => `
          <div style="padding:12px 0;border-bottom:1px solid #2a2a2a;">
            <span style="color:#666;font-size:12px;">[${d.urgency}]</span>
            <span style="color:#aaa;margin-left:8px;">${d.type.replace(/_/g, ' ')}: ${d.targetName}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Summary</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value">${report.decisions.length}</div>
          <div class="summary-label">Total Issues Detected</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${report.filteredDecisions.length}</div>
          <div class="summary-label">Above Urgency Threshold</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">₹${(report.oosReport?.verifiedWastedSpend || 0).toLocaleString('en-IN')}</div>
          <div class="summary-label">OOS Wasted Spend</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">₹${(report.leakageReport?.totalRevenueLeakage || 0).toLocaleString('en-IN')}</div>
          <div class="summary-label">Discount Leakage</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>`;
}
