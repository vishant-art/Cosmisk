/**
 * Client Portal Routes
 *
 * Simple password-protected portal for clients to view their past reports.
 * Uses basic auth with client-specific passwords stored in service_clients table.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { getRecentReports, getRecommendationHistory, getPredictionAccuracy } from '../services/strategic-memory.js';
import crypto from 'crypto';

// Properties populated by the basicAuth preHandler below.
declare module 'fastify' {
  interface FastifyRequest {
    clientId?: string;
    brandName?: string;
  }
}

// Simple basic auth middleware
async function basicAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    reply.header('WWW-Authenticate', 'Basic realm="Client Portal"');
    reply.status(401).send('Authentication required');
    return;
  }

  const base64Credentials = authHeader.slice(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [clientId, password] = credentials.split(':');

  const db = getDb();
  const client = db.prepare(`
    SELECT id, brand_name, portal_password_hash FROM service_clients WHERE id = ?
  `).get(clientId) as { id: string; brand_name: string; portal_password_hash?: string } | undefined;

  if (!client) {
    reply.header('WWW-Authenticate', 'Basic realm="Client Portal"');
    reply.status(401).send('Invalid credentials');
    return;
  }

  // If no password set, use a default (brand_name + "2026")
  const expectedHash = client.portal_password_hash ||
    crypto.createHash('sha256').update(`${client.brand_name.toLowerCase().replace(/\s/g, '')}2026`).digest('hex');

  const providedHash = crypto.createHash('sha256').update(password).digest('hex');

  if (providedHash !== expectedHash) {
    reply.header('WWW-Authenticate', 'Basic realm="Client Portal"');
    reply.status(401).send('Invalid credentials');
    return;
  }

  // Store client info for later use
  request.clientId = client.id;
  request.brandName = client.brand_name;
}

export async function clientPortalRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /portal
   * Main portal page - shows client's report history
   */
  app.get('/portal', { preHandler: basicAuth }, async (request, reply) => {
    // Set by the basicAuth preHandler; guaranteed present here.
    const clientId = request.clientId ?? '';
    const brandName = request.brandName ?? '';

    try {
      const reports = getRecentReports(clientId, 20);
      const recommendations = getRecommendationHistory(clientId, 10);
      const accuracy = getPredictionAccuracy(clientId);

      const html = generatePortalHTML(brandName, reports, recommendations, accuracy);

      reply.header('Content-Type', 'text/html');
      return reply.send(html);
    } catch (err) {
      logger.error({ err, clientId }, '[Portal] Failed to load portal');
      return reply.status(500).send('Failed to load portal');
    }
  });

  /**
   * GET /portal/report/:reportId
   * View a specific report
   */
  app.get<{ Params: { reportId: string } }>('/portal/report/:reportId', { preHandler: basicAuth }, async (request, reply) => {
    // Set by the basicAuth preHandler; guaranteed present here.
    const clientId = request.clientId ?? '';
    const brandName = request.brandName ?? '';
    const { reportId } = request.params;

    try {
      const db = getDb();
      const report = db.prepare(`
        SELECT data_json FROM strategic_reports WHERE id = ? AND client_id = ?
      `).get(reportId, clientId) as { data_json: string } | undefined;

      if (!report) {
        return reply.status(404).send('Report not found');
      }

      const reportData = JSON.parse(report.data_json);
      const html = generateReportDetailHTML(brandName, reportData);

      reply.header('Content-Type', 'text/html');
      return reply.send(html);
    } catch (err) {
      logger.error({ err, clientId, reportId }, '[Portal] Failed to load report');
      return reply.status(500).send('Failed to load report');
    }
  });
}

