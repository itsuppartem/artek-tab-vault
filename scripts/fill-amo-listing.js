#!/usr/bin/env node
'use strict';

/*
 * Push listing metadata + icon + screenshots to AMO via API v5.
 * Reads copy from LISTING.md / listing/AMO-FILL.md assets.
 *
 *   source ~/.config/web-ext-keys/artek-tab-vault-amo.env
 *   node scripts/fill-amo-listing.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ADDON_GUID = 'artek-tab-vault@artek.local';
const API_BASE = 'https://addons.mozilla.org/api/v5';
const USER_AGENT = 'artek-tab-vault-listing-fill/1.0';
const ROOT = path.join(__dirname, '..');
const LISTING_DIR = path.join(ROOT, 'listing');

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
  const payload = { iss: apiKey, jti: crypto.randomUUID(), iat: now, exp: now + 300 };
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

function extractFencedBlock(md, heading) {
  const idx = md.indexOf(heading);
  if (idx < 0) throw new Error(`Missing heading: ${heading}`);
  const after = md.slice(idx + heading.length);
  const m = after.match(/```\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`Missing fenced block after ${heading}`);
  return m[1].trim();
}

function authHeaders(extra = {}) {
  const apiKey = process.env.WEB_EXT_API_KEY;
  const apiSecret = process.env.WEB_EXT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('WEB_EXT_API_KEY / WEB_EXT_API_SECRET missing in env');
  }
  return {
    Authorization: `JWT ${makeJwt(apiKey, apiSecret)}`,
    'User-Agent': USER_AGENT,
    ...extra,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(method, urlPath, { json, formData } = {}, attempt = 1) {
  const url = `${API_BASE}${urlPath}`;
  const headers = authHeaders();
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (formData) {
    body = formData;
  }
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 429 && attempt <= 8) {
    const parsed = Number(String(data?.detail || '').match(/(\d+)\s*seconds?/i)?.[1]);
    // AMO sometimes returns huge "available in N seconds" values; cap so we
    // don't sleep for an hour on a transient preview-upload throttle.
    const waitSec = Math.min(Math.max(parsed || 60, 15), 90);
    console.log(`  throttled (${data?.detail}), waiting ${waitSec}s (attempt ${attempt})…`);
    await sleep((waitSec + 2) * 1000);
    return api(method, urlPath, { json, formData }, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function addonPath(suffix = '') {
  return `/addons/addon/${encodeURIComponent(ADDON_GUID)}${suffix}`;
}

async function patchMetadata(descriptionEn, descriptionRu, developerComments) {
  const homepage = 'https://github.com/itsuppartem/artek-tab-vault';
  const payload = {
    description: {
      'en-US': descriptionEn,
      'ru': descriptionRu,
    },
    homepage: {
      'en-US': homepage,
      'ru': homepage,
    },
    support_url: {
      'en-US': `${homepage}/issues`,
      'ru': `${homepage}/issues`,
    },
    developer_comments: {
      'en-US': developerComments,
    },
    // Only tags that exist on AMO's fixed list (GET /api/v5/addons/tags/).
    tags: ['privacy', 'security'],
    default_locale: 'en-US',
    is_experimental: false,
    requires_payment: false,
  };
  console.log('PATCH metadata…');
  const data = await api('PATCH', addonPath('/'), { json: payload });
  console.log('  description locales:', Object.keys(data.description || {}));
  console.log('  homepage:', data.homepage);
  console.log('  support_url:', data.support_url);
  console.log('  tags:', data.tags);
  console.log('  developer_comments set:', Boolean(data.developer_comments));
  return data;
}

async function uploadIcon() {
  const iconPath = path.join(LISTING_DIR, 'amo-icon-128.png');
  const buf = fs.readFileSync(iconPath);
  const form = new FormData();
  form.append('icon', new Blob([buf], { type: 'image/png' }), 'amo-icon-128.png');
  console.log('PATCH icon…');
  const data = await api('PATCH', addonPath('/'), { formData: form });
  console.log('  icons:', data.icons);
  return data;
}

async function clearExistingPreviews() {
  const current = await api('GET', addonPath('/'));
  const previews = current.previews || [];
  for (const p of previews) {
    console.log(`DELETE preview ${p.id}…`);
    await api('DELETE', addonPath(`/previews/${p.id}/`));
  }
}

async function uploadPreviews() {
  const shots = [
    {
      file: 'screenshot-01-popup.png',
      caption: {
        'en-US': 'Popup: session snapshots, discard controls, and per-tab active/loaded/discarded state.',
        'ru': 'Попап: снимки сессии, выгрузка вкладок и статус каждой вкладки.',
      },
    },
    {
      file: 'screenshot-02-options.png',
      caption: {
        'en-US': 'Settings: Guardian options, retention presets, whitelist, export/import.',
        'ru': 'Настройки: Guardian, профили хранения, белый список, экспорт/импорт.',
      },
    },
    {
      file: 'screenshot-03-crash-prompt.png',
      caption: {
        'en-US': 'After an unclean shutdown, a notification offers to restore the last backup.',
        'ru': 'После «грязного» завершения Firefox предлагает восстановить последний бэкап.',
      },
    },
  ];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const buf = fs.readFileSync(path.join(LISTING_DIR, shot.file));
    const form = new FormData();
    form.append('image', new Blob([buf], { type: 'image/png' }), shot.file);
    form.append('position', String(i));
    console.log(`POST preview ${shot.file} (position ${i})…`);
    const created = await api('POST', addonPath('/previews/'), { formData: form });
    console.log(`  id=${created.id}`);
    await sleep(1500);
    console.log(`PATCH caption for preview ${created.id}…`);
    await api('PATCH', addonPath(`/previews/${created.id}/`), {
      json: { caption: shot.caption, position: i },
    });
    await sleep(1500);
  }
}

async function captionExistingPreviews() {
  const shots = [
    {
      caption: {
        'en-US': 'Popup: session snapshots, discard controls, and per-tab active/loaded/discarded state.',
        'ru': 'Попап: снимки сессии, выгрузка вкладок и статус каждой вкладки.',
      },
    },
    {
      caption: {
        'en-US': 'Settings: Guardian options, retention presets, whitelist, export/import.',
        'ru': 'Настройки: Guardian, профили хранения, белый список, экспорт/импорт.',
      },
    },
    {
      caption: {
        'en-US': 'After an unclean shutdown, a notification offers to restore the last backup.',
        'ru': 'После «грязного» завершения Firefox предлагает восстановить последний бэкап.',
      },
    },
  ];
  const current = await api('GET', addonPath('/'));
  const previews = [...(current.previews || [])].sort((a, b) => a.position - b.position);
  for (let i = 0; i < previews.length; i++) {
    const p = previews[i];
    const shot = shots[i];
    if (!shot) continue;
    if (p.caption && (p.caption['en-US'] || p.caption.en_US)) {
      console.log(`preview ${p.id} already has caption, skip`);
      continue;
    }
    console.log(`PATCH caption for existing preview ${p.id}…`);
    await api('PATCH', addonPath(`/previews/${p.id}/`), {
      json: { caption: shot.caption, position: i },
    });
    await sleep(2000);
  }
}

async function main() {
  const mode = process.argv[2] || 'all';
  const listingMd = fs.readFileSync(path.join(ROOT, 'LISTING.md'), 'utf8');
  const descriptionEn = extractFencedBlock(listingMd, '## Description (full, en-US)');
  const descriptionRu = extractFencedBlock(listingMd, '## Description (ru-RU)');

  const developerComments = [
    'Artek Tab Vault combines two local-only features: rolling session snapshots',
    'and idle-tab discarding via the native tabs.discard API.',
    '',
    'Permissions notes for reviewers:',
    '- <all_urls> is used only on-device: (1) a content script that reports a',
    '  boolean "has unsaved form" flag so the guardian can skip that tab —',
    '  form contents are never read, stored, or transmitted; (2) a one-shot',
    '  content script that prefixes document.title (e.g. "💤 ") immediately',
    '  before tabs.discard(), because Firefox has no API to set a tab title.',
    '- unlimitedStorage is for the local snapshot history when the user raises',
    '  the size cap; nothing is uploaded.',
    '- tabGroups is used to capture/restore native Firefox tab group name/color.',
    '- notifications is used for the optional crash-restore prompt after an',
    '  unclean shutdown.',
    '- No remote code, no analytics, no third-party servers. Data never leaves',
    "  the user's machine.",
    '',
    'Source and tests: the GitHub repository linked as Homepage. Jest unit tests',
    'cover pure logic in core.js; CI runs on every push.',
  ].join('\n');

  if (mode === 'all' || mode === 'meta') {
    await patchMetadata(descriptionEn, descriptionRu, developerComments);
    await uploadIcon();
  }

  if (mode === 'all' || mode === 'previews') {
    // Don't wipe existing previews in resume mode — only add missing ones.
    const current = await api('GET', addonPath('/'));
    const have = (current.previews || []).length;
    if (mode === 'all' && have > 0 && process.argv.includes('--replace-previews')) {
      await clearExistingPreviews();
      await uploadPreviews();
    } else if (have === 0) {
      await uploadPreviews();
    } else if (have < 3) {
      console.log(`Have ${have} preview(s); uploading remaining…`);
      // Upload only missing trailing shots without deleting the first.
      const shots = [
        'screenshot-01-popup.png',
        'screenshot-02-options.png',
        'screenshot-03-crash-prompt.png',
      ];
      const captions = [
        {
          'en-US': 'Popup: session snapshots, discard controls, and per-tab active/loaded/discarded state.',
          'ru': 'Попап: снимки сессии, выгрузка вкладок и статус каждой вкладки.',
        },
        {
          'en-US': 'Settings: Guardian options, retention presets, whitelist, export/import.',
          'ru': 'Настройки: Guardian, профили хранения, белый список, экспорт/импорт.',
        },
        {
          'en-US': 'After an unclean shutdown, a notification offers to restore the last backup.',
          'ru': 'После «грязного» завершения Firefox предлагает восстановить последний бэкап.',
        },
      ];
      await captionExistingPreviews();
      for (let i = have; i < shots.length; i++) {
        const buf = fs.readFileSync(path.join(LISTING_DIR, shots[i]));
        const form = new FormData();
        form.append('image', new Blob([buf], { type: 'image/png' }), shots[i]);
        form.append('position', String(i));
        console.log(`POST preview ${shots[i]} (position ${i})…`);
        const created = await api('POST', addonPath('/previews/'), { formData: form });
        console.log(`  id=${created.id}`);
        await sleep(3000);
        await api('PATCH', addonPath(`/previews/${created.id}/`), {
          json: { caption: captions[i], position: i },
        });
        await sleep(5000);
      }
    } else {
      await captionExistingPreviews();
    }
  }

  const final = await api('GET', addonPath('/'));
  console.log('\nDone.');
  console.log('slug:', final.slug);
  console.log('description?', Boolean(final.description));
  console.log('homepage:', final.homepage?.url || final.homepage);
  console.log('support_url:', final.support_url?.url || final.support_url);
  console.log('tags:', final.tags);
  console.log('previews:', (final.previews || []).length);
  console.log(
    'preview captions:',
    (final.previews || []).map((p) => p.caption && (p.caption['en-US'] || p.caption.ru))
  );
  console.log('icons:', final.icons);
  console.log('edit:', `https://addons.mozilla.org/en-US/developers/addon/${final.slug}/edit`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
