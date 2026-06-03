import { getDbAdapter } from '../../db/adapter.js';
import { decryptToken } from '../token-crypto.js';
import { MetaApiService } from '../meta-api.js';
import { notifyAlert } from '../notifications.js';
import { v4 as uuidv4 } from 'uuid';
import { buildContextWindow, recordDecisionEpisode } from '../agent-memory.js';
import type { MetaTokenRow, ShopifyTokenRow, UserRow } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { runOOSCheck } from '../oos-detector.js';
import { runDiscountLeakageCheck } from '../discount-leakage-detector.js';
import { quickCohortLTVCheck } from '../cohort-ltv-analyzer.js';
import { analyzeTopAdVisuals, type AdForAnalysis } from '../visual-analyzer.js';
import { runCommentMining } from '../comment-mining-agent.js';
import { generateStrategicIntelligence } from '../strategic-intelligence-engine.js';
import { filterDecisions } from '../quality-gate.js';
import { saveRecommendation } from '../intelligence-persistence.js';
import { trackRecommendation } from '../reality-testing.js';
// CLOSED-LOOP OPERATING SYSTEM: Track recommendations with predictions
import { agentRecommend } from '../recommendation-loop.js';
import { gatherAccountSnapshot, getPastDecisions } from './snapshot.js';
import { reasonAboutPerformance } from './reasoning.js';
import { checkOutcomes } from './execution.js';
import { gatherCreativeAnalysis } from './creative-analysis.js';
import { mapDecisionTypeToRecommendationType, parseEstimatedImpact } from './decision-helpers.js';

/* ------------------------------------------------------------------ */
/*  Main: run watchdog for all users                                   */
/* ------------------------------------------------------------------ */