function generatePortalHTML(
  brandName: string,
  reports: any[],
  recommendations: any[],
  accuracy: { total: number; correct: number; accuracy: number }
): string {
  const reportRows = reports.map(r => `
    <tr>
      <td>${new Date(r.generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td><span class="badge ${r.reportType}">${r.reportType}</span></td>
      <td>${r.headline || 'No headline'}</td>
      <td><span class="ship-badge ${r.wasShipped ? 'shipped' : 'held'}">${r.shipDecision}</span></td>
      <td><a href="/portal/report/${r.id}" class="view-btn">View</a></td>
    </tr>
  `).join('');

  const recRows = recommendations.slice(0, 5).map(r => `
    <tr>
      <td>${new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
      <td>${r.recommendation?.slice(0, 60) || 'N/A'}...</td>
      <td><span class="status-badge ${r.status}">${r.status}</span></td>
      <td>${r.actualOutcome || '-'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} - Intelligence Portal | Smashed Agency</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.6;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header {
      text-align: center;
      padding: 40px 20px;
      border-bottom: 1px solid #222;
      margin-bottom: 40px;
    }
    .logo { font-size: 12px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 16px; }
    h1 { font-size: 32px; font-weight: 700; color: #fff; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #888; }

    /* Stats */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .stat-card {
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
    }
    .stat-value { font-size: 36px; font-weight: 700; color: #EC8A23; }
    .stat-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; }

    /* Sections */
    .section { margin-bottom: 40px; }
    .section-title {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 20px;
      padding-left: 16px;
      border-left: 3px solid #EC8A23;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      background: #151515;
      border-radius: 12px;
      overflow: hidden;
    }
    th, td {
      padding: 16px;
      text-align: left;
      border-bottom: 1px solid #2a2a2a;
    }
    th {
      background: #1a1a1a;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #888;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: #1a1a1a; }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.watchdog { background: #3b82f6; color: #fff; }
    .badge.comment-mining { background: #8b5cf6; color: #fff; }
    .badge.strategic-intelligence { background: #ec4899; color: #fff; }
    .badge.elite-intelligence { background: #f59e0b; color: #fff; }

    .ship-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .ship-badge.shipped { background: #22c55e; color: #fff; }
    .ship-badge.held { background: #6b7280; color: #fff; }

    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .status-badge.pending { background: #f59e0b; color: #000; }
    .status-badge.implemented { background: #22c55e; color: #fff; }
    .status-badge.rejected { background: #ef4444; color: #fff; }
    .status-badge.in_progress { background: #3b82f6; color: #fff; }

    .view-btn {
      display: inline-block;
      padding: 6px 16px;
      background: #EC8A23;
      color: #000;
      text-decoration: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .view-btn:hover { background: #f5a623; }

    /* Footer */
    .footer {
      text-align: center;
      padding: 40px 20px;
      border-top: 1px solid #222;
      margin-top: 60px;
      font-size: 12px;
      color: #666;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #666;
    }
    .empty-state svg { width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Smashed Intelligence</div>
      <h1>${brandName}</h1>
      <div class="subtitle">Your Intelligence Portal</div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${reports.length}</div>
        <div class="stat-label">Total Reports</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${reports.filter(r => r.wasShipped).length}</div>
        <div class="stat-label">Shipped Reports</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${recommendations.filter(r => r.status === 'implemented').length}</div>
        <div class="stat-label">Implemented</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${accuracy.total > 0 ? Math.round(accuracy.accuracy) : '-'}%</div>
        <div class="stat-label">Prediction Accuracy</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Recent Reports</div>
      ${reports.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Headline</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${reportRows}
        </tbody>
      </table>
      ` : `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>No reports yet. Check back after your first intelligence run.</p>
      </div>
      `}
    </div>

    <div class="section">
      <div class="section-title">Recent Recommendations</div>
      ${recommendations.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Recommendation</th>
            <th>Status</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          ${recRows}
        </tbody>
      </table>
      ` : `
      <div class="empty-state">
        <p>No recommendations yet.</p>
      </div>
      `}
    </div>

    <div class="footer">
      Powered by Smashed Intelligence Layer<br>
      Questions? Contact your account manager.
    </div>
  </div>
</body>
</html>`;
}

function generateReportDetailHTML(brandName: string, report: any): string {
  const insights = report.keyInsights || [];
  const recommendations = report.recommendations || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.headline || 'Report'} | ${brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.6;
      min-height: 100vh;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }

    .back-link {
      display: inline-block;
      color: #EC8A23;
      text-decoration: none;
      margin-bottom: 30px;
      font-size: 14px;
    }
    .back-link:hover { text-decoration: underline; }

    .header {
      padding: 40px;
      background: #151515;
      border-radius: 16px;
      margin-bottom: 30px;
    }
    .meta {
      display: flex;
      gap: 20px;
      margin-bottom: 16px;
      font-size: 12px;
      color: #888;
    }
    .meta span { display: flex; align-items: center; gap: 6px; }
    h1 { font-size: 28px; font-weight: 700; color: #fff; line-height: 1.3; }

    .section {
      background: #151515;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #EC8A23;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }

    .insight-list { list-style: none; }
    .insight-list li {
      padding: 12px 0;
      border-bottom: 1px solid #2a2a2a;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .insight-list li:last-child { border-bottom: none; }
    .insight-list li::before {
      content: '';
      width: 8px;
      height: 8px;
      background: #EC8A23;
      border-radius: 50%;
      margin-top: 8px;
      flex-shrink: 0;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 16px;
    }
    .metric {
      text-align: center;
      padding: 16px;
      background: #1a1a1a;
      border-radius: 8px;
    }
    .metric-value { font-size: 24px; font-weight: 700; color: #EC8A23; }
    .metric-label { font-size: 11px; color: #888; text-transform: uppercase; margin-top: 4px; }

    .footer {
      text-align: center;
      padding: 40px 20px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/portal" class="back-link">&larr; Back to Portal</a>

    <div class="header">
      <div class="meta">
        <span>${new Date(report.generatedAt).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
        <span>Week ${report.weekNumber}</span>
        <span>Quality: ${report.qualityScore}/100</span>
      </div>
      <h1>${report.headline || 'Intelligence Report'}</h1>
    </div>

    ${insights.length > 0 ? `
    <div class="section">
      <div class="section-title">Key Insights</div>
      <ul class="insight-list">
        ${insights.map((i: string) => `<li>${i}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${recommendations.length > 0 ? `
    <div class="section">
      <div class="section-title">Recommendations</div>
      <ul class="insight-list">
        ${recommendations.map((r: string) => `<li>${r}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${report.metricsSnapshot ? `
    <div class="section">
      <div class="section-title">Metrics Snapshot</div>
      <div class="metrics-grid">
        ${Object.entries(report.metricsSnapshot).map(([key, value]) => `
          <div class="metric">
            <div class="metric-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div class="metric-label">${key.replace(/([A-Z])/g, ' $1').trim()}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="footer">
      Report ID: ${report.id}<br>
      Generated by Smashed Intelligence Layer
    </div>
  </div>
</body>
</html>`;
}
