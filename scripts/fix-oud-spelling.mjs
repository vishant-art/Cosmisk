#!/usr/bin/env node
/**
 * Fix "Oudh Arabia" → "Oud Arabia" spelling across all 6 Google Docs.
 * Uses Google Docs API replaceAllText — surgical, doesn't touch other content.
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

async function authenticate() {
  if (existsSync(TOKEN_FILE)) {
    const cached = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    if (cached.refresh_token) {
      console.log('Found cached token, refreshing...');
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: cached.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const data = await res.json();
      if (data.access_token) {
        ACCESS_TOKEN = data.access_token;
        console.log('Token refreshed');
        return;
      }
    }
  }

  // Need new auth
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline&prompt=consent`;

  console.log('Opening browser for Google auth...');
  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const c = url.searchParams.get('code');
      if (c) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Authorized! Close this tab.</h2><script>window.close()</script>');
        server.close();
        resolve(c);
      }
    });
    server.listen(3456, () => {
      import('child_process').then(({ exec }) => exec(`open "${authUrl}"`));
    });
    setTimeout(() => { server.close(); reject(new Error('Auth timeout')); }, 60000);
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
  if (tokenData.error) throw new Error(`Token error: ${tokenData.error_description}`);
  ACCESS_TOKEN = tokenData.access_token;
  writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  console.log('Authenticated');
}

async function fixSpelling(docId, name) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          replaceAllText: {
            containsText: { text: 'Oudh Arabia', matchCase: false },
            replaceText: 'Oud Arabia'
          }
        },
        {
          replaceAllText: {
            containsText: { text: 'OUDH ARABIA', matchCase: true },
            replaceText: 'OUD ARABIA'
          }
        }
      ]
    })
  });
  const data = await res.json();
  if (data.error) {
    console.log(`  ${name}: ERROR — ${data.error.message}`);
    return;
  }
  const replaced = data.replies?.reduce((sum, r) => sum + (r.replaceAllText?.occurrencesChanged || 0), 0) || 0;
  console.log(`  ${name}: ${replaced} replacements`);
}

const DOCS = [
  { id: '12QE1dRxIuja47zKVgMhHC0bxeC30ztyGk5koAfvKtdM', name: 'C1 — Dagger Attar (Longevity)' },
  { id: '17EB11DvKGMUY7yaVEOrdkvyFChA_clvK8dZHir5dU1E', name: 'C2 — Dagger Attar (ASMR)' },
  { id: '1Fi3OJZ1QUJ6b9LGE4v-P2GQ-dbMqXW4cu-r3Ds8nkRk', name: 'C3 — Dakhoon (Discovery)' },
  { id: '1qk2EN0O2hGfgsojh5XjpWMC65_Q_XXuls_9baPvDRO0', name: 'C4 — Dakhoon (Upgrade)' },
  { id: '1msUH7QbK4kRu49NwUq0JoZquOBFtZqZXeAZZqUQM8NQ', name: 'C5 — Jannat E Zuhur' },
  { id: '1YalRtQ1kcoPHiFW-TznsQCD01fcMgSaPYmRNgz0-Tw8', name: 'C6 — Voice of the Soul' },
];

async function main() {
  await authenticate();
  console.log('\n=== FIXING SPELLING: "Oudh Arabia" → "Oud Arabia" ===\n');
  for (const doc of DOCS) {
    await fixSpelling(doc.id, doc.name);
  }
  console.log('\n=== DONE ===');
}

main().catch(console.error);
