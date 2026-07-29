#!/usr/bin/env node
'use strict';

/*
 * Regenerates AMO store assets from the REAL extension UI (not AI mockups):
 *   - icons/icon-*.png from icons/icon.svg
 *   - store-assets/screenshots/*.png + listing/screenshot-*.png
 *
 * Pages are copied to a throwaway workspace, patched with screenshot-mock.js
 * (fake browser.* + realistic session data + inlined ru locale), then opened
 * in headless Chromium via puppeteer-core. We wait until the popup has filled
 * real numbers before taking the PNG — so AMO shots match the live UI.
 *
 * Usage: npm run screenshots
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const REPO = path.join(__dirname, '..');
const WORK = path.join(os.homedir(), 'artek-tab-vault-store-assets');
const EXT = path.join(WORK, 'ext');
const SHOTS_OUT = path.join(REPO, 'store-assets', 'screenshots');
const LISTING_OUT = path.join(REPO, 'listing');

const ZOOM = 2.5;
const ZOOM_STYLE = `<style id="shot-zoom">html { zoom: ${ZOOM}; }</style>\n</head>`;

const SCREENSHOTS = [
  {
    out: '01-popup.png',
    listing: 'screenshot-01-popup.png',
    page: 'popup/popup.html',
    width: 360,
    height: 920,
    waitFor: '#totalTabs',
    waitTextNot: '-',
  },
  {
    out: '02-guardian-settings.png',
    listing: 'screenshot-02-options.png',
    page: 'options/options-guardian.html',
    width: 620,
    height: 760,
    waitFor: '#idleMinutes',
    waitValue: true,
  },
  {
    out: '03-backup-retention.png',
    listing: 'screenshot-03-backup.png',
    page: 'options/options-backup.html',
    width: 620,
    height: 1040,
    waitFor: '#storageUsage',
    waitTextNot: '-',
  },
];

function chromiumBin() {
  const candidates = [
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const which = execFileSync('bash', ['-lc', 'command -v chromium || command -v google-chrome'], {
      encoding: 'utf8',
    }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch {
    /* fall through */
  }
  throw new Error('Need chromium/chrome for screenshots');
}

function prepareWorkspace() {
  fs.rmSync(EXT, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(SHOTS_OUT, { recursive: true });
  fs.mkdirSync(LISTING_OUT, { recursive: true });
  fs.cpSync(REPO, EXT, {
    recursive: true,
    filter: (src) => !/(node_modules|\.git|store-assets|web-ext-artifacts|listing)(\/|$)/.test(src),
  });

  const messages = JSON.parse(fs.readFileSync(path.join(REPO, '_locales/ru/messages.json'), 'utf8'));
  const flat = {};
  for (const [k, v] of Object.entries(messages)) flat[k] = v.message;
  fs.writeFileSync(
    path.join(EXT, 'scripts/screenshot-i18n.js'),
    `globalThis.__TV_I18N__ = ${JSON.stringify(flat)};\n`
  );
}

function patchPage(relPath, extraCss = '') {
  const file = path.join(EXT, relPath);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(
    '<script src="../core.js"></script>',
    '<script src="../scripts/screenshot-i18n.js"></script>\n  <script src="../scripts/screenshot-mock.js"></script>\n  <script src="../core.js"></script>'
  );
  html = html.replace(
    '</head>',
    ZOOM_STYLE +
      (extraCss ? `\n<style>${extraCss}</style>` : '') +
      `\n<style>html,body{overflow:hidden !important;}</style>\n</head>`
  );
  return html;
}

function buildPages() {
  fs.writeFileSync(path.join(EXT, 'popup/popup.html'), patchPage('popup/popup.html'));
  fs.writeFileSync(
    path.join(EXT, 'options/options-guardian.html'),
    patchPage('options/options.html', '.card:nth-of-type(n+2),.actions{display:none !important;} body{background:#16171a;}')
  );
  fs.writeFileSync(
    path.join(EXT, 'options/options-backup.html'),
    patchPage('options/options.html', '.card:nth-of-type(1){display:none !important;} body{background:#16171a;}')
  );
}

async function withBrowser(fn) {
  const executablePath = chromiumBin();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function buildIcons(browser) {
  const svg = fs.readFileSync(path.join(REPO, 'icons/icon.svg'), 'utf8');
  const wrapper = path.join(WORK, 'icon-wrap.html');
  fs.writeFileSync(
    wrapper,
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
      html, body { margin: 0; padding: 0; background: transparent; }
      svg { display: block; width: 100vw; height: 100vh; }
    </style></head><body>${svg}</body></html>`
  );

  for (const size of [32, 48, 64, 96, 128]) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.goto(`file://${wrapper}`, { waitUntil: 'load' });
    const out = path.join(REPO, 'icons', `icon-${size}.png`);
    await page.screenshot({ path: out, omitBackground: true });
    await page.close();
    console.log(`icons/icon-${size}.png`);
  }
  for (const size of [32, 64, 128]) {
    fs.copyFileSync(path.join(REPO, 'icons', `icon-${size}.png`), path.join(LISTING_OUT, `amo-icon-${size}.png`));
  }
}

async function buildScreenshots(browser) {
  fs.rmSync(path.join(LISTING_OUT, 'screenshot-03-crash-prompt.png'), { force: true });

  for (const shot of SCREENSHOTS) {
    const page = await browser.newPage();
    const w = Math.round(shot.width * ZOOM);
    const h = Math.round(shot.height * ZOOM);
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const url = `file://${path.join(EXT, shot.page)}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    if (shot.waitFor) {
      await page.waitForFunction(
        (sel, notText, wantValue) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          if (wantValue) return Boolean(el.value);
          return el.textContent && el.textContent.trim() !== notText;
        },
        { timeout: 15000 },
        shot.waitFor,
        shot.waitTextNot || '-',
        Boolean(shot.waitValue)
      );
    }

    // Let fonts/layout settle.
    await new Promise((r) => setTimeout(r, 200));

    const out = path.join(SHOTS_OUT, shot.out);
    await page.screenshot({ path: out, type: 'png' });
    await page.close();
    fs.copyFileSync(out, path.join(LISTING_OUT, shot.listing));
    console.log(`store-assets/screenshots/${shot.out} → listing/${shot.listing}`);
  }
}

(async () => {
  prepareWorkspace();
  buildPages();
  await withBrowser(async (browser) => {
    await buildIcons(browser);
    await buildScreenshots(browser);
  });
  console.log('\nDone. Real UI screenshots via Chromium + puppeteer-core.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
