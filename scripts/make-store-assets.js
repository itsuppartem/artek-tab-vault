#!/usr/bin/env node
'use strict';

/*
 * Regenerates everything the AMO product page needs from the actual UI:
 *   - icons/icon-{48,96,128}.png rasterized from icons/icon.svg
 *   - store-assets/screenshots/*.png of the real popup and options pages
 *
 * Rendering goes through headless Firefox (the same engine users will see it
 * in), driven over a throwaway profile so it doesn't collide with the browser
 * the developer already has open. The extension pages are copied to a temp dir
 * and patched there with scripts/screenshot-mock.js plus a zoom stylesheet -
 * the repo copies are never modified.
 *
 * Snap-packaged Firefox can reach neither /tmp nor dot-directories inside
 * $HOME, so the scratch workspace has to be a plainly named folder in $HOME.
 *
 * Usage: npm run screenshots
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..');
const WORK = path.join(os.homedir(), 'artek-tab-vault-store-assets');
const PROFILE = path.join(WORK, 'profile');
const EXT = path.join(WORK, 'ext');
const SHOTS_OUT = path.join(REPO, 'store-assets', 'screenshots');

// Firefox renders at 1x, so zoom the pages instead to get store-sized images.
const ZOOM = 2.5;
const ZOOM_STYLE = `<style id="shot-zoom">html { zoom: ${ZOOM}; }</style>\n</head>`;

const SCREENSHOTS = [
  { out: '01-popup.png', page: 'popup/popup.html', width: 340, height: 880 },
  { out: '02-guardian-settings.png', page: 'options/options-guardian.html', width: 600, height: 680 },
  { out: '03-backup-retention.png', page: 'options/options-backup.html', width: 600, height: 980 },
];

function run(args) {
  execFileSync('firefox', args, {
    stdio: 'ignore',
    env: { ...process.env, TMPDIR: WORK },
    timeout: 120000,
  });
}

function renderPng(url, outFile, cssWidth, cssHeight) {
  // A freshly created profile sometimes swallows the first screenshot while
  // Firefox is still initializing it, so give each render a couple of tries.
  for (let attempt = 1; attempt <= 3; attempt++) {
    run([
      '--headless',
      '--new-instance',
      '--profile', PROFILE,
      '--window-size', `${cssWidth},${cssHeight}`,
      '--screenshot', outFile,
      url,
    ]);
    if (fs.existsSync(outFile)) return;
  }
  throw new Error(`Firefox produced no screenshot for ${url}`);
}

function prepareWorkspace() {
  fs.rmSync(EXT, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.mkdirSync(SHOTS_OUT, { recursive: true });
  fs.cpSync(REPO, EXT, {
    recursive: true,
    filter: (src) => !/(node_modules|\.git|store-assets|web-ext-artifacts)(\/|$)/.test(src),
  });
}

function patchPage(relPath, extraCss = '') {
  const file = path.join(EXT, relPath);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(
    '<script src="../core.js"></script>',
    '<script src="../scripts/screenshot-mock.js"></script>\n  <script src="../core.js"></script>'
  );
  html = html.replace('</head>', ZOOM_STYLE + (extraCss ? `\n<style>${extraCss}</style>` : ''));
  return html;
}

function buildPages() {
  fs.writeFileSync(path.join(EXT, 'popup/popup.html'), patchPage('popup/popup.html'));

  // The options page is one long column; split it into two focused shots so
  // each one stays readable in AMO's screenshot carousel.
  fs.writeFileSync(
    path.join(EXT, 'options/options-guardian.html'),
    patchPage('options/options.html', '.card:nth-of-type(n+2) { display: none; }')
  );
  fs.writeFileSync(
    path.join(EXT, 'options/options-backup.html'),
    patchPage('options/options.html', '.card:nth-of-type(1) { display: none; }')
  );
}

function buildIcons() {
  const svg = fs.readFileSync(path.join(REPO, 'icons/icon.svg'), 'utf8');
  const wrapper = path.join(WORK, 'icon-wrap.html');
  fs.writeFileSync(
    wrapper,
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
      html, body { margin: 0; padding: 0; background: transparent; }
      svg { display: block; width: 100vw; height: 100vh; }
    </style></head><body>${svg}</body></html>`
  );

  for (const size of [48, 96, 128]) {
    const out = path.join(REPO, 'icons', `icon-${size}.png`);
    fs.rmSync(out, { force: true });
    renderPng(`file://${wrapper}`, out, size, size);
    console.log(`icons/icon-${size}.png`);
  }
}

function buildScreenshots() {
  for (const shot of SCREENSHOTS) {
    const out = path.join(SHOTS_OUT, shot.out);
    fs.rmSync(out, { force: true });
    renderPng(
      `file://${path.join(EXT, shot.page)}`,
      out,
      Math.round(shot.width * ZOOM),
      Math.round(shot.height * ZOOM)
    );
    console.log(`store-assets/screenshots/${shot.out}`);
  }
}

prepareWorkspace();
buildPages();
buildIcons();
buildScreenshots();
console.log('\nDone. Upload the screenshots via Developer Hub → Edit Product Page → Images.');
