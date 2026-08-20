'use strict';

const fs = require('fs');
const path = require('path');
const {
  rejectBadWorkflowShape,
  assertCiHasFirefoxJob,
  assertReleaseWorkflow,
  e2eMatchedByJest,
} = require('./helpers/workflow-contracts');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('workflow contracts', () => {
  test('package.json exposes scripts.test:firefox', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['test:firefox']).toBe('node tests/e2e/firefox.e2e.js');
  });

  test('CI workflow (.github/workflows/ci.yml) defines a firefox job', () => {
    const text = read('.github/workflows/ci.yml');
    expect(assertCiHasFirefoxJob(text)).toBe(true);
  });

  test('tests/e2e/firefox.e2e.js exists and is NOT matched by Jest testMatch', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/e2e/firefox.e2e.js'))).toBe(true);
    const pkg = JSON.parse(read('package.json'));
    expect(e2eMatchedByJest(pkg.jest.testMatch, 'tests/e2e/firefox.e2e.js')).toBe(false);
  });

  test('release workflow exists, triggers on v* tags, creates a GitHub release', () => {
    const rel = '.github/workflows/release.yml';
    expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    expect(assertReleaseWorkflow(read(rel))).toBe(true);
  });

  test('CONTRIBUTING states: develop is daily work; main is released product only; issues first; tests and docs in the same PR; firefox job is a canary not the merge gate; close issues only after reading CI logs', () => {
    const body = read('CONTRIBUTING.md');
    expect(body).toMatch(/develop is daily work/i);
    expect(body).toMatch(/main is released product only/i);
    expect(body).toMatch(/issues first/i);
    expect(body).toMatch(/tests and docs in the same PR/i);
    expect(body).toMatch(/firefox job is a canary not the merge gate/i);
    expect(body).toMatch(/close issues only after reading CI logs/i);
  });

  test('discard-all-except-current default shortcut is not Ctrl+Shift+D (#37)', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const suggested = manifest.commands['discard-all-except-current'].suggested_key.default;
    expect(suggested).not.toBe('Ctrl+Shift+D');
    expect(suggested).toBe('Alt+Shift+D');
  });

  test('rejectBadWorkflowShape rejects a workflow missing a firefox job or using pull_request_target', () => {
    expect(() => rejectBadWorkflowShape('name: CI\njobs:\n  test:\n    runs-on: ubuntu-latest\n')).toThrow(/firefox job/);
    expect(() => rejectBadWorkflowShape('on:\n  pull_request_target:\njobs:\n  test:\n\n  firefox:\n')).toThrow(/pull_request_target/);
    expect(() => rejectBadWorkflowShape('')).toThrow(/non-empty/);
  });
});
