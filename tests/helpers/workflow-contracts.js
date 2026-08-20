'use strict';

function rejectBadWorkflowShape(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('workflow text must be a non-empty string');
  }
  if (/pull_request_target/.test(text)) {
    throw new Error('CI must use pull_request, not pull_request_target');
  }
  if (!/^\s+test:\s*$/m.test(text)) {
    throw new Error('workflow is missing a test job');
  }
  if (!/^\s+firefox:\s*$/m.test(text)) {
    throw new Error('workflow is missing a firefox job');
  }
  return true;
}

function assertCiHasFirefoxJob(text) {
  rejectBadWorkflowShape(text);
  if (!/setup-firefox/.test(text)) {
    throw new Error('firefox job must use setup-firefox');
  }
  if (!/setup-geckodriver/.test(text)) {
    throw new Error('firefox job must use setup-geckodriver');
  }
  if (!/test:firefox/.test(text)) {
    throw new Error('firefox job must run test:firefox');
  }
  return true;
}

function assertReleaseWorkflow(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('release workflow text must be a non-empty string');
  }
  if (!/tags:/.test(text) || !/v\*/.test(text)) {
    throw new Error('release workflow must trigger on v* tags');
  }
  if (!/gh release create/.test(text)) {
    throw new Error('release workflow must create a GitHub release');
  }
  if (!/\.zip/.test(text) && !/web-ext-artifacts/.test(text)) {
    throw new Error('release workflow must attach a zip');
  }
  return true;
}

function e2eMatchedByJest(testMatch, e2eRelPath) {
  const patterns = Array.isArray(testMatch) ? testMatch : [testMatch];
  return patterns.some((pat) => {
    const rel = String(pat).replace('<rootDir>/', '');
    const re = new RegExp(
      '^' + rel.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
    );
    return re.test(e2eRelPath);
  });
}

const LISTING_SCREENSHOT_PATHS = [
  'listing/screenshot-01-popup.png',
  'listing/screenshot-02-options.png',
  'listing/screenshot-03-backup.png',
];

function rejectMissingListingScreenshots(readme) {
  if (typeof readme !== 'string' || !readme.trim()) {
    throw new Error('README must be a non-empty string');
  }
  for (const rel of LISTING_SCREENSHOT_PATHS) {
    if (!readme.includes(rel)) {
      throw new Error(`README must embed ${rel}`);
    }
  }
  return true;
}

module.exports = {
  rejectBadWorkflowShape,
  assertCiHasFirefoxJob,
  assertReleaseWorkflow,
  e2eMatchedByJest,
  rejectMissingListingScreenshots,
  LISTING_SCREENSHOT_PATHS,
};
