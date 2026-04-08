#!/usr/bin/env node
/**
 * Updates Oudh Arabia Google Docs with full Production Brief format.
 * Uses Google Docs API batchUpdate for proper styling (headings, bold, table colors).
 *
 * Run: node run-update.mjs
 * First run will open browser for Google auth (needs Drive + Docs scope).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { homedir } from 'os';
import { URL } from 'url';

const TOKEN_FILE = `${homedir()}/.oudh-docs-token.json`;
const CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
const CLIENT_SECRET = 'v6V3fKV_zWU7iw1DrpO1rknX';
const REDIRECT_URI = 'http://localhost:3456';
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents'
].join(' ');

let ACCESS_TOKEN = '';

// ─── OAuth ──────────────────────────────────────────────────
async function authenticate() {
  if (existsSync(TOKEN_FILE)) {
    try {
      const raw = readFileSync(TOKEN_FILE, 'utf8').trim();
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.refresh_token) {
          console.log('Refreshing cached token...');
          const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
              refresh_token: cached.refresh_token, grant_type: 'refresh_token'
            })
          });
          const data = await res.json();
          if (data.access_token) {
            ACCESS_TOKEN = data.access_token;
            console.log('Token refreshed OK');
            return;
          }
        }
      }
    } catch (e) { /* need new auth */ }
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&prompt=consent`;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Opening browser for Google auth...          ║');
  console.log('║  Please sign in and grant access.            ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const c = url.searchParams.get('code');
      if (c) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Authorized! You can close this tab.</h2><script>window.close()</script>');
        server.close();
        resolve(c);
      }
    });
    server.listen(3456, () => {
      import('child_process').then(({ exec }) => exec(`open "${authUrl}"`));
    });
    setTimeout(() => { server.close(); reject(new Error('Auth timeout (3 min)')); }, 180000);
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI
    })
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error_description);
  ACCESS_TOKEN = tokenData.access_token;
  writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  console.log('Authenticated & cached\n');
}

// ─── Google Docs API helpers ────────────────────────────────
async function docsGet(docId) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
  });
  return res.json();
}

async function docsBatchUpdate(docId, requests) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Docs API: ${data.error.message}`);
  return data;
}

// ─── Build document ─────────────────────────────────────────
function buildDocRequests(s) {
  // We build the full text first, track indices, then add styling
  const requests = [];
  const styles = []; // {start, end, style}

  // All text parts
  const parts = [];
  let idx = 1; // Docs API starts at index 1

  function addText(text) {
    const start = idx;
    parts.push(text);
    idx += text.length;
    return { start, end: idx };
  }

  function addLine(text) {
    return addText(text + '\n');
  }

  // ── Title
  const titleRange = addLine(`Oudh Arabia | UGC Script #${s.num} — ${s.conceptName}`);
  styles.push({ range: titleRange, heading: 'HEADING_1', bold: true });

  addLine('');
  const prodRange = addLine(`Product: ${s.product}`);
  styles.push({ range: prodRange, bold: true });
  const fmtRange = addLine(`Format: ${s.format} | Duration: ${s.duration}`);
  styles.push({ range: fmtRange, bold: true });

  addLine('');
  const conceptRange = addLine(`Concept: ${s.concept}`);
  styles.push({ range: conceptRange, italic: true });

  addLine('');

  // ── COSTUMES
  const costH = addLine('COSTUMES');
  styles.push({ range: costH, heading: 'HEADING_2', bold: true });
  for (const c of s.costumes) {
    const cText = c.link ? `  \u2022 ${c.item} (${c.link})` : `  \u2022 ${c.item}`;
    addLine(cText);
  }
  addLine('');

  // ── PROPS
  const propH = addLine('PROPS');
  styles.push({ range: propH, heading: 'HEADING_2', bold: true });
  for (const p of s.props) {
    addLine(`  \u2022 ${p}`);
  }
  addLine('');

  // ── REFERENCES
  const refH = addLine('REFERENCES');
  styles.push({ range: refH, heading: 'HEADING_2', bold: true });
  for (const r of s.references) {
    const rText = r.link ? `  \u2022 ${r.desc} — ${r.link}` : `  \u2022 ${r.desc}`;
    addLine(rText);
  }
  addLine('');

  // ── CREATIVE FORMAT (header before table)
  const cfH = addLine('CREATIVE FORMAT');
  styles.push({ range: cfH, heading: 'HEADING_2', bold: true });
  addLine('');

  // Table will be inserted at this index
  const tableInsertIndex = idx;

  // ── After-table content (we'll insert after the table)
  // Build it separately, track what goes after
  const afterParts = [];
  afterParts.push('\n');
  afterParts.push('HOOK VARIATIONS\n');
  afterParts.push(`  1. ${s.hook1}\n`);
  afterParts.push(`  2. ${s.hook2}\n`);
  afterParts.push(`  3. ${s.hook3}\n`);
  afterParts.push('\n');

  if (s.onScreenText && s.onScreenText.length > 0) {
    afterParts.push('ON-SCREEN TEXT OVERLAYS\n');
    for (const t of s.onScreenText) {
      afterParts.push(`  \u2022 ${t}\n`);
    }
    afterParts.push('\n');
  }

  if (s.thumbnailFrame) {
    afterParts.push('THUMBNAIL FRAME\n');
    afterParts.push(`${s.thumbnailFrame}\n`);
    afterParts.push('\n');
  }

  afterParts.push('CREATOR NOTES\n');
  afterParts.push(`${s.creatorNotes}\n`);
  afterParts.push('\n');

  afterParts.push('FULL SCRIPT\n');
  const scriptLines = s.fullScript.split('\n');
  for (const line of scriptLines) {
    afterParts.push(`${line}\n`);
  }
  afterParts.push('\n');

  // Separator
  afterParts.push('\u2501'.repeat(40) + '\n');
  afterParts.push('\n');

  // V1 Original
  afterParts.push('V1 \u2014 ORIGINAL SCRIPT (preserved for reference)\n');
  const v1Lines = s.v1.split('\n');
  for (const line of v1Lines) {
    afterParts.push(`${line}\n`);
  }
  afterParts.push('\n');

  // Footer
  afterParts.push('V2 \u2014 Revised by Smashed Agency (Claude) | Fact-checked against oudarabiadubai.com\n');
  afterParts.push('Generated by Smashed Agency UGC Script Agent\n');
  afterParts.push(`Client: OUDH | ${new Date().toISOString().split('T')[0]}\n`);

  const afterText = afterParts.join('');
  const preTableText = parts.join('');

  // Now build the actual requests
  return { preTableText, tableInsertIndex, afterText, styles, voiceover: s.voiceover };
}

