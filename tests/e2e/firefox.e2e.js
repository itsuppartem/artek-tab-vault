#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const ARTIFACTS = path.join(ROOT, 'web-ext-artifacts');

function log(msg) { process.stdout.write(msg + '\n'); }
function fail(msg) { process.stderr.write(msg + '\n'); process.exit(1); }
function hasCmd(cmd) {
  return spawnSync('sh', ['-c', 'command -v ' + cmd], { encoding: 'utf8' }).status === 0;
}

async function main() {
  const inCi = process.env.CI === 'true';
  if (!hasCmd('firefox') && !process.env.FIREFOX_BIN) {
    if (inCi) fail('Firefox is required in CI.');
    log('SKIP live Firefox e2e: firefox not on PATH.');
    return;
  }
  if (!hasCmd('geckodriver') && !process.env.GECKODRIVER_PATH) {
    if (inCi) fail('geckodriver is required in CI.');
    log('SKIP live Firefox e2e: geckodriver not on PATH.');
    return;
  }

  execSync('npx web-ext build --source-dir=. --overwrite-dest', { cwd: ROOT, stdio: 'inherit' });
  const zips = fs.readdirSync(ARTIFACTS).filter((f) => f.endsWith('.zip'));
  if (!zips.length) fail('web-ext build produced no zip');
  const zipPath = path.join(ARTIFACTS, zips[0]);

  const { Builder, By, until } = require('selenium-webdriver');
  const firefox = require('selenium-webdriver/firefox');
  const options = new firefox.Options();
  options.addArguments('-headless');
  options.setPreference('xpinstall.signatures.required', false);
  options.setPreference('extensions.autoDisableScopes', 0);
  if (process.env.FIREFOX_BIN) options.setBinary(process.env.FIREFOX_BIN);

  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
  try {
    const addonId = await driver.installAddon(zipPath, true);
    if (!addonId || String(addonId).indexOf('artek-tab-vault') === -1) {
      fail('Unexpected addon id: ' + addonId);
    }
    log('Installed ' + addonId);
    await driver.get('https://example.com');
    await driver.wait(until.elementLocated(By.css('body')), 10000);
    const title = await driver.getTitle();
    if (!/example/i.test(title)) fail('Unexpected title: ' + title);
    log('Live Firefox e2e passed.');
  } finally {
    await driver.quit();
  }
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
