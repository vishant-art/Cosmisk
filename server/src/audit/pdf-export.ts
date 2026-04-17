/**
 * PDF Export - Converts audit markdown to PDF
 */

import puppeteer from 'puppeteer';
import { marked } from 'marked';

/**
 * Convert markdown to styled HTML
 */
function markdownToHtml(markdown: string, brandName: string): string {
  const htmlContent = marked(markdown);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${brandName} - Audit Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a2e;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      font-size: 14px;
    }
    h1 {
      color: #1a1a2e;
      border-bottom: 3px solid #6366f1;
      padding-bottom: 10px;
      font-size: 28px;
    }
    h2 {
      color: #1a1a2e;
      margin-top: 30px;
      font-size: 20px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
    }
    h3 {
      color: #374151;
      font-size: 16px;
      margin-top: 20px;
    }
    h4 {
      color: #4b5563;
      font-size: 14px;
    }
    blockquote {
      background: #f8fafc;
      border-left: 4px solid #6366f1;
      padding: 12px 20px;
      margin: 20px 0;
      font-size: 13px;
    }
    blockquote strong { color: #6366f1; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
      color: #374151;
    }
    tr:nth-child(even) { background: #fafafa; }
    code {
      background: #1a1a2e;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      display: block;
      margin: 15px 0;
      font-family: monospace;
      font-size: 13px;
      white-space: pre-wrap;
    }
    ul, ol {
      padding-left: 25px;
    }
    li {
      margin: 6px 0;
    }
    hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 30px 0;
    }
    .page-break { page-break-before: always; }
    @media print {
      body { padding: 20px; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
  `;
}

/**
 * Generate PDF from markdown
 */
export async function generatePDF(markdown: string, brandName: string): Promise<Buffer> {
  const html = markdownToHtml(markdown, brandName);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      printBackground: true,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
