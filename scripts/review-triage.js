#!/usr/bin/env node
'use strict';

/*
 * Helper for the review-triage skill. Talks to the AMO Ratings API
 * (https://addons.mozilla.org/api/v5/ratings/). No dependencies beyond
 * Node's built-ins (fetch + crypto are both global since Node 18+).
 *
 * Commands:
 *   node scripts/review-triage.js list
 *   node scripts/review-triage.js reply <ratingId> <reply text>
 *   node scripts/review-triage.js mark-handled <ratingId> [note]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ADDON_GUID = 'artek-tab-vault@artek.local';
const API_BASE = 'https://addons.mozilla.org/api/v5';
const STATE_PATH = path.join(__dirname, '..', 'reviews-state.json');
const USER_AGENT = 'artek-tab-vault-review-triage/1.0';

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { handled: {} };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeJwt(apiKey, apiSecret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: apiKey, jti: crypto.randomUUID(), iat: now, exp: now + 60 };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(unsigned)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${unsigned}.${signature}`;
}

async function listRatings() {
  const state = loadState();
  const url = `${API_BASE}/ratings/rating/?addon=${encodeURIComponent(ADDON_GUID)}&filter=without_empty_body`;
  const headers = { 'User-Agent': USER_AGENT };

  // Auth is required while the add-on isn't public yet (awaiting review /
  // unlisted); harmless to include once it's public too.
  const apiKey = process.env.WEB_EXT_API_KEY;
  const apiSecret = process.env.WEB_EXT_API_SECRET;
  if (apiKey && apiSecret) {
    headers.Authorization = `JWT ${makeJwt(apiKey, apiSecret)}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error(
        `AMO API error 401: ${body}\nHint: this usually means the add-on has no approved public version yet (status "nominated"/awaiting review). Ratings become fetchable once AMO approves the first listed version.`
      );
    }
    throw new Error(`AMO API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const unresolved = (data.results || []).filter((r) => !state.handled[r.id]);
  console.log(JSON.stringify({ total: data.count ?? 0, unresolved }, null, 2));
}

function requireCreds() {
  const apiKey = process.env.WEB_EXT_API_KEY;
  const apiSecret = process.env.WEB_EXT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error(
      'WEB_EXT_API_KEY / WEB_EXT_API_SECRET env vars are required (source ~/.config/web-ext-keys/artek-tab-vault-amo.env)'
    );
  }
  return { apiKey, apiSecret };
}

async function replyToRating(id, body) {
  if (!id || !body) throw new Error('Usage: reply <ratingId> <text>');
  const { apiKey, apiSecret } = requireCreds();
  const token = makeJwt(apiKey, apiSecret);

  const res = await fetch(`${API_BASE}/ratings/rating/${id}/reply/`, {
    method: 'POST',
    headers: {
      Authorization: `JWT ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`AMO API error ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const state = loadState();
  state.handled[id] = { repliedAt: new Date().toISOString(), body };
  saveState(state);

  console.log(JSON.stringify(data, null, 2));
}

function markHandled(id, note) {
  if (!id) throw new Error('Usage: mark-handled <ratingId> [note]');
  const state = loadState();
  state.handled[id] = { skippedAt: new Date().toISOString(), note: note || 'marked handled without a reply' };
  saveState(state);
  console.log(`Marked rating ${id} as handled.`);
}

const [, , cmd, ...args] = process.argv;

(async () => {
  try {
    if (cmd === 'list') {
      await listRatings();
    } else if (cmd === 'reply') {
      const [id, ...bodyParts] = args;
      await replyToRating(id, bodyParts.join(' '));
    } else if (cmd === 'mark-handled') {
      const [id, ...noteParts] = args;
      markHandled(id, noteParts.join(' '));
    } else {
      console.error('Usage: review-triage.js <list | reply <id> <text> | mark-handled <id> [note]>');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
})();
