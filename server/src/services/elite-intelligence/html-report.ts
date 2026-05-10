/**
 * Elite Intelligence - HTML Report Generator
 *
 * Client-facing HTML reports with Smashed Agency branding.
 */

import { EliteIntelligenceOutput } from './types.js';

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
<style>
  :root {
    --primary: #6366f1;
    --primary-dark: #4f46e5;
    --success: #10b981;
    --warning: #f59e0b;
    --danger: #ef4444;
    --critical: #dc2626;
    --gray-50: #f9fafb;
    --gray-100: #f3f4f6;
    --gray-200: #e5e7eb;
    --gray-300: #d1d5db;
    --gray-500: #6b7280;
    --gray-700: #374151;
    --gray-900: #111827;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--gray-50);
    color: var(--gray-900);
    line-height: 1.6;
  }

  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 40px;
    padding-bottom: 30px;
    border-bottom: 1px solid var(--gray-200);
  }

  .logo {
    font-size: 24px;
    font-weight: 700;
    color: var(--primary);
    letter-spacing: -0.5px;
    margin-bottom: 8px;
  }

  .report-title {
    font-size: 32px;
    font-weight: 700;
    color: var(--gray-900);
    margin-bottom: 8px;
  }

  .report-meta {
    color: var(--gray-500);
    font-size: 14px;
  }

  .confidence-badge {
    display: inline-block;
    background: var(--primary);
    color: white;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    margin-top: 12px;
  }

  /* Cards */
  .card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    margin-bottom: 24px;
    overflow: hidden;
  }

  .card-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--gray-100);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .card-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }

  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--gray-900);
  }

  .card-body {
    padding: 20px;
  }

  /* The One Thing */
  .one-thing-card {
    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
    color: white;
  }

  .one-thing-card .card-header {
    border-bottom-color: rgba(255,255,255,0.1);
  }

  .one-thing-card .card-icon {
    background: rgba(255,255,255,0.2);
  }

  .one-thing-card .card-title {
    color: white;
  }

  .one-thing-statement {
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 20px;
    line-height: 1.4;
  }

  .one-thing-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }

  .one-thing-metric {
    background: rgba(255,255,255,0.1);
    padding: 12px;
    border-radius: 8px;
  }

  .one-thing-metric-label {
    font-size: 12px;
    opacity: 0.8;
    margin-bottom: 4px;
  }

  .one-thing-metric-value {
    font-size: 18px;
    font-weight: 600;
  }

  .cascade-effect {
    background: rgba(255,255,255,0.1);
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    border-left: 3px solid rgba(255,255,255,0.5);
  }

  /* Health Grid */
  .health-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
  }

  .health-item {
    text-align: center;
    padding: 16px 8px;
    background: var(--gray-50);
    border-radius: 8px;
  }

  .health-label {
    font-size: 11px;
    color: var(--gray-500);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .health-status {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .health-healthy { background: #d1fae5; color: #065f46; }
  .health-stressed { background: #fef3c7; color: #92400e; }
  .health-degrading { background: #fed7aa; color: #9a3412; }
  .health-critical { background: #fee2e2; color: #991b1b; }

  /* Psychology */
  .psychology-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .psychology-item {
    padding: 16px;
    background: var(--gray-50);
    border-radius: 8px;
  }

  .psychology-label {
    font-size: 12px;
    color: var(--gray-500);
    margin-bottom: 6px;
  }

  .psychology-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--gray-900);
  }

  .trust-eroding { color: var(--warning); }
  .trust-contaminated { color: var(--danger); }
  .trust-fragile { color: #f97316; }
  .trust-stable { color: var(--success); }
  .trust-strong { color: #059669; }

  /* Blockers */
  .blocker-list {
    list-style: none;
  }

  .blocker-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--gray-100);
  }

  .blocker-item:last-child {
    border-bottom: none;
  }

  .blocker-severity {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .severity-critical { background: #fee2e2; color: #991b1b; }
  .severity-high { background: #fed7aa; color: #9a3412; }
  .severity-moderate { background: #fef3c7; color: #92400e; }
  .severity-low { background: #d1fae5; color: #065f46; }

  .blocker-content {
    flex: 1;
  }

  .blocker-name {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .blocker-strategy {
    font-size: 13px;
    color: var(--gray-500);
  }

  /* Predictions */
  .prediction-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: var(--gray-50);
    border-radius: 8px;
    margin-bottom: 12px;
  }

  .prediction-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .prediction-negative { background: #fee2e2; }
  .prediction-positive { background: #d1fae5; }

  .prediction-content {
    flex: 1;
  }

  .prediction-metric {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .prediction-detail {
    font-size: 13px;
    color: var(--gray-500);
  }

  .prediction-confidence {
    text-align: right;
  }

  .prediction-confidence-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--primary);
  }

  .prediction-confidence-label {
    font-size: 11px;
    color: var(--gray-500);
  }

  /* Playbook */
  .playbook-section {
    margin-bottom: 20px;
  }

  .playbook-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--gray-700);
  }

  .playbook-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .dot-immediate { background: var(--danger); }
  .dot-week { background: var(--warning); }
  .dot-month { background: var(--success); }

  .playbook-list {
    list-style: none;
    padding-left: 18px;
  }

  .playbook-item {
    position: relative;
    padding: 8px 0 8px 16px;
    font-size: 14px;
    color: var(--gray-700);
  }

  .playbook-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 14px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gray-300);
  }

  /* Contradictions */
  .contradiction-card {
    background: #fffbeb;
    border: 1px solid #fcd34d;
  }

  .contradiction-conflict {
    font-weight: 600;
    margin-bottom: 12px;
    color: #92400e;
  }

  .contradiction-explanations {
    margin-bottom: 12px;
  }

  .contradiction-explanations-title {
    font-size: 12px;
    color: var(--gray-500);
    margin-bottom: 6px;
  }

  .contradiction-list {
    list-style: disc;
    padding-left: 20px;
    font-size: 14px;
    color: var(--gray-700);
  }

  .contradiction-steps {
    background: white;
    padding: 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .contradiction-steps-title {
    font-size: 11px;
    color: var(--gray-500);
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  /* Confidence */
  .confidence-bar {
    height: 8px;
    background: var(--gray-200);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .confidence-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 4px;
  }

  .insights-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .insights-section {
    padding: 12px;
    background: var(--gray-50);
    border-radius: 8px;
  }

  .insights-title {
    font-size: 12px;
    color: var(--gray-500);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .insights-list {
    font-size: 13px;
    color: var(--gray-700);
  }

  .insights-list li {
    margin-bottom: 4px;
  }

  /* Footer */
  .footer {
    text-align: center;
    padding-top: 30px;
    margin-top: 40px;
    border-top: 1px solid var(--gray-200);
    color: var(--gray-500);
    font-size: 13px;
  }

  .footer-logo {
    font-weight: 600;
    color: var(--primary);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .one-thing-grid { grid-template-columns: 1fr; }
    .health-grid { grid-template-columns: repeat(3, 1fr); }
    .psychology-grid { grid-template-columns: 1fr; }
    .insights-grid { grid-template-columns: 1fr; }
  }
</style>
`;

// ============================================================================
// HTML GENERATOR
// ============================================================================

export function generateHTMLReport(output: EliteIntelligenceOutput): string {
  const generatedDate = new Date(output.generatedAt).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elite Intelligence Report - ${output.clientId}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  ${STYLES}
</head>
<body>
  <div class="container">
    ${generateHeader(output, generatedDate)}
    ${generateTheOneThing(output)}
    ${generateSystemHealth(output)}
    ${generatePsychology(output)}
    ${generateBlockers(output)}
    ${generatePredictions(output)}
    ${generatePlaybook(output)}
    ${generateContradictions(output)}
    ${generateConfidenceReport(output)}
    ${generateFooter()}
  </div>
</body>
</html>`;
}

function generateHeader(output: EliteIntelligenceOutput, date: string): string {
  return `
    <header class="header">
      <div class="logo">SMASHED</div>
      <h1 class="report-title">Elite Intelligence Report</h1>
      <p class="report-meta">${date}</p>
      <span class="confidence-badge">${Math.round(output.confidenceReport.overallConfidence)}% Confidence</span>
    </header>
  `;
}

function generateTheOneThing(output: EliteIntelligenceOutput): string {
  const { theOneThing } = output;
  return `
    <div class="card one-thing-card">
      <div class="card-header">
        <div class="card-icon">🎯</div>
        <h2 class="card-title">THE ONE THING</h2>
      </div>
      <div class="card-body">
        <p class="one-thing-statement">${theOneThing.statement}</p>

        <div class="one-thing-grid">
          <div class="one-thing-metric">
            <div class="one-thing-metric-label">Metric Improved</div>
            <div class="one-thing-metric-value">${theOneThing.impact.metricImproved}</div>
          </div>
          <div class="one-thing-metric">
            <div class="one-thing-metric-label">Expected Impact</div>
            <div class="one-thing-metric-value">${theOneThing.impact.estimatedImprovement}</div>
          </div>
          <div class="one-thing-metric">
            <div class="one-thing-metric-label">Timeline</div>
            <div class="one-thing-metric-value">${theOneThing.impact.timeToImpact}</div>
          </div>
        </div>

        <div class="cascade-effect">
          💡 ${theOneThing.reasoning.cascadeEffect}
        </div>
      </div>
    </div>
  `;
}

function generateSystemHealth(output: EliteIntelligenceOutput): string {
  const health = output.systemicAnalysis.healthScores;

  const getHealthClass = (status: string) => `health-${status}`;
  const formatStatus = (status: string) => status.toUpperCase();

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon" style="background: var(--gray-100);">📊</div>
        <h2 class="card-title">System Health</h2>
      </div>
      <div class="card-body">
        <div class="health-grid">
          <div class="health-item">
            <div class="health-label">Acquisition</div>
            <span class="health-status ${getHealthClass(health.acquisition)}">${formatStatus(health.acquisition)}</span>
          </div>
          <div class="health-item">
            <div class="health-label">Conversion</div>
            <span class="health-status ${getHealthClass(health.conversion)}">${formatStatus(health.conversion)}</span>
          </div>
          <div class="health-item">
            <div class="health-label">Retention</div>
            <span class="health-status ${getHealthClass(health.retention)}">${formatStatus(health.retention)}</span>
          </div>
          <div class="health-item">
            <div class="health-label">Economics</div>
            <span class="health-status ${getHealthClass(health.economics)}">${formatStatus(health.economics)}</span>
          </div>
          <div class="health-item">
            <div class="health-label">Brand</div>
            <span class="health-status ${getHealthClass(health.brand)}">${formatStatus(health.brand)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generatePsychology(output: EliteIntelligenceOutput): string {
  const { audiencePsychology } = output;
  const trustClass = `trust-${audiencePsychology.trustState.overall}`;

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon" style="background: #ede9fe;">🧠</div>
        <h2 class="card-title">Audience Psychology</h2>
      </div>
      <div class="card-body">
        <div class="psychology-grid">
          <div class="psychology-item">
            <div class="psychology-label">Trust State</div>
            <div class="psychology-value ${trustClass}">${audiencePsychology.trustState.overall.toUpperCase()}</div>
          </div>
          <div class="psychology-item">
            <div class="psychology-label">Trust Trajectory</div>
            <div class="psychology-value">${audiencePsychology.trustState.trajectory}</div>
          </div>
          <div class="psychology-item">
            <div class="psychology-label">Purchase State</div>
            <div class="psychology-value">${audiencePsychology.purchaseState.dominant.replace(/_/g, ' ')}</div>
          </div>
          <div class="psychology-item">
            <div class="psychology-label">Skepticism Level</div>
            <div class="psychology-value">${audiencePsychology.cognitiveState.skepticismLevel.toUpperCase()}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateBlockers(output: EliteIntelligenceOutput): string {
  const blockers = output.audiencePsychology.purchaseState.blockers;
  if (blockers.length === 0) return '';

  const blockerItems = blockers.map(b => `
    <li class="blocker-item">
      <span class="blocker-severity severity-${b.severity}">${b.severity}</span>
      <div class="blocker-content">
        <div class="blocker-name">${b.blocker}</div>
        <div class="blocker-strategy">${b.removalStrategy}</div>
      </div>
    </li>
  `).join('');

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon" style="background: #fee2e2;">🚧</div>
        <h2 class="card-title">Purchase Blockers</h2>
      </div>
      <div class="card-body">
        <ul class="blocker-list">
          ${blockerItems}
        </ul>
      </div>
    </div>
  `;
}

function generatePredictions(output: EliteIntelligenceOutput): string {
  const forecasts = output.predictions.forecasts;
  if (forecasts.length === 0) return '';

  const predictionItems = forecasts.slice(0, 4).map(f => {
    const impact = f.impact[0];
    const isNegative = impact?.direction === 'negative';
    const icon = isNegative ? '📉' : '📈';
    const iconClass = isNegative ? 'prediction-negative' : 'prediction-positive';

    return `
      <div class="prediction-item">
        <div class="prediction-icon ${iconClass}">${icon}</div>
        <div class="prediction-content">
          <div class="prediction-metric">${impact?.metric || f.signal}</div>
          <div class="prediction-detail">${impact?.magnitude} impact in ${f.horizon}</div>
        </div>
        <div class="prediction-confidence">
          <div class="prediction-confidence-value">${f.confidence}%</div>
          <div class="prediction-confidence-label">confidence</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon" style="background: #dbeafe;">🔮</div>
        <h2 class="card-title">Predictions</h2>
      </div>
      <div class="card-body">
        ${predictionItems}
      </div>
    </div>
  `;
}

function generatePlaybook(output: EliteIntelligenceOutput): string {
  const { executionPlaybook } = output;

  const renderList = (items: { action: string }[]) => {
    if (items.length === 0) return '<p style="color: var(--gray-500); font-size: 14px;">No actions required</p>';
    return `<ul class="playbook-list">${items.map(i => `<li class="playbook-item">${i.action}</li>`).join('')}</ul>`;
  };

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon" style="background: #d1fae5;">📋</div>
        <h2 class="card-title">Execution Playbook</h2>
      </div>
      <div class="card-body">
        <div class="playbook-section">
          <div class="playbook-label">
            <span class="playbook-dot dot-immediate"></span>
            IMMEDIATE (Next 24-48 hours)
          </div>
          ${renderList(executionPlaybook.immediate)}
        </div>

        <div class="playbook-section">
          <div class="playbook-label">
            <span class="playbook-dot dot-week"></span>
            THIS WEEK
          </div>
          ${renderList(executionPlaybook.thisWeek)}
        </div>

        <div class="playbook-section">
          <div class="playbook-label">
            <span class="playbook-dot dot-month"></span>
            THIS MONTH
          </div>
          ${renderList(executionPlaybook.thisMonth)}
        </div>
      </div>
    </div>
  `;
}

function generateContradictions(output: EliteIntelligenceOutput): string {
  const contradictions = output.confidenceReport.contradictions;
  if (contradictions.length === 0) return '';

  const contradictionItems = contradictions.map(c => `
    <div class="card contradiction-card">
      <div class="card-body">
        <div class="contradiction-conflict">⚠️ ${c.conflict}</div>

        <div class="contradiction-explanations">
          <div class="contradiction-explanations-title">Possible Explanations:</div>
          <ul class="contradiction-list">
            ${c.possibleExplanations.map(e => `<li>${e}</li>`).join('')}
          </ul>
        </div>

        <div class="contradiction-steps">
          <div class="contradiction-steps-title">Investigation Steps</div>
          ${c.investigationSteps.map((s, i) => `${i + 1}. ${s}`).join('<br>')}
        </div>
      </div>
    </div>
  `).join('');

  return `
    <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--gray-700);">
      🔍 Needs Investigation
    </h3>
    ${contradictionItems}
  `;
}

function generateConfidenceReport(output: EliteIntelligenceOutput): string {
  const { confidenceReport } = output;
  const confidence = Math.round(confidenceReport.overallConfidence);

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon" style="background: #fef3c7;">📊</div>
        <h2 class="card-title">Confidence Report</h2>
      </div>
      <div class="card-body">
        <div class="confidence-bar">
          <div class="confidence-fill" style="width: ${confidence}%"></div>
        </div>

        <div class="insights-grid">
          <div class="insights-section">
            <div class="insights-title">✓ Verified Insights</div>
            <ul class="insights-list">
              ${confidenceReport.verifiedInsights.slice(0, 3).map(i => `<li>${i.split(':')[0]}</li>`).join('')}
            </ul>
          </div>

          <div class="insights-section">
            <div class="insights-title">? Uncertainties</div>
            <ul class="insights-list">
              ${confidenceReport.uncertainties.map(u => `<li>${u}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateFooter(): string {
  return `
    <footer class="footer">
      <p>Generated by <span class="footer-logo">SMASHED</span> Elite Intelligence</p>
      <p style="margin-top: 4px;">smashed.agency</p>
    </footer>
  `;
}