async function updateDoc(s) {
  console.log(`\n  ${s.name} — ${s.conceptName}...`);

  // Step 1: Read current doc to get end index
  const doc = await docsGet(s.docId);
  const body = doc.body?.content || [];
  const endIdx = body[body.length - 1]?.endIndex || 2;

  const { preTableText, tableInsertIndex, afterText, styles, voiceover } = buildDocRequests(s);
  const tableRows = voiceover.length + 1; // +1 header

  // Step 2: Clear doc
  const clearRequests = [];
  if (endIdx > 2) {
    clearRequests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIdx - 1 } } });
  }
  if (clearRequests.length) await docsBatchUpdate(s.docId, clearRequests);

  // Step 3: Insert pre-table text
  await docsBatchUpdate(s.docId, [{ insertText: { location: { index: 1 }, text: preTableText } }]);

  // Step 4: Insert table
  await docsBatchUpdate(s.docId, [{
    insertTable: { location: { index: tableInsertIndex }, rows: tableRows, columns: 3 }
  }]);

  // Step 5: Read doc again to find table cell indices
  const doc2 = await docsGet(s.docId);
  const content2 = doc2.body?.content || [];
  let table = null;
  for (const el of content2) {
    if (el.table) { table = el; break; }
  }

  if (!table) {
    console.log('    WARNING: Table not found, skipping cell population');
    return;
  }

  // Step 6: Populate table cells (reverse order)
  const headerLabels = ['Voiceover / Dialogue', 'Visuals / Camera', 'References'];
  const cellInserts = [];
  const rows = table.table.tableRows;

  // Header row
  for (let c = 0; c < 3; c++) {
    const cell = rows[0].tableCells[c];
    const paraStart = cell.content?.[0]?.startIndex;
    if (paraStart != null) cellInserts.push({ index: paraStart, text: headerLabels[c] });
  }

  // Data rows
  for (let r = 1; r < rows.length; r++) {
    const scene = voiceover[r - 1] || {};
    const texts = [scene.vo || '', scene.visual || '', scene.ref || ''];
    for (let c = 0; c < 3; c++) {
      const cell = rows[r].tableCells[c];
      const paraStart = cell.content?.[0]?.startIndex;
      if (paraStart != null && texts[c]) cellInserts.push({ index: paraStart, text: texts[c] });
    }
  }

  // Sort descending by index
  cellInserts.sort((a, b) => b.index - a.index);
  const cellRequests = cellInserts.map(ci => ({
    insertText: { location: { index: ci.index }, text: ci.text }
  }));
  if (cellRequests.length) await docsBatchUpdate(s.docId, cellRequests);

  // Step 7: Read doc again to get table end, insert after-text
  const doc3 = await docsGet(s.docId);
  const content3 = doc3.body?.content || [];
  const lastEl = content3[content3.length - 1];
  const afterIdx = lastEl.endIndex - 1;

  await docsBatchUpdate(s.docId, [{
    insertText: { location: { index: afterIdx }, text: afterText }
  }]);

  // Step 8: Apply styling
  const doc4 = await docsGet(s.docId);
  const styleRequests = [];

  // Style table header row (dark bg, white text, bold)
  for (const el of doc4.body.content) {
    if (el.table) {
      const hRow = el.table.tableRows[0];
      for (let c = 0; c < 3; c++) {
        const cell = hRow.tableCells[c];
        const cellStart = cell.content?.[0]?.startIndex;
        const cellEnd = cell.content?.[cell.content.length - 1]?.endIndex;
        if (cellStart != null && cellEnd != null) {
          styleRequests.push({
            updateTextStyle: {
              range: { startIndex: cellStart, endIndex: cellEnd },
              textStyle: { bold: true, foregroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } } },
              fields: 'bold,foregroundColor'
            }
          });
          // Cell bg color
          styleRequests.push({
            updateTableCellStyle: {
              tableRange: {
                tableCellLocation: { tableStartLocation: { index: el.startIndex }, rowIndex: 0, columnIndex: c },
                rowSpan: 1, columnSpan: 1
              },
              tableCellStyle: { backgroundColor: { color: { rgbColor: { red: 0.1, green: 0.1, blue: 0.18 } } } },
              fields: 'backgroundColor'
            }
          });
        }
      }
      break;
    }
  }

  // Find and style section headers
  for (const el of doc4.body.content) {
    if (!el.paragraph) continue;
    const text = el.paragraph.elements?.map(e => e.textRun?.content || '').join('') || '';
    const trimmed = text.trim();
    const pStart = el.startIndex;
    const pEnd = el.endIndex;

    // Title (first line)
    if (trimmed.startsWith('Oudh Arabia | UGC Script')) {
      styleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          paragraphStyle: { namedStyleType: 'HEADING_1' },
          fields: 'namedStyleType'
        }
      });
      styleRequests.push({
        updateTextStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          textStyle: { bold: true },
          fields: 'bold'
        }
      });
    }

    // Section headers (H2)
    const h2Headers = ['COSTUMES', 'PROPS', 'REFERENCES', 'CREATIVE FORMAT', 'HOOK VARIATIONS',
      'ON-SCREEN TEXT OVERLAYS', 'THUMBNAIL FRAME', 'CREATOR NOTES', 'FULL SCRIPT'];
    if (h2Headers.includes(trimmed)) {
      styleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          paragraphStyle: { namedStyleType: 'HEADING_2' },
          fields: 'namedStyleType'
        }
      });
      styleRequests.push({
        updateTextStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          textStyle: { bold: true },
          fields: 'bold'
        }
      });
    }

    // Product / Format lines
    if (trimmed.startsWith('Product:') || trimmed.startsWith('Format:')) {
      styleRequests.push({
        updateTextStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          textStyle: { bold: true },
          fields: 'bold'
        }
      });
    }

    // Concept line (italic)
    if (trimmed.startsWith('Concept:')) {
      styleRequests.push({
        updateTextStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          textStyle: { italic: true },
          fields: 'italic'
        }
      });
    }

    // V1 header
    if (trimmed.startsWith('V1 \u2014 ORIGINAL')) {
      styleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          paragraphStyle: { namedStyleType: 'HEADING_3' },
          fields: 'namedStyleType'
        }
      });
      styleRequests.push({
        updateTextStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          textStyle: { foregroundColor: { color: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } } } },
          fields: 'foregroundColor'
        }
      });
    }

    // Footer lines (gray, italic)
    if (trimmed.startsWith('V2 \u2014 Revised by') || trimmed.startsWith('Generated by Smashed') || trimmed.startsWith('Client: OUDH')) {
      styleRequests.push({
        updateTextStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          textStyle: {
            italic: trimmed.startsWith('V2'),
            foregroundColor: { color: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } } }
          },
          fields: 'italic,foregroundColor'
        }
      });
    }

    // Separator line (gray)
    if (trimmed.startsWith('\u2501\u2501')) {
      styleRequests.push({
        updateTextStyle: {
          range: { startIndex: pStart, endIndex: pEnd },
          textStyle: { foregroundColor: { color: { rgbColor: { red: 0.8, green: 0.8, blue: 0.8 } } } },
          fields: 'foregroundColor'
        }
      });
    }
  }

  if (styleRequests.length) {
    await docsBatchUpdate(s.docId, styleRequests);
  }

  console.log(`    DONE — styled with ${styleRequests.length} formatting requests`);
}

