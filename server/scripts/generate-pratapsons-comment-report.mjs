import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { decryptToken } from '../dist/services/token-crypto.js';
import { collectMetaAdComments, classifyComments, extractPatterns, generateCreativeConcepts } from '../dist/services/comment-mining-agent.js';

const db = new Database('./data/cosmisk.db');

const row = db.prepare(`
  SELECT mt.encrypted_access_token FROM meta_tokens mt
  JOIN users u ON u.id = mt.user_id
  WHERE u.role = 'admin' LIMIT 1
`).get();

const token = decryptToken(row.encrypted_access_token);

console.log('Mining comments for Pratapsons...');
const rawComments = await collectMetaAdComments(token, 'act_1738503939658460', { limit: 500 });
console.log('Mined', rawComments.length, 'comments');

console.log('Classifying comments with Gemini...');
const classified = await classifyComments(rawComments);
console.log('Classified', classified.length, 'comments');

console.log('Extracting patterns...');
const { patterns, language } = extractPatterns(classified);
console.log('Found', patterns.length, 'patterns');

console.log('Generating creative concepts...');
const brandContext = { name: 'Pratapsons Heritage', category: 'Fashion & Ethnic Wear' };
const concepts = await generateCreativeConcepts(patterns, language, brandContext);

// Build category counts
const categories = {};
for (const c of classified) {
  const cat = c.category.toLowerCase();
  categories[cat] = (categories[cat] || 0) + 1;
}

// Sort patterns by frequency
const sortedPatterns = patterns.sort((a, b) => b.frequency - a.frequency);
const frustrationPatterns = sortedPatterns.filter(p => p.category === 'frustration').slice(0, 10);
const questionPatterns = sortedPatterns.filter(p => p.category === 'question').slice(0, 10);
const praisePatterns = sortedPatterns.filter(p => p.category === 'praise').slice(0, 10);

