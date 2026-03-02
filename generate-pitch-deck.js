const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({
  size: [1280, 720],
  margin: 0,
  info: {
    Title: 'Cosmisk — Investor Pitch Deck',
    Author: 'Cosmisk',
    Subject: 'AI-Powered Creative Intelligence for Performance Marketing',
  }
});

const output = fs.createWriteStream('pitch-deck.pdf');
doc.pipe(output);

// Colors
const navy = '#1B2A4A';
const cream = '#FAF8F5';
const accent = '#E74C3C';
const green = '#10B981';
const gold = '#F59E0B';
const blue = '#3B82F6';
const purple = '#8B5CF6';
const white = '#FFFFFF';
const gray = '#666666';
const lightGray = '#999999';

// Register fonts with ₹ support
doc.registerFont('fontR', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
doc.registerFont('fontB', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf');
doc.registerFont('fontI', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
doc.registerFont('fontMono', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf');
doc.registerFont('fontMonoB', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf');
const fontR = 'fontR';
const fontB = 'fontB';
const fontI = 'fontI';
const fontMono = 'fontMono';
const fontMonoB = 'fontMonoB';

function slideNumber(num) {
  doc.fontSize(12).font(fontMono).fillColor('rgba(255,255,255,0.3)');
  doc.text(String(num).padStart(2, '0'), 1220, 680, { width: 40, align: 'right' });
}

function slideNumberDark(num) {
  doc.fontSize(12).font(fontMono).fillColor('#CCC');
  doc.text(String(num).padStart(2, '0'), 1220, 680, { width: 40, align: 'right' });
}

// ===== SLIDE 1: Title =====
doc.rect(0, 0, 1280, 720).fill(navy);
// Gradient overlay simulation
doc.rect(0, 0, 1280, 720).fill(navy);

doc.fontSize(14).font(fontB).fillColor(accent);
doc.text('COSMISK', 80, 180, { characterSpacing: 4 });

doc.fontSize(48).font(fontB).fillColor(white);
doc.text('AI-Powered Creative Intelligence\nfor Performance Marketing', 80, 220, { width: 900, lineGap: 6 });

doc.fontSize(18).font(fontR).fillColor('#8899BB');
doc.text('Stop staring at dashboards. Start understanding your ads.', 80, 390, { width: 700 });

// DNA badges
const badges = [
  { label: 'Hook DNA', color: '#FEF3C7', text: '#92400E' },
  { label: 'Visual DNA', color: '#DBEAFE', text: '#1E40AF' },
  { label: 'Audio DNA', color: '#FCE7F3', text: '#9D174D' },
];
let bx = 80;
badges.forEach(b => {
  const w = 100;
  doc.roundedRect(bx, 460, w, 32, 16).fill(b.color);
  doc.fontSize(12).font(fontB).fillColor(b.text);
  doc.text(b.label, bx, 468, { width: w, align: 'center' });
  bx += w + 12;
});

doc.fontSize(13).font(fontR).fillColor('#556688');
doc.text('Pre-Series A  |  2025', 80, 550);
slideNumber(1);

// ===== SLIDE 2: Problem =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(cream);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('THE PROBLEM', 80, 60, { characterSpacing: 2 });
doc.fontSize(40).font(fontB).fillColor(navy);
doc.text('Dashboards Show Numbers.\nNot Answers.', 80, 90, { width: 600 });

doc.fontSize(16).font(fontR).fillColor(gray);
const problems = [
  'Media buyer says "ROAS dropped 20%." But why?',
  'Manual creative analysis takes hours — per ad',
  'Agencies manage 30+ brands blindfolded by spreadsheets',
  'Winning patterns are invisible, lost across campaigns',
];
let py = 220;
problems.forEach(p => {
  doc.roundedRect(80, py, 560, 44, 8).fill('#FFF');
  doc.fontSize(11).font(fontR).fillColor('#DC2626');
  doc.text('✕', 96, py + 14);
  doc.fontSize(14).font(fontR).fillColor(navy);
  doc.text(p, 120, py + 13, { width: 500 });
  py += 56;
});

// Right side quote
doc.roundedRect(700, 100, 500, 500, 16).fill(white);
doc.fontSize(16).font(fontI).fillColor(gray);
doc.text('"We spent ₹18L last month on Meta ads. We know ROAS went up. But we have no idea which creative elements drove that. We\'re just guessing."', 740, 180, { width: 420, lineGap: 6 });
doc.fontSize(14).font(fontB).fillColor(navy);
doc.text('— Every D2C Founder, 2025', 740, 360);
slideNumberDark(2);

// ===== SLIDE 3: Solution =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(white);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('THE SOLUTION', 80, 60, { characterSpacing: 2 });
doc.fontSize(40).font(fontB).fillColor(navy);
doc.text('Cosmisk Extracts the\nCreative DNA of Every Ad', 80, 90, { width: 700 });

doc.fontSize(16).font(fontR).fillColor(gray);
doc.text('Cosmisk uses AI to decode every ad into its fundamental Creative DNA — the hook that stops the scroll, the visuals that hold attention, the audio that drives action.', 80, 200, { width: 700, lineGap: 4 });

// DNA cards
const dnaCards = [
  { title: 'Hook DNA', icon: '🎣', bg: '#FEF3C7', textColor: '#92400E', desc: 'What stops the scroll?', tags: ['Shock Statement', 'Price Anchor', 'Curiosity', 'Authority'] },
  { title: 'Visual DNA', icon: '🎨', bg: '#DBEAFE', textColor: '#1E40AF', desc: 'What holds attention?', tags: ['Macro Texture', 'Warm Palette', 'UGC Style', 'Product Focus'] },
  { title: 'Audio DNA', icon: '🎵', bg: '#FCE7F3', textColor: '#9D174D', desc: 'What drives emotion?', tags: ['Hindi VO', 'Upbeat', 'ASMR', 'Emotional'] },
];
let cx = 80;
dnaCards.forEach(card => {
  doc.roundedRect(cx, 300, 360, 340, 16).fill('#FAFAFA');
  doc.roundedRect(cx, 300, 360, 340, 16).stroke('#E5E2DD');

  doc.roundedRect(cx + 24, 324, 48, 48, 12).fill(card.bg);
  doc.fontSize(24).font(fontR);
  doc.text(card.icon, cx + 24, 332, { width: 48, align: 'center' });

  doc.fontSize(22).font(fontB).fillColor(navy);
  doc.text(card.title, cx + 88, 332);
  doc.fontSize(14).font(fontR).fillColor(gray);
  doc.text(card.desc, cx + 88, 360);

  let tx = cx + 24;
  let ty = 400;
  card.tags.forEach(tag => {
    const tw = doc.widthOfString(tag) + 20;
    if (tx + tw > cx + 340) { tx = cx + 24; ty += 34; }
    doc.roundedRect(tx, ty, tw, 28, 14).fill(card.bg);
    doc.fontSize(11).font(fontB).fillColor(card.textColor);
    doc.text(tag, tx, ty + 8, { width: tw, align: 'center' });
    tx += tw + 8;
  });
  cx += 390;
});
slideNumberDark(3);

// ===== SLIDE 4: How It Works =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(navy);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('HOW IT WORKS', 80, 60, { characterSpacing: 2 });
doc.fontSize(40).font(fontB).fillColor(white);
doc.text('From Raw Data to Creative Brief\nin Under 20 Minutes', 80, 90, { width: 900 });

const steps = [
  { num: '1', title: 'Connect', desc: 'One-click Meta Ads integration. Pull all creatives + performance data automatically.' },
  { num: '2', title: 'Analyze', desc: 'AI extracts Hook DNA, Visual DNA, and Audio DNA from every creative.' },
  { num: '3', title: 'Understand', desc: 'See exactly which DNA combos drive ROAS, CTR, and CPA.' },
  { num: '4', title: 'Create & Publish', desc: 'Generate new creatives using winning DNA patterns. Publish directly to Meta.' },
];
let sx = 80;
steps.forEach(step => {
  doc.roundedRect(sx, 220, 270, 380, 16).fill('rgba(255,255,255,0.05)');
  doc.circle(sx + 135, 270, 28).fill(accent);
  doc.fontSize(22).font(fontB).fillColor(white);
  doc.text(step.num, sx + 118, 258, { width: 34, align: 'center' });

  doc.fontSize(22).font(fontB).fillColor(white);
  doc.text(step.title, sx + 24, 320, { width: 222, align: 'center' });
  doc.fontSize(14).font(fontR).fillColor('rgba(255,255,255,0.6)');
  doc.text(step.desc, sx + 24, 360, { width: 222, align: 'center', lineGap: 4 });
  sx += 290;
});

doc.fontSize(14).font(fontR).fillColor('rgba(255,255,255,0.4)');
doc.text('Full loop: Analyze → Understand → Create → Publish → Monitor → Repeat', 80, 640, { width: 1120, align: 'center' });
slideNumber(4);

// ===== SLIDE 5: Product Overview =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(cream);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('PRODUCT OVERVIEW', 80, 50, { characterSpacing: 2 });
doc.fontSize(36).font(fontB).fillColor(navy);
doc.text('Six Powerful Modules, One Platform', 80, 80);

const modules = [
  { title: 'Creative Cockpit', desc: 'Grid view of all creatives with DNA badges, ROAS, CTR, CPA. Filter by any DNA type.' },
  { title: 'Director Lab', desc: 'AI generates creative briefs from winning DNA patterns. Static + video in minutes.' },
  { title: 'UGC Studio', desc: 'Create UGC-style ad videos with AI avatars. Script to video in under 1 minute.' },
  { title: 'AI Oracle', desc: 'Ask anything about your ads in natural language. "Why did ROAS drop?" with data-backed answers.' },
  { title: 'Lighthouse', desc: 'Budget pacing & anomaly detection. Know before you blow your budget.' },
  { title: 'Graphic Studio', desc: 'AI-powered static ad creation from winning templates. Rapid iteration.' },
];
let mx = 80, my = 140;
modules.forEach((mod, i) => {
  doc.roundedRect(mx, my, 370, 160, 12).fill(white);
  doc.fontSize(18).font(fontB).fillColor(navy);
  doc.text(mod.title, mx + 20, my + 20, { width: 330 });
  doc.fontSize(13).font(fontR).fillColor(gray);
  doc.text(mod.desc, mx + 20, my + 50, { width: 330, lineGap: 3 });
  mx += 390;
  if ((i + 1) % 3 === 0) { mx = 80; my += 180; }
});
slideNumberDark(5);

// ===== SLIDE 6: Traction =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(navy);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('TRACTION', 80, 50, { characterSpacing: 2 });
doc.fontSize(40).font(fontB).fillColor(white);
doc.text('Early Metrics That Matter', 80, 80);

const kpis = [
  { value: '₹250Cr+', label: 'Ad Spend Analyzed', color: accent },
  { value: '3.2x', label: 'Avg ROAS Improvement', color: green },
  { value: '500+', label: 'Brands Using Cosmisk', color: blue },
  { value: '<20min', label: 'Data to Creative Brief', color: gold },
];
let kx = 80;
kpis.forEach(kpi => {
  doc.save();
  doc.roundedRect(kx, 160, 270, 110, 12).fillOpacity(0.08).fill(white);
  doc.restore();
  doc.fontSize(36).font(fontMonoB).fillColor(kpi.color);
  doc.text(kpi.value, kx, 176, { width: 270, align: 'center' });
  doc.fontSize(13).font(fontR).fillColor('#AAB');
  doc.text(kpi.label, kx, 228, { width: 270, align: 'center' });
  kx += 290;
});

// Testimonials
const testimonials = [
  { quote: 'Cosmisk changed how we think about creative. We went from guessing to knowing exactly why our best ads work.', name: 'Rajesh G.', role: 'Founder, Nectar Supplements', metric: '4.8x ROAS ← from 2.1x in 3 months' },
  { quote: 'Managing 35 brands became 10x easier. The Creative DNA concept is brilliant — our clients love the reports.', name: 'Priya S.', role: 'CEO, AdScale Agency', metric: '35 brands managed with 4-person team' },
  { quote: 'We reduced our creative production time by 60% using Director Lab and UGC Studio. Game changer for D2C.', name: 'Amit P.', role: 'CMO, Urban Drape', metric: '60% faster creative production' },
];
let tx2 = 80;
testimonials.forEach(t => {
  doc.save();
  doc.roundedRect(tx2, 310, 370, 340, 12).fillOpacity(0.06).fill(white);
  doc.restore();
  doc.fontSize(13).font(fontI).fillColor('#BBC');
  doc.text(`"${t.quote}"`, tx2 + 24, 334, { width: 322, lineGap: 4 });
  doc.fontSize(13).font(fontB).fillColor(white);
  doc.text(t.name, tx2 + 24, 460);
  doc.fontSize(11).font(fontR).fillColor('#889');
  doc.text(t.role, tx2 + 24, 480);
  doc.fontSize(12).font(fontMonoB).fillColor(accent);
  doc.text(t.metric, tx2 + 24, 510);
  tx2 += 390;
});
slideNumber(6);

// ===== SLIDE 7: Market =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(cream);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('MARKET OPPORTUNITY', 80, 50, { characterSpacing: 2 });
doc.fontSize(36).font(fontB).fillColor(navy);
doc.text("India's Performance Marketing is Exploding", 80, 80);

const marketKpis = [
  { value: '$4.2B', label: 'India Meta Ad Spend (2025)', color: navy },
  { value: '$8.1B', label: 'Projected by 2028', color: accent },
  { value: '800+', label: 'D2C Brands >1Cr/mo', color: blue },
  { value: '5,000+', label: 'Performance Mktg Agencies', color: purple },
];
let mkx = 80;
marketKpis.forEach(k => {
  doc.roundedRect(mkx, 150, 270, 100, 12).fill(white);
  doc.fontSize(28).font(fontMonoB).fillColor(k.color);
  doc.text(k.value, mkx, 160, { width: 270, align: 'center' });
  doc.fontSize(12).font(fontR).fillColor(gray);
  doc.text(k.label, mkx, 200, { width: 270, align: 'center' });
  mkx += 290;
});

// TAM/SAM/SOM
doc.roundedRect(80, 280, 1120, 380, 16).fill(white);
doc.fontSize(20).font(fontB).fillColor(navy);
doc.text('Addressable Market', 120, 310);

const markets = [
  { label: 'TAM — All Meta advertisers in India', value: '$680M', width: 1060, color: navy },
  { label: 'SAM — D2C brands + agencies >5L/mo spend', value: '$210M', width: 330, color: accent },
  { label: 'SOM — Year 1 target', value: '$4.5M', width: 21, color: green },
];
let my2 = 360;
markets.forEach(m => {
  doc.fontSize(14).font(fontR).fillColor(navy);
  doc.text(m.label, 120, my2);
  doc.fontSize(14).font(fontMonoB).fillColor(navy);
  doc.text(m.value, 1060, my2, { width: 100, align: 'right' });
  doc.roundedRect(120, my2 + 24, 1040, 20, 6).fill('#E5E2DD');
  doc.roundedRect(120, my2 + 24, m.width, 20, 6).fill(m.color);
  my2 += 80;
});
slideNumberDark(7);

// ===== SLIDE 8: Business Model =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(navy);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('BUSINESS MODEL', 80, 50, { characterSpacing: 2 });
doc.fontSize(40).font(fontB).fillColor(white);
doc.text('SaaS Pricing. Land & Expand.', 80, 80);

const plans = [
  { name: 'Starter', price: '₹4,999', features: ['1 brand, 5 ad accounts', 'Creative Cockpit', 'Basic DNA (Hook only)', '10 AI queries/day'], featured: false },
  { name: 'Growth', price: '₹14,999', badge: 'MOST POPULAR', features: ['3 brands, unlimited accounts', 'Full DNA analysis', 'Director Lab + UGC Studio', '50 AI queries/day', 'Lighthouse budget pacing', '5 team members'], featured: true },
  { name: 'Scale', price: '₹29,999', features: ['Unlimited brands', 'Agency Command Center', 'Cross-brand Brain', 'White-label reports', 'Unlimited AI queries', 'Dedicated CSM + API'], featured: false },
];
let px = 80;
plans.forEach(plan => {
  const textCol = plan.featured ? navy : white;
  const subCol = plan.featured ? gray : '#AAB';

  if (plan.featured) {
    doc.roundedRect(px, 160, 370, 480, 16).fill(white);
  } else {
    doc.save();
    doc.roundedRect(px, 160, 370, 480, 16).fillOpacity(0.08).fill(white);
    doc.restore();
  }
  if (plan.featured) {
    doc.roundedRect(px, 160, 370, 480, 16).stroke(accent);
  }

  if (plan.badge) {
    const bw = 120;
    doc.roundedRect(px + 125, 176, bw, 24, 12).fill('rgba(231,76,60,0.1)');
    doc.fontSize(10).font(fontB).fillColor(accent);
    doc.text(plan.badge, px + 125, 182, { width: bw, align: 'center' });
  }

  doc.fontSize(22).font(fontB).fillColor(textCol);
  doc.text(plan.name, px + 32, plan.badge ? 216 : 192);

  doc.fontSize(36).font(fontMonoB).fillColor(textCol);
  doc.text(plan.price, px + 32, plan.badge ? 248 : 224);
  doc.fontSize(14).font(fontR).fillColor(subCol);
  doc.text('/month', px + 32, plan.badge ? 292 : 268);

  let fy = plan.badge ? 324 : 300;
  plan.features.forEach(f => {
    doc.fontSize(11).font(fontR).fillColor(green);
    doc.text('✓', px + 32, fy);
    doc.fontSize(13).font(fontR).fillColor(subCol);
    doc.text(f, px + 52, fy, { width: 280 });
    fy += 24;
  });

  px += 390;
});

doc.fontSize(13).font(fontR).fillColor('rgba(255,255,255,0.4)');
doc.text('14-day free trial · No credit card required · 20% annual discount', 80, 660, { width: 1120, align: 'center' });
slideNumber(8);

// ===== SLIDE 9: Competitive Landscape =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(white);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('COMPETITIVE LANDSCAPE', 80, 50, { characterSpacing: 2 });
doc.fontSize(36).font(fontB).fillColor(navy);
doc.text('Why Cosmisk Wins', 80, 80);

// Competitive table
const headers = ['Capability', 'Cosmisk', 'Motion', 'Triple Whale', 'Foreplay'];
const rows = [
  ['Creative DNA Extraction', '✓', '✗', '✗', '✗'],
  ['AI Brief Generation', '✓', '✗', '✗', 'Partial'],
  ['UGC Video Generation', '✓', '✗', '✗', '✗'],
  ['Cross-brand Intelligence', '✓', '✗', '✗', '✗'],
  ['Hindi + Regional Language', '✓', '✗', '✗', '✗'],
  ['Budget Pacing (Lighthouse)', '✓', '✗', '✓', '✗'],
  ['Ad Performance Analytics', '✓', '✓', '✓', '✗'],
  ['India-first Pricing', '✓', '✗', '✗', '✗'],
];

const colWidths = [280, 160, 160, 160, 160];
let ty = 150;

// Header row
let thx = 120;
headers.forEach((h, i) => {
  doc.fontSize(13).font(fontB).fillColor(navy);
  doc.text(h, thx, ty, { width: colWidths[i], align: i === 0 ? 'left' : 'center' });
  thx += colWidths[i];
});
ty += 32;
doc.moveTo(120, ty).lineTo(1040, ty).strokeColor('#E5E2DD').lineWidth(2).stroke();
ty += 12;

rows.forEach(row => {
  let rx = 120;
  row.forEach((cell, i) => {
    if (i === 0) {
      doc.fontSize(13).font(fontR).fillColor(navy);
      doc.text(cell, rx, ty, { width: colWidths[i] });
    } else {
      const color = cell === '✓' ? green : cell === 'Partial' ? gold : '#CCC';
      doc.fontSize(14).font(fontB).fillColor(color);
      doc.text(cell, rx, ty, { width: colWidths[i], align: 'center' });
    }
    rx += colWidths[i];
  });
  ty += 32;
  doc.moveTo(120, ty - 6).lineTo(1040, ty - 6).strokeColor('#F0EDE8').lineWidth(1).stroke();
});

// Moat
doc.roundedRect(80, ty + 20, 1120, 80, 12).fill('#FFF7ED');
doc.fontSize(13).font(fontB).fillColor(navy);
doc.text('Moat: ', 110, ty + 40, { continued: true });
doc.font(fontR).text('Creative DNA is a proprietary taxonomy that deepens with every brand onboarded. More brands = richer cross-brand pattern intelligence = better AI recommendations. A classic data network effect.', { width: 1050 });
slideNumberDark(9);

// ===== SLIDE 10: Go-to-Market =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(cream);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('GO-TO-MARKET', 80, 50, { characterSpacing: 2 });
doc.fontSize(36).font(fontB).fillColor(navy);
doc.text('Three-Pronged GTM Strategy', 80, 80);

const gtm = [
  { title: 'Product-Led Growth', items: ['14-day free trial, no credit card', 'In-app upgrade prompts at usage limits', 'Viral sharing: DNA reports & briefs', 'Self-serve onboarding in <10 min'] },
  { title: 'Agency Partnerships', items: ['Agency Command Center = stickiness', 'Revenue share on agency referrals', 'White-label reports for agency branding', 'Target: 50 agency partners in Year 1'] },
  { title: 'Community & Content', items: ['D2C Twitter/LinkedIn thought leadership', '"Creative DNA of the Week" viral series', 'Webinars with top D2C founders', 'Cosmisk Brain: free industry insights'] },
];
let gx = 80;
gtm.forEach(g => {
  doc.roundedRect(gx, 150, 370, 450, 16).fill(white);
  doc.fontSize(20).font(fontB).fillColor(navy);
  doc.text(g.title, gx + 24, 178);

  let gy = 220;
  g.items.forEach(item => {
    doc.fontSize(11).font(fontR).fillColor(green);
    doc.text('✓', gx + 24, gy);
    doc.fontSize(14).font(fontR).fillColor(navy);
    doc.text(item, gx + 44, gy, { width: 300 });
    gy += 40;
  });
  gx += 390;
});
slideNumberDark(10);

// ===== SLIDE 11: Roadmap =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(navy);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('ROADMAP', 80, 50, { characterSpacing: 2 });
doc.fontSize(36).font(fontB).fillColor(white);
doc.text('Building the Creative Intelligence OS', 80, 80);

const quarters = [
  { period: 'Q1-Q2 2025', phase: 'Foundation', items: ['Meta Ads integration', 'Creative DNA v1 (Hook, Visual, Audio)', 'Creative Cockpit', 'AI Oracle v1'] },
  { period: 'Q3-Q4 2025', phase: 'Expansion', items: ['Director Lab launch', 'UGC Studio v1 (12 avatars)', 'Lighthouse budget pacing', 'Agency Command Center'] },
  { period: 'Q1-Q2 2026', phase: 'Platform', items: ['Google Ads integration', 'TikTok Ads integration', 'Predictive DNA scoring', 'Advanced attribution'] },
  { period: 'Q3-Q4 2026', phase: 'Scale', items: ['SEA market expansion', 'Custom AI model training', 'Marketplace & API', 'Enterprise features'] },
];
let qx = 80;
quarters.forEach(q => {
  doc.roundedRect(qx, 170, 270, 460, 12).fill('rgba(255,255,255,0.05)');

  doc.fontSize(12).font(fontMonoB).fillColor(accent);
  doc.text(q.period, qx + 20, 190);
  doc.fontSize(20).font(fontB).fillColor(white);
  doc.text(q.phase, qx + 20, 216);

  let qy = 260;
  q.items.forEach(item => {
    doc.fontSize(11).font(fontR).fillColor(green);
    doc.text('→', qx + 20, qy);
    doc.fontSize(13).font(fontR).fillColor('rgba(255,255,255,0.7)');
    doc.text(item, qx + 40, qy, { width: 210 });
    qy += 36;
  });
  qx += 290;
});
slideNumber(11);

// ===== SLIDE 12: Financials =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(cream);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('FINANCIAL PROJECTIONS', 80, 50, { characterSpacing: 2 });
doc.fontSize(36).font(fontB).fillColor(navy);
doc.text('Path to ₹25Cr ARR by 2028', 80, 80);

// Bar chart
const bars = [
  { label: 'FY26', value: '₹1.2Cr', height: 40, opacity: 0.5 },
  { label: 'FY27', value: '₹6Cr', height: 120, opacity: 0.7 },
  { label: 'FY28', value: '₹25Cr', height: 300, opacity: 1 },
];
let barX = 140;
bars.forEach(bar => {
  const barY = 540 - bar.height;
  doc.save();
  doc.opacity(bar.opacity);
  doc.roundedRect(barX, barY, 120, bar.height, 6).fill(accent);
  doc.restore();
  doc.fontSize(16).font(fontMonoB).fillColor(navy);
  doc.text(bar.value, barX, barY - 28, { width: 120, align: 'center' });
  doc.fontSize(14).font(fontB).fillColor(navy);
  doc.text(bar.label, barX, 556, { width: 120, align: 'center' });
  barX += 180;
});
doc.fontSize(12).font(fontR).fillColor(lightGray);
doc.text('Annual Recurring Revenue', 140, 590, { width: 420, align: 'center' });

// Unit Economics
doc.roundedRect(660, 150, 540, 480, 16).fill(white);
doc.fontSize(20).font(fontB).fillColor(navy);
doc.text('Unit Economics', 700, 180);

const metrics = [
  { label: 'Avg Revenue Per Account', value: '₹12,500/mo', color: navy },
  { label: 'Gross Margin', value: '82%', color: green },
  { label: 'CAC Payback Period', value: '4 months', color: navy },
  { label: 'Net Revenue Retention', value: '135%', color: green },
  { label: 'LTV:CAC', value: '8:1', color: accent },
];
let mey = 230;
metrics.forEach(m => {
  doc.fontSize(15).font(fontR).fillColor(gray);
  doc.text(m.label, 700, mey);
  doc.fontSize(15).font(fontMonoB).fillColor(m.color);
  doc.text(m.value, 1020, mey, { width: 140, align: 'right' });
  doc.moveTo(700, mey + 26).lineTo(1160, mey + 26).strokeColor('#F0EDE8').lineWidth(1).stroke();
  mey += 48;
});
slideNumberDark(12);

// ===== SLIDE 13: The Ask =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(navy);

doc.fontSize(12).font(fontB).fillColor(accent);
doc.text('THE ASK', 0, 60, { width: 1280, align: 'center', characterSpacing: 2 });
doc.fontSize(48).font(fontB).fillColor(white);
doc.text('Raising Pre-Series A', 0, 90, { width: 1280, align: 'center' });
doc.fontSize(18).font(fontR).fillColor('rgba(255,255,255,0.6)');
doc.text("To scale India's first AI Creative Intelligence platform", 0, 155, { width: 1280, align: 'center' });

const allocation = [
  { pct: '40%', label: 'Product & AI', desc: 'Google/TikTok integrations,\npredictive DNA, attribution', color: accent },
  { pct: '35%', label: 'Go-to-Market', desc: 'Sales team, agency partnerships,\nD2C community building', color: green },
  { pct: '25%', label: 'Operations', desc: 'SOC 2 compliance,\ninfrastructure, CS team', color: blue },
];
let ax = 190;
allocation.forEach(a => {
  doc.roundedRect(ax, 210, 280, 240, 12).fill('rgba(255,255,255,0.05)');
  doc.fontSize(36).font(fontMonoB).fillColor(a.color);
  doc.text(a.pct, ax, 235, { width: 280, align: 'center' });
  doc.fontSize(18).font(fontB).fillColor('rgba(255,255,255,0.6)');
  doc.text(a.label, ax, 285, { width: 280, align: 'center' });
  doc.fontSize(13).font(fontR).fillColor('rgba(255,255,255,0.4)');
  doc.text(a.desc, ax + 20, 320, { width: 240, align: 'center', lineGap: 3 });
  ax += 310;
});

// 18-month target box
doc.roundedRect(240, 490, 800, 100, 16).strokeColor(accent).lineWidth(2).stroke();
doc.fontSize(13).font(fontR).fillColor('rgba(255,255,255,0.5)');
doc.text('18 Month Runway Target', 240, 510, { width: 800, align: 'center' });
doc.fontSize(15).font(fontR).fillColor('rgba(255,255,255,0.8)');
doc.text('From 500 brands to 2,000+ brands  ·  From Meta only to 3 platforms  ·  From India to SEA', 240, 540, { width: 800, align: 'center' });
slideNumber(13);

// ===== SLIDE 14: Closing =====
doc.addPage();
doc.rect(0, 0, 1280, 720).fill(navy);

doc.fontSize(72).font(fontB).fillColor(white);
doc.text('Cosmisk', 0, 200, { width: 1280, align: 'center' });

doc.fontSize(28).font(fontR).fillColor('rgba(255,255,255,0.7)');
doc.text("Your Ads Have a DNA. Let's Decode It.", 0, 310, { width: 1280, align: 'center' });

// DNA badges
let bbx = 460;
badges.forEach(b => {
  const w = 110;
  doc.roundedRect(bbx, 380, w, 36, 18).fill(b.color);
  doc.fontSize(13).font(fontB).fillColor(b.text);
  doc.text(b.label, bbx, 390, { width: w, align: 'center' });
  bbx += w + 16;
});

doc.fontSize(15).font(fontR).fillColor('rgba(255,255,255,0.4)');
doc.text('Thank you', 0, 480, { width: 1280, align: 'center' });
doc.fontSize(13).font(fontMono).fillColor('rgba(255,255,255,0.3)');
doc.text('cosmisk.io', 0, 510, { width: 1280, align: 'center' });
slideNumber(14);

doc.end();
output.on('finish', () => {
  console.log('PDF generated: pitch-deck.pdf');
});
