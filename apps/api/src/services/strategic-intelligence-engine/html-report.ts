/**
 * Strategic Intelligence Engine — HTML Report Generation
 */

import type { StrategicIntelligenceOutput } from './types.js';

export function generateStrategicIntelligenceHTML(output: StrategicIntelligenceOutput, brandName: string): string {
  const severityColors = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280'
  };

  const leverageColors = {
    transformational: '#8b5cf6',
    high: '#10b981',
    medium: '#3b82f6',
    low: '#6b7280'
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Strategic Intelligence — ${brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.7; }
    .container { max-width: 1100px; margin: 0 auto; padding: 50px 24px; }

    .header { margin-bottom: 50px; }
    .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #fff; }
    .header .subtitle { color: #888; font-size: 14px; }
    .header .brand { color: #EC8A23; }

    .executive-summary { background: linear-gradient(135deg, #1a1a1a, #252525); border: 2px solid #EC8A23; border-radius: 16px; padding: 32px; margin-bottom: 50px; }
    .executive-summary h2 { color: #EC8A23; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
    .executive-headline { font-size: 24px; font-weight: 700; margin-bottom: 20px; line-height: 1.3; }
    .executive-situation { color: #ccc; margin-bottom: 24px; font-size: 15px; }
    .executive-direction { background: #0a0a0a; padding: 20px; border-radius: 12px; border-left: 4px solid #EC8A23; }
    .executive-direction h3 { color: #EC8A23; font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }
    .executive-direction p { font-size: 15px; }

    .section { margin-bottom: 50px; }
    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #2a2a2a; }

    .psychology-state { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .state-label { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 8px; }
    .state-value { font-size: 20px; font-weight: 600; color: #EC8A23; margin-bottom: 16px; }
    .state-interpretation { color: #aaa; font-size: 14px; line-height: 1.7; }

    .trust-landscape { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 24px; }
    .trust-card { background: #1a1a1a; padding: 16px; border-radius: 8px; }
    .trust-card h4 { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 12px; }
    .trust-card ul { list-style: none; font-size: 13px; }
    .trust-card li { padding: 6px 0; border-bottom: 1px solid #252525; }
    .trust-card li:last-child { border: none; }

    .risk-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; margin-bottom: 20px; border-left: 4px solid; }
    .risk-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .risk-type { font-size: 11px; color: #888; text-transform: uppercase; }
    .risk-severity { padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; text-transform: uppercase; }

    .risk-section { margin-bottom: 16px; }
    .risk-section-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; }
    .risk-section-content { font-size: 14px; color: #ccc; }

    .risk-impact { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
    .impact-item { background: #1a1a1a; padding: 8px 14px; border-radius: 6px; font-size: 12px; }
    .impact-label { color: #888; }
    .impact-value { color: #ef4444; font-weight: 600; margin-left: 4px; }

    .risk-actions { background: #0a0a0a; padding: 16px; border-radius: 8px; }
    .risk-actions h4 { font-size: 11px; color: #EC8A23; text-transform: uppercase; margin-bottom: 12px; }
    .risk-actions ul { list-style: none; font-size: 13px; }
    .risk-actions li { padding: 4px 0; padding-left: 16px; position: relative; }
    .risk-actions li:before { content: "→"; position: absolute; left: 0; color: #EC8A23; }

    .opportunity-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; margin-bottom: 20px; border-left: 4px solid; }
    .opportunity-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .opp-type { font-size: 11px; color: #888; text-transform: uppercase; }
    .opp-leverage { padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; text-transform: uppercase; }

    .founder-insight { background: linear-gradient(135deg, #1a1a1a, #0a0a0a); border: 1px solid #EC8A23; padding: 20px; border-radius: 12px; margin-top: 16px; }
    .founder-insight h4 { color: #EC8A23; font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }
    .founder-insight p { font-size: 15px; font-style: italic; color: #fff; }

    .strategic-direction { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .direction-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    .direction-item h4 { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 12px; }
    .direction-item p { font-size: 14px; color: #ccc; }
    .direction-item ul { list-style: none; font-size: 13px; }
    .direction-item li { padding: 4px 0; }
    .stop { color: #ef4444; }
    .start { color: #10b981; }

    .footer { margin-top: 60px; text-align: center; color: #666; font-size: 13px; }
    .footer-logo { font-size: 20px; font-weight: 700; color: #EC8A23; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Strategic Intelligence Report</h1>
      <p class="subtitle">Audience psychology & strategic direction for <span class="brand">${brandName}</span></p>
      <p class="subtitle">Generated ${new Date(output.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    </div>

    <div class="executive-summary">
      <h2>Executive Summary</h2>
      <div class="executive-headline">${output.executiveSummary.headline}</div>
      <p class="executive-situation">${output.executiveSummary.strategicSituation}</p>
      <div class="executive-direction">
        <h3>Recommended Direction</h3>
        <p>${output.executiveSummary.recommendedDirection}</p>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Audience Psychology</h2>
      <div class="psychology-state">
        <div class="state-label">Dominant Audience State</div>
        <div class="state-value">${output.audiencePsychology.dominantState.replace(/_/g, ' ')}</div>
        <p class="state-interpretation">${output.audiencePsychology.strategicInterpretation}</p>

        <div class="trust-landscape">
          <div class="trust-card">
            <h4>Trust Threats</h4>
            <ul>
              ${output.audiencePsychology.trustLandscape.trustThreats.length > 0
                ? output.audiencePsychology.trustLandscape.trustThreats.map(t => `<li>${t}</li>`).join('')
                : '<li style="color:#666">No critical threats detected</li>'}
            </ul>
          </div>
          <div class="trust-card">
            <h4>Trust Opportunities</h4>
            <ul>
              ${output.audiencePsychology.trustLandscape.trustOpportunities.length > 0
                ? output.audiencePsychology.trustLandscape.trustOpportunities.map(t => `<li>${t}</li>`).join('')
                : '<li style="color:#666">Building on stable foundation</li>'}
            </ul>
          </div>
        </div>
      </div>
    </div>

    ${output.risks.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Strategic Risks</h2>
      ${output.risks.map(risk => `
        <div class="risk-card" style="border-left-color: ${severityColors[risk.severity]}">
          <div class="risk-header">
            <div>
              <div class="risk-type">${risk.riskType} risk</div>
            </div>
            <span class="risk-severity" style="background: ${severityColors[risk.severity]}20; color: ${severityColors[risk.severity]}">${risk.severity}</span>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Observation</div>
            <div class="risk-section-content">${risk.observation}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Interpretation</div>
            <div class="risk-section-content">${risk.interpretation}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Business Impact</div>
            <div class="risk-section-content">${risk.businessImpact}</div>
          </div>

          ${risk.estimatedImpact ? `
          <div class="risk-impact">
            ${risk.estimatedImpact.cacIncrease ? `<div class="impact-item"><span class="impact-label">CAC Impact:</span><span class="impact-value">${risk.estimatedImpact.cacIncrease}</span></div>` : ''}
            ${risk.estimatedImpact.conversionDecline ? `<div class="impact-item"><span class="impact-label">Conversion:</span><span class="impact-value">${risk.estimatedImpact.conversionDecline}</span></div>` : ''}
            ${risk.estimatedImpact.scalingRisk ? `<div class="impact-item"><span class="impact-label">Scaling Risk:</span><span class="impact-value">${risk.estimatedImpact.scalingRisk}</span></div>` : ''}
          </div>
          ` : ''}

          <div class="risk-section">
            <div class="risk-section-label">Strategic Implication</div>
            <div class="risk-section-content">${risk.strategicImplication}</div>
          </div>

          <div class="risk-actions">
            <h4>Strategic Direction</h4>
            <ul>
              ${risk.strategicDirection.map(d => `<li>${d}</li>`).join('')}
            </ul>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${output.opportunities.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Strategic Opportunities</h2>
      ${output.opportunities.map(opp => `
        <div class="opportunity-card" style="border-left-color: ${leverageColors[opp.leverage]}">
          <div class="opportunity-header">
            <div>
              <div class="opp-type">${opp.opportunityType} opportunity</div>
            </div>
            <span class="opp-leverage" style="background: ${leverageColors[opp.leverage]}20; color: ${leverageColors[opp.leverage]}">${opp.leverage}</span>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Signal Detected</div>
            <div class="risk-section-content">${opp.signal}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Interpretation</div>
            <div class="risk-section-content">${opp.interpretation}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Strategic Value</div>
            <div class="risk-section-content">${opp.strategicValue}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Competitive Edge</div>
            <div class="risk-section-content">${opp.competitiveEdge}</div>
          </div>

          <div class="founder-insight">
            <h4>Founder Insight</h4>
            <p>"${opp.founderInsight}"</p>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Strategic Direction</h2>
      <div class="strategic-direction">
        <div class="direction-grid">
          <div class="direction-item">
            <h4>Trust Strategy</h4>
            <p>${output.strategicDirection.trustStrategy}</p>
          </div>
          <div class="direction-item">
            <h4>Emotional Territory</h4>
            <p>${output.strategicDirection.emotionalTerritory}</p>
          </div>
          <div class="direction-item">
            <h4 class="stop">What to Stop Doing</h4>
            <ul>
              ${output.strategicDirection.whatToStopDoing.length > 0
                ? output.strategicDirection.whatToStopDoing.map(s => `<li class="stop">× ${s}</li>`).join('')
                : '<li style="color:#666">Continue current approach</li>'}
            </ul>
          </div>
          <div class="direction-item">
            <h4 class="start">What to Start Doing</h4>
            <ul>
              ${output.strategicDirection.whatToStartDoing.map(s => `<li class="start">+ ${s}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-logo">The Bridge Service</div>
      <p>Powered by Cosmisk Strategic Intelligence</p>
      <p style="margin-top:8px"><a href="https://smashed.agency/scan" style="color:#EC8A23">smashed.agency/scan</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