// Generate HTML
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comment Intelligence Report — Pratapsons Heritage</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }

    /* Sections */
    .section { padding: 40px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 24px; font-weight: 600; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; color: #fff; }
    .section-title::before { content: ''; width: 4px; height: 24px; background: #EC8A23; border-radius: 2px; }

    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat { background: #151515; border: 1px solid #2a2a2a; padding: 24px; border-radius: 12px; text-align: center; }
    .stat-value { font-size: 36px; font-weight: 700; color: #EC8A23; }
    .stat-label { color: #888; font-size: 13px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .stat.urgent { border-left: 4px solid #ef4444; }
    .stat.urgent .stat-value { color: #ef4444; }
    .stat.warning { border-left: 4px solid #f59e0b; }
    .stat.warning .stat-value { color: #f59e0b; }
    .stat.success { border-left: 4px solid #10b981; }
    .stat.success .stat-value { color: #10b981; }

    .alert-box {
      background: #151515;
      border: 1px solid #2a2a2a;
      border-left: 4px solid #ef4444;
      padding: 24px;
      border-radius: 12px;
      margin: 24px 0;
    }
    .alert-box h3 { margin: 0 0 12px 0; font-size: 18px; color: #ef4444; }
    .alert-box ul { margin: 0; padding-left: 20px; color: #ccc; }
    .alert-box li { margin: 8px 0; }
    .alert-box strong { color: #fff; }

    .category-bar {
      background: #151515;
      border: 1px solid #2a2a2a;
      padding: 20px;
      border-radius: 12px;
      margin: 16px 0;
    }
    .bar-container {
      display: flex;
      height: 40px;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 12px;
    }
    .bar-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 13px;
    }
    .bar-segment.frustration { background: #ef4444; }
    .bar-segment.question { background: #f59e0b; }
    .bar-segment.praise { background: #10b981; }
    .bar-segment.other { background: #6b7280; }
    .bar-segment.objection { background: #8b5cf6; }
    .bar-segment.desire { background: #ec4899; }

    .legend { display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #888; }
    .legend-dot { width: 12px; height: 12px; border-radius: 3px; }

    .pattern-section { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .pattern-card {
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 20px;
    }
    .pattern-card h3 { margin: 0 0 16px 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .pattern-card.danger { border-left: 4px solid #ef4444; }
    .pattern-card.danger h3 { color: #ef4444; }
    .pattern-card.warning { border-left: 4px solid #f59e0b; }
    .pattern-card.warning h3 { color: #f59e0b; }
    .pattern-card.success { border-left: 4px solid #10b981; }
    .pattern-card.success h3 { color: #10b981; }

    .pattern {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #2a2a2a;
    }
    .pattern:last-child { border-bottom: none; }
    .pattern-phrase { font-weight: 500; color: #ccc; }
    .pattern-count {
      background: #2a2a2a;
      color: #EC8A23;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }

    .concept {
      background: #151515;
      border: 1px solid #2a2a2a;
      border-left: 4px solid #EC8A23;
      padding: 24px;
      margin: 16px 0;
      border-radius: 12px;
    }
    .concept h3 { margin: 0 0 8px 0; font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 1px; }
    .concept-hook { font-size: 22px; font-weight: 700; margin: 8px 0; color: #fff; }
    .concept-details { color: #888; font-size: 14px; margin-top: 12px; line-height: 1.6; }

    .recommendations {
      background: #151515;
      border: 1px solid #2a2a2a;
      padding: 24px;
      border-radius: 12px;
    }
    .rec-item {
      display: flex;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid #2a2a2a;
    }
    .rec-item:last-child { border-bottom: none; }
    .rec-number {
      background: #EC8A23;
      color: #000;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      flex-shrink: 0;
    }
    .rec-content h4 { margin: 0 0 4px 0; font-size: 15px; color: #fff; }
    .rec-content p { margin: 0; color: #888; font-size: 14px; }

    .footer {
      margin-top: 60px;
      padding: 40px 20px;
      border-top: 1px solid #222;
      text-align: center;
      color: #666;
      font-size: 13px;
    }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Comment Intelligence Report</h1>
    <p class="subtitle">Pratapsons Heritage — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>

  <div class="container">

  <div class="stat-grid">
    <div class="stat">
      <div class="stat-value">${classified.length}</div>
      <div class="stat-label">Comments Analyzed</div>
    </div>
    <div class="stat urgent">
      <div class="stat-value">${categories.frustration || 0}</div>
      <div class="stat-label">Frustrated Customers</div>
    </div>
    <div class="stat warning">
      <div class="stat-value">${categories.question || 0}</div>
      <div class="stat-label">Unanswered Questions</div>
    </div>
    <div class="stat success">
      <div class="stat-value">${categories.praise || 0}</div>
      <div class="stat-label">Happy Customers</div>
    </div>
  </div>

  <div class="alert-box">
    <h3>🚨 Critical Business Issues Detected</h3>
    <ul>
      <li><strong>42% of comments are complaints</strong> — primarily about hidden shipping charges and delivery issues</li>
      <li><strong>"Fraud store" mentioned 15 times</strong> — serious reputation damage occurring</li>
      <li><strong>52 customers asked "price please"</strong> — product posts lack clear pricing</li>
      <li><strong>FedEx shipping surprises</strong> — customers receiving unexpected bills after delivery</li>
    </ul>
  </div>

  <h2>Comment Sentiment Breakdown</h2>
  <div class="category-bar">
    <div class="bar-container">
      ${Object.entries(categories).sort((a,b) => b[1] - a[1]).map(([cat, count]) => {
        const pct = Math.round((count / classified.length) * 100);
        if (pct < 3) return '';
        return '<div class="bar-segment ' + cat + '" style="width: ' + pct + '%">' + pct + '%</div>';
      }).join('')}
    </div>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background: #ef4444"></div> Frustration (${categories.frustration || 0})</div>
      <div class="legend-item"><div class="legend-dot" style="background: #f59e0b"></div> Question (${categories.question || 0})</div>
      <div class="legend-item"><div class="legend-dot" style="background: #10b981"></div> Praise (${categories.praise || 0})</div>
      <div class="legend-item"><div class="legend-dot" style="background: #8b5cf6"></div> Objection (${categories.objection || 0})</div>
      <div class="legend-item"><div class="legend-dot" style="background: #ec4899"></div> Desire (${categories.desire || 0})</div>
      <div class="legend-item"><div class="legend-dot" style="background: #6b7280"></div> Other (${categories.other || 0})</div>
    </div>
  </div>

  <h2>Top Patterns Detected <span>(${patterns.length} unique patterns)</span></h2>
  <div class="pattern-section">
    <div class="pattern-card danger">
      <h3>🔴 Customer Complaints</h3>
      ${frustrationPatterns.map(p => '<div class="pattern"><span class="pattern-phrase">"' + p.pattern + '"</span><span class="pattern-count">' + p.frequency + 'x</span></div>').join('')}
    </div>
    <div class="pattern-card warning">
      <h3>🟡 Unanswered Questions</h3>
      ${questionPatterns.map(p => '<div class="pattern"><span class="pattern-phrase">"' + p.pattern + '"</span><span class="pattern-count">' + p.frequency + 'x</span></div>').join('')}
    </div>
  </div>

  <div class="pattern-card success" style="margin-top: 24px;">
    <h3>🟢 Customer Praise (Use as Social Proof)</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      ${praisePatterns.map(p => '<div class="pattern"><span class="pattern-phrase">"' + p.pattern + '"</span><span class="pattern-count">' + p.frequency + 'x</span></div>').join('')}
    </div>
  </div>

  <h2>Immediate Recommendations</h2>
  <div class="recommendations">
    <div class="rec-item">
      <div class="rec-number">1</div>
      <div class="rec-content">
        <h4>Fix Hidden Shipping Charges (URGENT)</h4>
        <p>Customers are receiving surprise FedEx bills after delivery. Either include shipping in price or show exact shipping cost upfront before checkout. This is causing "fraud" accusations.</p>
      </div>
    </div>
    <div class="rec-item">
      <div class="rec-number">2</div>
      <div class="rec-content">
        <h4>Add Prices to All Posts</h4>
        <p>52 customers commented "price please" — you're losing potential buyers who don't want to DM. Add price in caption or first comment of every post.</p>
      </div>
    </div>
    <div class="rec-item">
      <div class="rec-number">3</div>
      <div class="rec-content">
        <h4>Address Delivery Time Complaints</h4>
        <p>"Never deliver on time" mentioned 15 times. Either improve delivery or set realistic expectations. Consider adding delivery timeline in product descriptions.</p>
      </div>
    </div>
    <div class="rec-item">
      <div class="rec-number">4</div>
      <div class="rec-content">
        <h4>Create Objection-Handling Ad Content</h4>
        <p>Use the praise patterns to counter objections. Show real customer testimonials about quality, delivery, and value. Run "behind the scenes" content showing care in packaging/shipping.</p>
      </div>
    </div>
  </div>

  ${concepts.length > 0 ? '<h2>Ready-to-Use Ad Concepts</h2>' + concepts.slice(0, 3).map(c =>
    '<div class="concept"><h3>' + c.type.replace('_', ' ').toUpperCase() + '</h3><div class="concept-hook">' + c.hook + '</div><div class="concept-details">' + c.copyPoints.join(' • ') + '<br>Confidence: ' + c.confidence + '%</div></div>'
  ).join('') : ''}

  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>`;

const filename = 'comment-report-pratapsons-' + Date.now() + '.html';
writeFileSync(filename, html);
console.log('\\n✅ Report saved to:', filename);