// ─── Script Data ────────────────────────────────────────────
// All 6 Oudh Arabia scripts — R2 (team feedback addressed) + ASMR/dark aesthetic
const scripts = [
  {
    docId: '12QE1dRxIuja47zKVgMhHC0bxeC30ztyGk5koAfvKtdM',
    name: 'C1', num: 1,
    conceptName: 'Longevity Proof — Morning-to-Night',
    product: 'Oudh Arabia Attar (Dagger Bottle, 10ml)',
    format: 'UGC Talking Head + ASMR Close-ups',
    duration: '25 sec',
    concept: 'Creator applies attar at 7 AM and documents real compliments through the day — proving 48-hour longevity through lived experience. Dark, moody morning routine aesthetic. Car compliment scene as the proof moment.',
    costumes: [
      {item: 'Black crew neck t-shirt (fitted)', link: 'https://pinterest.com/search/pins/?q=black+fitted+crew+neck+tee+men'},
      {item: 'Dark denim or black jeans', link: 'https://pinterest.com/search/pins/?q=dark+denim+jeans+men+slim'},
      {item: 'Minimal silver chain or watch', link: 'https://pinterest.com/search/pins/?q=minimal+silver+chain+men+dark+aesthetic'}
    ],
    props: ['Oudh Arabia Dagger attar bottle (10ml)', 'Dark bathroom counter / marble surface', 'Car interior (premium if possible)', 'Phone showing clock/time (proof shots)', 'Warm ambient lamp (moody lighting)'],
    references: [
      {desc: 'ASMR close-up wrist application — dark background, warm lighting'},
      {desc: 'Time-lapse day-to-night transition — premium lifestyle'},
      {desc: 'Ref: Jannat E Zuhur ASMR ad (13% hook rate, 2.82 ROAS)'}
    ],
    hook1: 'I put this on at 7 AM. It\'s 11 PM and people are still asking about it.',
    hook2: 'One application. Sixteen hours of compliments.',
    hook3: 'Every fragrance I owned died in 2 hours. Then I found this.',
    onScreenText: ['7:00 AM — applied', '11:00 PM — still projecting', '48-HOUR longevity. Oil-based.'],
    thumbnailFrame: 'Dark close-up: dagger bottle on dark marble surface, warm amber light, oil glistening. Text: "48 HOURS"',
    creatorNotes: 'MALE CREATOR. Dark/moody aesthetic throughout — no bright casual settings. Morning scene: dark bathroom, warm amber lighting, close-up ASMR application of oil from dagger bottle. The oil-on-wrist moment should be the visual hook (close-up, slow, sensory). Evening car scene: premium interior, warm dashboard light. Tone: genuine surprise, NOT salesy. Mumbai heat reference = relatable for Indian metros. Pause [beat] before time reveal. Data note: ASMR close-ups get 13% hook rate vs 3% for pure talking head — lean into the product shots.',
    voiceover: [
      {vo: '[ASMR close-up, no talking] Dagger bottle opening, oil drop on wrist.', visual: 'Extreme close-up: dagger-shaped bottle, dark background, warm amber lighting. Oil drops onto wrist. ASMR audio — cap click, oil sound. Text: "7:00 AM"', ref: '[Style: ASMR product shot, dark moody, ref Jannat E Zuhur ad format]'},
      {vo: 'I put this on at 7 AM. [beat] It\'s 11 PM and people are still asking about it.', visual: 'Medium shot: creator in dark room, direct to camera. Warm side lighting only. Confident, slightly amused.', ref: '[Style: dark talking head, single warm light source]'},
      {vo: 'Every fragrance I owned would vanish in two hours. In Mumbai heat? Forget it.', visual: 'Quick cut: frustrated expression. Maybe a generic spray bottle tossed aside. Dark tones.', ref: '[Style: quick cuts, moody]'},
      {vo: 'Oudh Arabia. Oil-based, no alcohol — completely different game.', visual: 'Product hero: dagger bottle held up to camera. Close-up of the distinctive shape. Oil glistening on wrist.', ref: '[Style: product reveal, dark background, warm highlight]'},
      {vo: 'Sixteen hours later, my friend gets in the car — "Bro, what IS that?" Still projecting.', visual: 'Car interior: warm dashboard lighting. Friend in passenger seat leans in, genuine reaction. Text: "11:00 PM"', ref: '[Style: premium car interior, evening, candid]'},
      {vo: 'Link\'s in the bio.', visual: 'Product flat lay: dagger bottle on dark surface, Oudh Arabia branding. Warm spotlight.', ref: '[Style: minimal dark product shot]'}
    ],
    fullScript: '[ASMR OPEN: Close-up of dagger bottle. Cap click. Oil drops on wrist. Dark background, warm light.]\n\nI put this on at 7 AM. [beat] It\'s 11 PM and people are still asking about it.\n\nEvery fragrance I owned would vanish in two hours. In Mumbai heat? Forget it.\n\nOudh Arabia. Oil-based, no alcohol — completely different game. You dab it on [shows application] and it bonds with your skin.\n\nSixteen hours later, my friend gets in the car — "Bro, what IS that?" Still projecting.\n\nLink\'s in the bio.',
    v1: 'HOOK: "15 hours. Still getting compliments."\nOkay, so I\'m kind of obsessed with fragrances, right? And I\'ve been through a lot. But like, most of them, they just die after a few hours. So frustrating. Then I found this. This is the Dagger Attar from Oudh Arabia. It\'s a pure, alcohol-free attar, and honestly, the longevity blew my mind. I put it on this morning at, like, 7 AM. It\'s now... 10 PM. That\'s 15 hours. And my colleague, seriously, she just told me I smell amazing. After 15 hours! The secret is, it\'s oil-based, so it bonds with your skin differently than a spray. It\'s not just about smelling good for a bit; it\'s about carrying that scent with you all day, even into the night. If you want a fragrance that genuinely lasts, check out Oudh Arabia. I\'ll put the link, you know, somewhere around here.'
  },
  {
    docId: '17EB11DvKGMUY7yaVEOrdkvyFChA_clvK8dZHir5dU1E',
    name: 'C2', num: 2,
    conceptName: 'ASMR Unboxing — Premium Reveal',
    product: 'Oudh Arabia Attar (Dagger Bottle, 10ml)',
    format: 'ASMR Unboxing + Voiceover',
    duration: '25 sec',
    concept: 'Pure ASMR unboxing of the dagger attar — Arabic calligraphy packaging, premium box reveal, first application. Minimal voiceover, maximum sensory experience. Proven format: 13% hook rate.',
    costumes: [
      {item: 'Dark henley or black button-up (sleeves rolled)', link: 'https://pinterest.com/search/pins/?q=dark+henley+men+premium+aesthetic'},
      {item: 'Hands/wrists only visible for most of the video', link: ''}
    ],
    props: ['Oudh Arabia Dagger attar bottle with full packaging/box', 'Dark marble or wood surface', 'Warm ambient light (single source)', 'Tissue paper / unboxing materials'],
    references: [
      {desc: 'ASMR perfume unboxing — dark background, close-up hands, no music'},
      {desc: 'Ref: Jannat E Zuhur ASMR ad — 4.97L spend, 2.82 ROAS, 13% hook rate'},
      {desc: 'Arabic calligraphy packaging = visual hook (premium unboxing experience)'}
    ],
    hook1: '[No words — just the sound of the box opening]',
    hook2: 'Three people asked what I was wearing. In one day.',
    hook3: 'The packaging alone made me feel like royalty.',
    onScreenText: ['Pure attar. Oil-based.', 'Alcohol-free. 48-hour longevity.', '3 compliments. 1 day.'],
    thumbnailFrame: 'Dark marble surface, dagger bottle half-out of premium box, Arabic calligraphy visible, warm amber spotlight from above',
    creatorNotes: 'MALE CREATOR. This is the HIGHEST-PERFORMING format based on ad data — ASMR unboxing gets 13% hook rate vs 3% for talking head. Keep it mostly silent with ASMR audio (box opening, tissue paper, cap click, oil application). Voiceover starts only after the visual hook has landed (3-4 seconds of pure ASMR first). Dark background is CRITICAL — dark marble/wood surface, single warm light source from the side. Arabic calligraphy on the packaging IS the scroll-stopper. Hands should look masculine, well-groomed. The social proof ("three people asked") comes as voiceover over the application scene.',
    voiceover: [
      {vo: '[SILENT — ASMR only] Box opening sounds. Tissue paper rustling.', visual: 'Extreme close-up: hands lifting premium box lid. Arabic calligraphy packaging visible. Dark surface, single warm light. ASMR audio only — no music, no voice.', ref: '[Style: ASMR unboxing, dark luxury, ref Jannat E Zuhur top ad]'},
      {vo: '[SILENT — ASMR only] Dagger bottle reveal.', visual: 'Hands lift out dagger-shaped bottle from tissue. Hold it up to light — the distinctive shape catches the amber glow. Still no voice.', ref: '[Style: product reveal moment, dramatic lighting]'},
      {vo: '[VO begins, calm] Three people asked what I was wearing. In one day.', visual: 'Close-up: opening dagger cap (click sound). Applying oil on inner wrist. Oil glistens.', ref: '[Style: ASMR application, wrist close-up]'},
      {vo: 'Oil-based. Alcohol-free. This isn\'t a spray — it\'s a completely different experience.', visual: 'Creator brings wrist to nose, eyes closed momentarily. Then medium shot: dark room, looking at camera with quiet confidence.', ref: '[Style: sensory moment, dark talking head]'},
      {vo: '48-hour longevity. Oudh Arabia. Link in bio.', visual: 'Product flat lay: dagger bottle on dark surface next to open box. Warm spotlight. Text overlay with CTA.', ref: '[Style: premium flat lay, dark background]'}
    ],
    fullScript: '[ASMR OPEN — no voice, just sounds]\n[Box opening. Tissue paper rustling. Hands reveal premium Arabic calligraphy packaging.]\n[Dagger bottle lifted out. Cap click. Oil applied on wrist.]\n\n[VO begins — calm, confident]\nThree people asked what I was wearing. In one day.\n\nOil-based. Alcohol-free. This isn\'t a spray — it\'s a completely different experience.\n\n48-hour longevity. Oudh Arabia. Link in bio.',
    v1: 'HOOK: "They asked, \'What are you wearing?\'"\nThey asked, \'What are you wearing?\' Okay so, before this, my perfumes were just... there, you know? Nobody ever noticed, like. It was just for me. Which is fine, but sometimes you want that, that attention, right? Then I got Oudh Arabia\'s Dagger Attar. Bro, this thing is different. It\'s an alcohol-free attar, which I mean, I didn\'t even know that was a thing until I found Oudh Arabia. The first time I wore it, seriously, my colleague, like, she walked past me and stopped. She was like, \'Yaar, what are you wearing? It smells so good!\' And that was, um, literally like, four hours after I put it on. Then later at the chai tapri, even the auto uncle was like \'Kya khushboo hai beta!\' I was blown away! If you want that \'what are you wearing\' vibe, this is it. I\'ll drop the link, check it out, I guess.'
  },
  {
    docId: '1Fi3OJZ1QUJ6b9LGE4v-P2GQ-dbMqXW4cu-r3Ds8nkRk',
    name: 'C3', num: 3,
    conceptName: 'Luxury Discovery — Note Journey',
    product: 'Dakhoon (100ml Oil-based Perfume, Rs 5,890)',
    format: 'UGC Talking Head + Close-up Product Shots',
    duration: '30 sec',
    concept: 'Fragrance connoisseur discovers Dakhoon\'s complex note evolution — Agarwood/Rose/Vanilla opening, Saffron/Frankincense heart, Leather/Musk/Amber dry-down. Dark, intimate setting. Premium discovery that smells like it costs 3x more.',
    costumes: [
      {item: 'Black turtleneck or high-neck knit', link: 'https://pinterest.com/search/pins/?q=black+turtleneck+men+minimal+dark+aesthetic'},
      {item: 'Dark tailored trousers', link: 'https://pinterest.com/search/pins/?q=dark+tailored+trousers+men+minimal'},
      {item: 'Leather bracelet or dark-face watch', link: 'https://pinterest.com/search/pins/?q=leather+bracelet+men+dark+minimal'}
    ],
    props: ['Dakhoon 100ml bottle', 'Dark marble/wood surface for flat lay', 'Single warm light source (candle or amber lamp)', 'Notebook or leather journal (fragrance connoisseur aesthetic)'],
    references: [
      {desc: 'Fragrance reviewer style — dark studio, holding bottle, describing note evolution'},
      {desc: 'Dark moody aesthetic — warm amber tones, close-up product hero shots'},
      {desc: 'Ref: Close-up product shots with dark backgrounds (proven concept from brief)'}
    ],
    hook1: 'This perfume has Agarwood, Rose, AND Leather. In one bottle.',
    hook2: 'A perfume that changes three times after you apply it.',
    hook3: 'I\'ve never experienced this kind of complexity from an Indian brand.',
    onScreenText: ['Top: Agarwood + Rose + Vanilla', 'Heart: Saffron + Omani Frankincense', 'Base: Leather + Powder Musk + Amber', '48-HOUR LONGEVITY'],
    thumbnailFrame: 'Dark close-up: creator holding Dakhoon bottle to nose, eyes closed, single warm amber light on face. Note names as text overlay.',
    creatorNotes: 'MALE CREATOR. CRITICAL: Dakhoon is a 100ml OIL-BASED PERFUME (Rs 5,890), NOT incense. Do NOT reference burning, charcoal, or home fragrance. Dark/moody aesthetic is essential — this is the luxury discovery angle. Think fragrance reviewer in a dimly lit studio, not a casual bedroom. Describe the note evolution with sensory language: "warm," "deep," "resinous." Use ASMR close-ups for the oil application moment. The "next day" friend reaction is the proof. Notes: Top — Agarwood, Rose, Vanilla. Heart — Saffron, Omani Frankincense, Praline, Guaiac Wood. Base — Leather, Powder Musk, Amber.',
    voiceover: [
      {vo: '[ASMR] Close-up of Dakhoon bottle on dark surface. Hand picks it up.', visual: 'Dark marble surface. Single warm light from left. Dakhoon 100ml bottle. Hand enters frame, picks it up slowly. ASMR audio — glass on marble.', ref: '[Style: dark product intro, ASMR, ref close-up dark background concept]'},
      {vo: 'This perfume has Agarwood, Rose, AND Leather. In one bottle.', visual: 'Medium shot: creator in dark room, single warm light on face. Holding bottle. Intrigued, knowing expression.', ref: '[Style: dark talking head, moody amber lighting]'},
      {vo: 'Most perfumes give you one, maybe two notes, then they\'re gone in a couple hours.', visual: 'Quick dismissive gesture. Dark background maintained.', ref: '[Style: conversational, dark setting]'},
      {vo: 'Oudh Arabia\'s Dakhoon — 100ml, oil-based. The note journey is insane.', visual: 'Close-up: applying oil on wrist. Golden liquid visible. Dark background.', ref: '[Style: ASMR application moment]'},
      {vo: 'Agarwood and Rose upfront with warm Vanilla. Then Saffron and Omani Frankincense. And it settles into deep Leather, Musk, Amber.', visual: 'Creator smelling wrist, eyes closed, genuine appreciation. Text overlays: note names appear and fade. Moody, intimate.', ref: '[Style: sensory moment, slow pacing, dark intimate]'},
      {vo: 'My friend came over the next day — "Yaar, what is that smell?" 48-hour longevity. Link in bio.', visual: 'Brief friend reaction. Cut to product hero: Dakhoon bottle, dark surface, warm spotlight. CTA.', ref: '[Style: proof moment, clean dark CTA]'}
    ],
    fullScript: '[ASMR OPEN: Dakhoon bottle on dark marble. Hand picks it up. Glass-on-stone sound.]\n\nThis perfume has Agarwood, Rose, AND Leather. In one bottle.\n\nMost perfumes give you one, maybe two notes, and then they\'re gone in a couple hours.\n\nOudh Arabia\'s Dakhoon is different. 100ml, oil-based, no alcohol. And the note journey is insane.\n\nYou get Agarwood and Rose upfront with this warm Vanilla. Then Saffron and Omani Frankincense come through in the heart. And it settles into this deep Leather, Powder Musk, Amber base. [beat]\n\nBecause it\'s oil-based, it doesn\'t vanish — 48-hour longevity. My friend came over the NEXT DAY and was like "Yaar, what is that smell? Your room still smells amazing."\n\nLink in bio. Oudh Arabia.',
    v1: 'HOOK: "Ancient secret, you\'re missing out."\nAncient secret, you\'re missing out. Most of us, we rely on diffusers or candles for home fragrance, right? But they\'re often synthetic, and the scent, it just... dissipates so quickly. Doesn\'t really fill the space. What if I told you there\'s an ancient Arabian tradition that not only purifies your space but also leaves a rich, lasting aroma for hours? This is Dakhoon from Oudh Arabia. So, basically, you light a charcoal, place a small piece of this dakhoon on it, and it slowly releases these beautiful, complex notes. Not just covering odors, but actually transforming the ghar ka mahaul.\n\n[NOTE: V1 was FACTUALLY INCORRECT — treated Dakhoon as incense. It is a 100ml oil-based perfume.]'
  },
  {
    docId: '1qk2EN0O2hGfgsojh5XjpWMC65_Q_XXuls_9baPvDRO0',
    name: 'C4', num: 4,
    conceptName: 'Scent Comparison — Spray vs Oil',
    product: 'Dakhoon (100ml Oil-based Perfume, Rs 5,890)',
    format: 'ASMR Comparison + Voiceover',
    duration: '25 sec',
    concept: 'Side-by-side comparison: alcohol spray that fades vs oil-based Dakhoon that lasts. Visual format — apply both, show the difference. Roommate as the blind judge. Proven concept: scent-comparison hooks.',
    costumes: [
      {item: 'Dark hoodie or premium sweatshirt (black/charcoal)', link: 'https://pinterest.com/search/pins/?q=premium+black+hoodie+men+minimal'},
      {item: 'Dark joggers or track pants', link: 'https://pinterest.com/search/pins/?q=dark+joggers+men+premium+minimal'}
    ],
    props: ['Dakhoon 100ml bottle', 'Generic alcohol spray bottle (comparison)', 'Dark surface for side-by-side placement', 'Timer/clock (proof of lasting)', 'Roommate (second person for blind test reaction)'],
    references: [
      {desc: 'Side-by-side comparison UGC — two products, one winner'},
      {desc: 'Blind test / roommate reaction format'},
      {desc: 'Ref: Scent-comparison hooks (proven concept from brief data)'}
    ],
    hook1: 'Alcohol spray vs oil perfume. Same wrist. 12 hours later.',
    hook2: 'My roommate couldn\'t tell which wrist had the expensive one.',
    hook3: 'One wrist: nothing. Other wrist: still going. Guess which is which.',
    onScreenText: ['LEFT: Alcohol spray', 'RIGHT: Dakhoon oil', '12 hours later...', 'Oil wins. Every time.'],
    thumbnailFrame: 'Dark surface: generic spray bottle on left, Dakhoon bottle on right. Text overlay: "SPRAY vs OIL — 12 Hour Test"',
    creatorNotes: 'MALE CREATOR. CRITICAL: Dakhoon is a 100ml OIL-BASED PERFUME (Rs 5,890), NOT incense. Notes: Agarwood/Rose/Vanilla > Saffron/Frankincense > Leather/Musk/Amber. This is a SCENT-COMPARISON hook (proven concept from brief). Apply generic spray on one wrist, Dakhoon oil on the other — show the visual difference (spray evaporates, oil stays). The roommate blind test is the proof. DO NOT say "cheap" or "affordable" — position as accessible luxury. Dark/moody aesthetic, premium apartment setting.',
    voiceover: [
      {vo: '[ASMR] Generic spray on left wrist. Dakhoon oil on right wrist.', visual: 'Dark surface. Two wrists. Left: spray mist evaporates quickly. Right: oil drop from Dakhoon bottle, glistens. ASMR audio. Text labels: "SPRAY" and "OIL"', ref: '[Style: ASMR comparison, dark background, side-by-side]'},
      {vo: 'Alcohol spray versus oil perfume. Same wrist. Let\'s see what happens.', visual: 'Quick montage: applying both. Creator rubbing wrists. Timer starts. Dark room.', ref: '[Style: test setup, methodical]'},
      {vo: '4 hours later — spray wrist? Nothing. Oil wrist? Deep Agarwood and Rose.', visual: 'Close-up: smelling left wrist (disappointed), smelling right wrist (nodding). Text: "4 HOURS"', ref: '[Style: comparison reveal, dark setting]'},
      {vo: '12 hours — roommate walks in. "What\'s that smell?" [beat] He\'s pointing at the oil wrist.', visual: 'Evening: roommate enters, sniffs air. Points at right wrist instinctively. Genuine reaction. Text: "12 HOURS"', ref: '[Style: blind test proof, candid]'},
      {vo: 'Oudh Arabia Dakhoon. Oil-based. 48 hours. This is a different category. Link in bio.', visual: 'Product hero: Dakhoon bottle, dark surface, warm spotlight. CTA overlay.', ref: '[Style: clean dark product shot, premium]'}
    ],
    fullScript: '[ASMR OPEN: Dark surface. Generic spray on left wrist — mist disappears. Dakhoon oil on right wrist — glistens.]\n\nAlcohol spray versus oil perfume. Same person, same day. Let\'s see.\n\n4 hours later — spray wrist? [sniffs] Nothing. Oil wrist? Deep Agarwood and Rose, still strong.\n\n12 hours — my roommate walks in. "What\'s that smell?" [beat] He\'s pointing at the oil wrist. Didn\'t even know it was a test.\n\nOudh Arabia\'s Dakhoon. Oil-based, 48-hour longevity. This isn\'t a perfume upgrade — it\'s a different category entirely.\n\nLink in bio.',
    v1: 'HOOK: "My home\'s secret weapon."\nMy home\'s secret weapon. So, we all want our homes to smell nice, right? But like, those air fresheners, they\'re all chemicals and they last like, thirty minutes? Not ideal.\n\n[NOTE: V1 was FACTUALLY INCORRECT — treated Dakhoon as incense/agarbatti. It is a 100ml oil-based perfume.]'
  },
  {
    docId: '1msUH7QbK4kRu49NwUq0JoZquOBFtZqZXeAZZqUQM8NQ',
    name: 'C5', num: 5,
    conceptName: 'Longevity Frustration Solved',
    product: 'Jannat E Zuhur — Blend 99 (Oil-based Attar, Rs 1,990\u20132,990)',
    format: 'ASMR Unboxing + Talking Head',
    duration: '25 sec',
    concept: 'Universal frustration angle — everyone\'s paid thousands for sprays that vanish by lunch. Jannat E Zuhur\'s blend of 99 flower oils lasts 48 hours. Opens with ASMR crystal bottle unboxing, transitions to talking head. The "next day hug" is the proof moment.',
    costumes: [
      {item: 'Dark kurta or indo-western black top', link: 'https://pinterest.com/search/pins/?q=dark+kurta+men+minimal+indian+premium'},
      {item: 'Dark cotton trousers', link: 'https://pinterest.com/search/pins/?q=dark+cotton+trousers+men+indian'}
    ],
    props: ['Jannat E Zuhur crystal bottle (6ml or 12ml) with packaging', 'Dark surface for unboxing', 'Warm single light source', 'Generic spray bottles (for frustration scene — toss aside)'],
    references: [
      {desc: 'ASMR crystal bottle unboxing — premium tactile experience'},
      {desc: 'Ref: Jannat E Zuhur ASMR ad (4.97L spend, 2.82 ROAS) — best performer'},
      {desc: 'Frustration-to-amazement emotional arc'}
    ],
    hook1: '48 hours. From ONE application.',
    hook2: 'I applied this yesterday. My friend smelled it TODAY.',
    hook3: 'Blend of 99 flower oils. Under 3,000 rupees.',
    onScreenText: ['Most sprays: 2\u20133 hours', 'Jannat E Zuhur: 48 HOURS', '99 flower oils. Under Rs 3,000'],
    thumbnailFrame: 'Dark surface: crystal attar bottle with warm amber glow, "48 HOURS" text large, "99 Flower Oils" subtitle',
    creatorNotes: 'MALE CREATOR. Jannat E Zuhur is an oil-based attar, "Blend 99" = blend of 99 flower oils. Prices: Crystal 6ml Rs 1,990, Crystal 12ml Rs 2,990. This is the BEST-PERFORMING product in their ad account (4.97L spend, 2.82 ROAS) and the top format was ASMR unboxing. Start with ASMR of the crystal bottle — the packaging IS the hook. Dark background, warm light. Transition to talking head for the frustration/proof arc. The "next day hug" proof is powerful — it\'s the emotional peak. DO NOT say "cheap" or "budget" — position as exceptional value. Dark/moody aesthetic throughout.',
    voiceover: [
      {vo: '[ASMR — no voice] Crystal bottle unboxing on dark surface.', visual: 'Extreme close-up: hands opening crystal bottle packaging on dark surface. Warm amber light. Cap removal (crystal click sound). ASMR audio only.', ref: '[Style: ASMR unboxing, ref Jannat E Zuhur top-performing ad]'},
      {vo: '48 hours. From ONE application.', visual: 'Bold text on screen. Creator looking directly at camera. Dark room, single warm light. Firm, confident delivery.', ref: '[Style: bold statement hook, dark minimal]'},
      {vo: 'The biggest problem with sprays? You pay thousands and they vanish by lunch.', visual: 'Quick cut: frustrated expression. Generic spray bottle tossed aside on dark surface.', ref: '[Style: frustration beat, dark tones]'},
      {vo: 'Jannat E Zuhur from Oudh Arabia. Oil-based, no alcohol. A blend of 99 flower oils.', visual: 'Product reveal: crystal bottle in warm light. Close-up of oil application on wrist. Golden. Text: "99 Flower Oils"', ref: '[Style: product hero, ASMR application, warm tones]'},
      {vo: 'Applied it yesterday morning. My friend hugged me today — "You smell incredible, what is that?" [beat] The NEXT DAY.', visual: 'Friend hug scene. Friend pulls back, surprised. Creator points at wrist, amazed. Dark warm setting.', ref: '[Style: genuine proof moment, intimate]'},
      {vo: 'Under three thousand rupees. Oudh Arabia. Link in bio.', visual: 'Product flat lay: crystal bottle on dark surface, warm spotlight. Price text. CTA overlay.', ref: '[Style: clean dark CTA, premium feel]'}
    ],
    fullScript: '[ASMR OPEN: Crystal bottle on dark surface. Hands open packaging. Cap click. Oil glistens in warm light.]\n\n48 hours. From ONE application.\n\nThe biggest problem with sprays? You pay thousands and they vanish by lunch. Three hours max.\n\nJannat E Zuhur from Oudh Arabia. Oil-based, no alcohol — a blend of 99 flower oils.\n\nI applied it yesterday morning. My friend hugged me today and said "You smell incredible, what is that?" [beat] That\'s the NEXT DAY.\n\nUnder three thousand rupees. Oudh Arabia. Link in bio.',
    v1: 'HOOK: "My perfume used to vanish."\nMy perfume used to vanish. The biggest frustration with most fragrances? They don\'t last. Two, maybe three hours, and then you\'re just... gone.\n\n[V1 errors: Said "ten hours" — actual longevity is 48 hours.]'
  },
  {
    docId: '1YalRtQ1kcoPHiFW-TznsQCD01fcMgSaPYmRNgz0-Tw8',
    name: 'C6', num: 6,
    conceptName: 'Skeptic Test — 48 Hour Challenge',
    product: 'Voice of the Soul (100ml Oil-based Perfume, Rs 5,890)',
    format: 'UGC Talking Head + Day Montage',
    duration: '25 sec',
    concept: 'Skeptic-to-believer arc. Creator doubts all "long-lasting" claims, deliberately tests Voice of the Soul through gym/meetings/sleep — genuinely shocked it survives. 30-year Cambodian Oud is the credibility anchor. Dark, premium settings throughout.',
    costumes: [
      {item: 'Black fitted tee (gym scene)', link: 'https://pinterest.com/search/pins/?q=black+fitted+tee+men+gym'},
      {item: 'Dark blazer or formal shirt (meeting scene)', link: 'https://pinterest.com/search/pins/?q=dark+blazer+men+indian+premium'},
      {item: 'Premium athleisure (casual scenes)', link: 'https://pinterest.com/search/pins/?q=premium+athleisure+men+dark+tones'}
    ],
    props: ['Voice of the Soul 100ml bottle', 'Gym equipment / dark gym setting', 'Phone timer showing hours elapsed', 'Dark bedroom (morning-after scene)', 'Premium car or office interior (meeting scene)'],
    references: [
      {desc: 'Challenge / "I tested X for 48 hours" format — currently trending'},
      {desc: 'Day-in-my-life montage with dark/premium settings and time stamps'},
      {desc: 'Male creator testimonial in premium settings (ref from brief — villa/car)'}
    ],
    hook1: 'I tested this perfume for 48 hours. Here\'s what happened.',
    hook2: 'Every brand says long-lasting. So I actually tested it.',
    hook3: '30-year aged Cambodian Oud. I had to try it myself.',
    onScreenText: ['7 AM: Applied', '10 PM: Brother noticed', 'NEXT MORNING: Still there', '30-Year Cambodian Oud | Rs 5,890'],
    thumbnailFrame: 'Creator sniffing wrist in dark room, shocked expression, warm amber side-light. Text: "48 HOURS LATER..."',
    creatorNotes: 'MALE CREATOR. Voice of the Soul is a 100ml oil-based PERFUME (Rs 5,890). Hero ingredient: 30-year aged Cambodian Oud. Notes: Top — Raspberry, Golden Sun, Incense Agarwood. Heart — Geranium, Benzoin, Kashmiri Saffron. Base — Amber Hindi, Birch, Dhen al Oud. The "48 hour test" format is inherently engaging — skepticism creates tension. Dark premium settings: dark gym, dark car/office for meetings, dark bedroom for morning-after. The brother\'s Hindi reaction ("Bhai, kya lagaya hai?") is the emotional peak. Morning-after wrist sniff is the proof climax. Pacing: start deadpan/skeptical, build to genuine surprise. Premium masculine energy throughout.',
    voiceover: [
      {vo: '[ASMR] Voice of the Soul bottle. Cap open. Oil on wrist.', visual: 'Dark surface. Voice of the Soul 100ml bottle. Hands open cap (click). Oil drops on wrist. Warm amber light. ASMR audio. Text: "7:00 AM — TEST BEGINS"', ref: '[Style: ASMR product open, dark premium, test setup]'},
      {vo: 'I tested this perfume for 48 hours. Here\'s what happened.', visual: 'Medium shot: creator in dark room, direct to camera. Skeptical expression. Single warm light. Holding bottle.', ref: '[Style: dark talking head, challenge video hook]'},
      {vo: 'Oil-based, alcohol-free. Made with 30-year aged Cambodian Oud.', visual: 'Close-up of oil texture. "30-YEAR CAMBODIAN OUD" text overlay. Premium feel.', ref: '[Style: ingredient hero shot, dark premium]'},
      {vo: 'Gym. Meetings. Evening errands. By 10 PM — "Bhai, kya lagaya hai? It\'s still so strong."', visual: 'Quick dark montage: gym (dark gym), car/office (formal), evening. Brother scene: genuine reaction. Text: "10 PM"', ref: '[Style: day montage, dark settings, candid brother reaction]'},
      {vo: '[beat] Next morning. [sniffs wrist] Still. There.', visual: 'Dark bedroom, morning light creeping in. Creator wakes up, sniffs wrist. Shocked expression. Text: "NEXT MORNING"', ref: '[Style: morning proof moment, dramatic reveal]'},
      {vo: 'Rs 5,890. 100ml. Outperforms sprays three times the price. Link in bio.', visual: 'Product hero: Voice of the Soul bottle, dark surface, warm spotlight. Price overlay. CTA.', ref: '[Style: dark product CTA, premium minimal]'}
    ],
    fullScript: '[ASMR OPEN: Dark surface. Voice of the Soul bottle. Cap click. Oil on wrist. Text: "7 AM — TEST BEGINS"]\n\nI tested this perfume for 48 hours. Here\'s what happened.\n\nOil-based, alcohol-free. Made with 30-year aged Cambodian Oud. I was skeptical — every brand says "long-lasting."\n\nGym. Meetings. Evening errands. By 10 PM, my brother goes "Bhai, kya lagaya hai? It\'s still so strong."\n\n[beat] Next morning. [sniffs wrist] Still. There.\n\nThat\'s not marketing. Rs 5,890 for 100ml — outperforms sprays three times the price.\n\nOudh Arabia. Link in bio.',
    v1: 'HOOK: "This attar? I doubted it."\nThis attar? I doubted it. Okay, so I\'ve seen Oudh Arabia around, and you know, everyone talks about these \'12-hour\' attars.\n\n[V1 errors: Called it "attar" — it\'s a 100ml oil-based perfume. Said "12-hour" — actual is 48 hours.]'
  }
];

// ─── Main ───────────────────────────────────────────────────
async function main() {
  await authenticate();

  console.log('\n=== UPDATING 6 OUDH ARABIA PRODUCTION BRIEFS ===');
  console.log('Format: Full styled Production Brief (headings, table colors, all sections)\n');

  for (const s of scripts) {
    try {
      await updateDoc(s);
    } catch (e) {
      console.error(`  ${s.name} ERROR: ${e.message}`);
    }
  }

  console.log('\n=== ALL DONE ===');
}

main().catch(console.error);