export async function runWatchdog(): Promise<{ runs: number; decisions: number }> {
  const db = getDbAdapter();
  const users = await db.all<Pick<UserRow, 'id' | 'plan' | 'name'>>(`
    SELECT u.id, u.plan, u.name FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `);

  let totalRuns = 0;
  let totalDecisions = 0;

  for (const user of users) {
    try {
      const tokenRow = await db.get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [user.id]);
      if (!tokenRow) continue;
      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        logger.warn(`[Watchdog] Skipping user ${user.id}: Meta token expired`);
        continue;
      }

      const token = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(token);

      const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'id,name', limit: '50' });
      const accounts = accountsResp.data || [];

      // Process accounts with bounded concurrency (#11)
      const ACCOUNT_CONCURRENCY = 3;
      for (let i = 0; i < accounts.length; i += ACCOUNT_CONCURRENCY) {
        const batch = accounts.slice(i, i + ACCOUNT_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async (account: any) => {
            const runId = uuidv4();

            await db.run(`
              INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
              VALUES (?, 'watchdog', ?, 'running', datetime('now'))
            `, [runId, user.id]);

            try {
              const snapshot = await gatherAccountSnapshot(meta, account.id);
              const pastDecisions = await getPastDecisions(user.id, account.id);
              const memoryContext = await buildContextWindow(user.id, 'watchdog', {
                maxEpisodes: 10,
                entityTypes: ['campaign', 'adset', 'metric'],
              });

              // Pass user.id as clientId for intelligence integration
              const decisions = await reasonAboutPerformance(user.id, snapshot, pastDecisions, memoryContext, user.id);

              // OOS Detection + Discount Leakage Detection (requires Shopify connection)
              const shopifyRow = await db.get<ShopifyTokenRow>('SELECT * FROM shopify_tokens WHERE user_id = ?', [user.id]);
              if (shopifyRow) {
                const shopifyToken = decryptToken(shopifyRow.encrypted_access_token);

                // OOS Detection: Check for ads spending on out-of-stock products
                try {
                  const oosResult = await runOOSCheck({
                    shopDomain: shopifyRow.shop_domain,
                    shopifyToken,
                    metaAccountId: account.id,
                    metaToken: token,
                    days: 7,
                  });

                  if (oosResult.hasIssues && oosResult.wastedSpend > 100) {
                    const topAd = oosResult.topMatches[0];
                    decisions.push({
                      type: 'oos_wasted_spend',
                      targetId: topAd?.adId || account.id,
                      targetName: topAd ? `${topAd.adName} → ${topAd.productTitle}` : 'Multiple ads',
                      reasoning: oosResult.summary,
                      confidence: 'high',
                      urgency: oosResult.wastedSpend > 1000 ? 'high' : 'medium',
                      suggestedAction: 'pause',
                      estimatedImpact: `Save Rs ${oosResult.wastedSpend.toFixed(0)}/week`,
                    });
                  }
                } catch (oosErr: any) {
                  logger.warn({ err: oosErr.message }, '[Watchdog] OOS check failed, continuing');
                }

                // Discount Leakage Detection: Check for leaked discount codes
                try {
                  const brandName = snapshot.accountName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
                  if (brandName) {
                    const leakageResult = await runDiscountLeakageCheck({
                      shopDomain: shopifyRow.shop_domain,
                      shopifyToken,
                      brandName,
                      userId: user.id,
                      skipRevenueImpact: false,
                    });

                    if (leakageResult.success && leakageResult.report && leakageResult.report.leakedCodes.length > 0) {
                      const report = leakageResult.report;
                      decisions.push({
                        type: 'discount_leakage',
                        targetId: 'discount_codes',
                        targetName: `${report.leakedCodes.length} leaked discount codes`,
                        reasoning: `Found ${report.leakedCodes.length} discount codes leaked on coupon sites. Codes: ${report.leakedCodes.slice(0, 3).map(l => l.code).join(', ')}${report.leakedCodes.length > 3 ? '...' : ''}. Estimated revenue leakage: Rs ${report.totalRevenueLeakage.toLocaleString()}`,
                        confidence: 'high',
                        urgency: report.severity === 'critical' ? 'critical' : report.severity === 'high' ? 'high' : 'medium',
                        suggestedAction: 'monitor',
                        estimatedImpact: `Rs ${report.totalRevenueLeakage.toLocaleString()} leaked this month`,
                      });
                    }
                  }
                } catch (leakageErr: any) {
                  logger.warn({ err: leakageErr.message }, '[Watchdog] Discount leakage check failed, continuing');
                }

                // Cohort LTV Analysis: Check for channel LTV gaps
                try {
                  const ltvResult = await quickCohortLTVCheck(user.id);

                  if (ltvResult && ltvResult.hasSignificantGap && ltvResult.topAction) {
                    const action = ltvResult.topAction;
                    decisions.push({
                      type: 'channel_ltv_gap',
                      targetId: 'budget_allocation',
                      targetName: `${ltvResult.bestChannel} vs ${ltvResult.worstChannel}`,
                      reasoning: `${action.insight} ${action.action}`,
                      confidence: action.priority === 'high' ? 'high' : 'moderate',
                      urgency: action.priority === 'high' ? 'medium' : 'low',
                      suggestedAction: action.type === 'budget_shift' ? 'increase_budget' : 'monitor',
                      estimatedImpact: action.expectedImpact,
                    });
                  }
                } catch (ltvErr: any) {
                  logger.warn({ err: ltvErr.message }, '[Watchdog] Cohort LTV check failed, continuing');
                }
              }

              // === QUALITY GATE: Filter out obvious/non-strategic decisions ===
              const qualityFiltered = filterDecisions(
                decisions.map(d => ({
                  type: d.type,
                  reasoning: d.reasoning,
                  suggestedAction: d.suggestedAction,
                  targetName: d.targetName,
                  basedOn: [], // Decisions from AI don't track this yet
                })),
                { minScore: 55, requireSynthesis: true, allowObvious: false }
              );

              // Map back to original decisions that passed
              const passedDecisions = decisions.filter(d =>
                qualityFiltered.passed.some(p => p.targetName === d.targetName && p.type === d.type)
              );

              if (qualityFiltered.stats.filtered > 0) {
                logger.info({
                  total: qualityFiltered.stats.total,
                  passed: qualityFiltered.stats.passed,
                  filtered: qualityFiltered.stats.filtered,
                  accountId: account.id,
                }, '[Watchdog] Quality gate filtered non-strategic decisions');
              }

              for (const decision of passedDecisions) {
                const decisionId = uuidv4();
                await db.run(`
                  INSERT INTO agent_decisions (id, run_id, user_id, account_id, type, target_id, target_name,
                    reasoning, confidence, urgency, suggested_action, estimated_impact, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `, [
                  decisionId, runId, user.id, account.id,
                  decision.type, decision.targetId, decision.targetName,
                  decision.reasoning, decision.confidence, decision.urgency,
                  decision.suggestedAction, decision.estimatedImpact,
                ]);

                // Persist to intelligence layer for reality testing
                try {
                  const tracked = trackRecommendation(
                    user.id,
                    decision.type,
                    decision.targetName,
                    decision.reasoning,
                    decision.confidence === 'high' ? 0.9 : decision.confidence === 'moderate' ? 0.7 : 0.5,
                    decision.urgency
                  );
                  saveRecommendation(tracked);
                } catch (err) {
                  logger.warn({ err }, '[Watchdog] Intelligence persistence failed');
                }

                // === CLOSED-LOOP OPERATING SYSTEM ===
                // Track recommendation with prediction for validation
                try {
                  const recType = mapDecisionTypeToRecommendationType(decision.type);
                  const predictedSavings = parseEstimatedImpact(decision.estimatedImpact);

                  await agentRecommend(user.id, 'watchdog', {
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
                  logger.warn({ err: loopErr }, '[Watchdog] Closed-loop tracking failed');
                }
              }

              // Record episodes (fire-and-forget, no blocking Haiku calls)
              for (const decision of passedDecisions) {
                recordDecisionEpisode(user.id, 'watchdog', {
                  type: decision.type,
                  targetName: decision.targetName,
                  suggestedAction: decision.suggestedAction,
                  reasoning: decision.reasoning,
                }).catch((err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordDecisionEpisode failed in ad-watchdog'));
              }

              const summary = passedDecisions.length > 0
                ? `Found ${passedDecisions.length} strategic recommendations: ${passedDecisions.map(d => d.suggestedAction).join(', ')}${qualityFiltered.stats.filtered > 0 ? ` (${qualityFiltered.stats.filtered} obvious insights filtered)` : ''}`
                : 'No action needed — account performing within expectations';

              await db.run(`
                UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
                summary = ?, raw_context = ?
                WHERE id = ?
              `, [summary, JSON.stringify(snapshot), runId]);

              // Store creative-level analysis for other agents (static-ad-generator, etc.)
              try {
                await gatherCreativeAnalysis(meta, account.id, user.id);
              } catch (creativeErr: any) {
                logger.warn({ err: creativeErr.message }, '[Watchdog] Creative analysis failed, continuing');
              }

              // Visual analysis of top-performing ads (stores in dna_cache for static-ad-generator)
              try {
                // Get top ads for visual analysis
                const topAdsForVisual: AdForAnalysis[] = snapshot.campaigns
                  .flatMap(c => {
                    // Find ads in this campaign from the creative_analysis we just stored
                    return [{
                      id: c.name, // Using campaign name as proxy - will be matched later
                      name: c.name,
                      spend: c.spend,
                      roas: c.roas,
                      ctr: c.ctr,
                      thumbnail_url: '', // Will be fetched by visual analyzer
                      video_id: null,
                    }];
                  })
                  .filter(a => a.spend > 500 && a.roas > 1);

                if (topAdsForVisual.length > 0) {
                  // Fetch actual ad data with thumbnails for visual analysis
                  const adsResp = await meta.get<any>(`/${account.id}/ads`, {
                    fields: 'id,name,creative{thumbnail_url,video_id},insights.date_preset(last_7d){spend,impressions,clicks,ctr,purchase_roas}',
                    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
                    limit: '50',
                  });

                  const adsForAnalysis: AdForAnalysis[] = (adsResp.data || [])
                    .map((ad: any) => {
                      const insights = ad.insights?.data?.[0] || {};
                      return {
                        id: ad.id,
                        name: ad.name,
                        spend: parseFloat(insights.spend) || 0,
                        roas: parseFloat(insights.purchase_roas?.[0]?.value) || 0,
                        ctr: parseFloat(insights.ctr) || 0,
                        thumbnail_url: ad.creative?.thumbnail_url || '',
                        video_id: ad.creative?.video_id || null,
                      };
                    })
                    .filter((a: AdForAnalysis) => a.thumbnail_url || a.video_id);

                  if (adsForAnalysis.length > 0) {
                    const visualResults = await analyzeTopAdVisuals(adsForAnalysis, account.id, meta);
                    logger.info({
                      accountId: account.id,
                      adsAnalyzed: visualResults.size,
                    }, '[Watchdog] Visual analysis complete - stored in dna_cache');
                  }
                }
              } catch (visualErr: any) {
                logger.warn({ err: visualErr.message }, '[Watchdog] Visual analysis failed, continuing');
              }

              // Comment Mining: Extract creative concepts from ad comments
              try {
                const brandName = snapshot.accountName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
                if (brandName) {
                  const commentReport = await runCommentMining(user.id, {
                    metaToken: token,
                    metaAccountId: account.id,
                    brandName,
                    brandCategory: 'fashion', // Default, could be detected from products
                  });

                  if (commentReport.totalComments > 0) {
                    logger.info({
                      accountId: account.id,
                      commentsAnalyzed: commentReport.totalComments,
                      conceptsGenerated: commentReport.creativeConcepts.length,
                      topObjections: commentReport.categories.objection,
                    }, '[Watchdog] Comment mining complete');

                    // Add decision if urgent insights found
                    if (commentReport.urgentInsights.length > 0 || commentReport.categories.frustration > commentReport.totalComments * 0.15) {
                      decisions.push({
                        type: 'comment_insight',
                        targetId: 'comment_analysis',
                        targetName: `${commentReport.creativeConcepts.length} creative concepts from comments`,
                        reasoning: commentReport.urgentInsights[0] || `Found ${commentReport.categories.objection} objections and ${commentReport.categories.frustration} frustrations to address`,
                        confidence: 'moderate',
                        urgency: commentReport.categories.frustration > commentReport.totalComments * 0.2 ? 'high' : 'medium',
                        suggestedAction: 'new_creative',
                        estimatedImpact: `${commentReport.creativeConcepts.length} ad concepts ready to test`,
                      });
                    }

                    // Strategic Intelligence: Generate strategic direction from comment patterns
                    try {
                      // Map comment patterns to strategic signal inputs
                      const commentSignals = commentReport.topPatterns.slice(0, 15).map(p => ({
                        pattern: p.pattern,
                        category: p.category,
                        frequency: p.frequency,
                        sentiment: p.category === 'praise' ? 'positive' : p.category === 'frustration' ? 'negative' : 'neutral',
                        examples: p.exampleComments.slice(0, 3),
                      }));

                      // Build performance signals from snapshot
                      const performanceSignals = {
                        overallROAS: snapshot.week.roas,
                        roasTrend: (snapshot.week.roas > snapshot.month.roas * 1.1 ? 'improving' :
                                   snapshot.week.roas < snapshot.month.roas * 0.9 ? 'declining' : 'stable') as 'improving' | 'stable' | 'declining',
                        cacTrend: (snapshot.week.cpa < snapshot.month.cpa * 0.9 ? 'improving' :
                                  snapshot.week.cpa > snapshot.month.cpa * 1.1 ? 'increasing' : 'stable') as 'improving' | 'stable' | 'increasing',
                        topCreativeType: 'static', // Could be detected from creative_analysis
                      };

                      const strategicOutput = generateStrategicIntelligence(user.id, {
                        commentSignals,
                        fatigueSignals: [], // Would need fatigue-detector data
                        performanceSignals,
                        competitorGaps: [], // Would need competitor-intel data
                        categoryContext: { name: brandName, pricePoint: 'premium' },
                      });

                      // Add strategic risk decisions
                      for (const risk of strategicOutput.risks.filter(r => r.severity === 'critical' || r.severity === 'high')) {
                        decisions.push({
                          type: 'strategic_risk',
                          targetId: risk.id,
                          targetName: `Strategic Risk: ${risk.riskType}`,
                          reasoning: risk.strategicImplication,
                          confidence: risk.severity === 'critical' ? 'high' : 'moderate',
                          urgency: risk.severity === 'critical' ? 'critical' : 'high',
                          suggestedAction: 'monitor',
                          estimatedImpact: risk.businessImpact,
                        });
                      }

                      logger.info({
                        accountId: account.id,
                        risks: strategicOutput.risks.length,
                        opportunities: strategicOutput.opportunities.length,
                      }, '[Watchdog] Strategic intelligence complete');
                    } catch (stratErr: any) {
                      logger.warn({ err: stratErr.message }, '[Watchdog] Strategic intelligence failed, continuing');
                    }
                  }
                }
              } catch (commentErr: any) {
                logger.warn({ err: commentErr.message }, '[Watchdog] Comment mining failed, continuing');
              }

              if (passedDecisions.length > 0) {
                const briefingContent = passedDecisions.map(d =>
                  `*${d.type}* — ${d.targetName}\n${d.reasoning}\nAction: ${d.suggestedAction} | Urgency: ${d.urgency}`
                ).join('\n\n');

                notifyAlert(user.id, {
                  type: 'watchdog_briefing',
                  title: `Ad Watchdog: ${passedDecisions.length} recommendation${passedDecisions.length > 1 ? 's' : ''} for ${snapshot.accountName}`,
                  content: briefingContent,
                  severity: passedDecisions.some(d => d.urgency === 'critical') ? 'critical' : 'warning',
                  accountId: account.id,
                }).catch(err => logger.error({ err: err.message }, '[Watchdog] Notification failed'));
              }

              return { decisions: passedDecisions.length };
            } catch (err: any) {
              await db.run(`
                UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
                summary = ? WHERE id = ?
              `, [`Error: ${err.message}`, runId]);
              logger.error({ err: err.message }, `[Watchdog] Failed for account ${account.id}`);
              return { decisions: 0 };
            }
          })
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            totalRuns++;
            totalDecisions += result.value.decisions;
          }
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message }, `[Watchdog] Failed for user ${user.id}`);
    }
  }

  // Check outcomes of past decisions
  try {
    const outcomeCount = await checkOutcomes();
    if (outcomeCount > 0) {
      logger.info(`[Watchdog] Checked outcomes for ${outcomeCount} past decisions`);
    }
  } catch (err: any) {
    logger.error({ err: err.message }, '[Watchdog] Outcome check failed');
  }

  return { runs: totalRuns, decisions: totalDecisions };
}
