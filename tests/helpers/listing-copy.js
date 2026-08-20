'use strict';

function extractFencedBlock(md, heading) {
  if (typeof md !== 'string' || !md.trim()) {
    throw new Error('listing markdown must be a non-empty string');
  }
  const idx = md.indexOf(heading);
  if (idx < 0) throw new Error(`Missing heading: ${heading}`);
  const after = md.slice(idx + heading.length);
  const m = after.match(/```\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`Missing fenced block after ${heading}`);
  return m[1].trim();
}

function rejectBadListingCopy(text, { locale = 'en' } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('listing copy must be a non-empty string');
  }
  const lower = text.toLowerCase();
  if (locale === 'ru') {
    if (!/медиа|видео/.test(lower)) {
      throw new Error('ru listing must mention media protection');
    }
    if (!/установк/.test(lower) || !/обновлен/.test(lower) || !/перезагруз/.test(lower)) {
      throw new Error('ru listing must mention crash-prompt skip on install/update/reload');
    }
  } else {
    if (!/media protection/.test(lower)) {
      throw new Error('en listing must mention media protection');
    }
    if (!/install/.test(lower) || !/update/.test(lower) || !/reload/.test(lower)) {
      throw new Error('listing must mention crash-prompt skip on install/update/reload');
    }
    if (!/does not re-fire/.test(lower) && !/not re-fire/.test(lower)) {
      throw new Error('listing must say the crash-restore prompt does not re-fire');
    }
  }
  return true;
}

function assertReleaseNotesMentionVersion(notes, version) {
  if (typeof notes !== 'string' || !notes.trim()) {
    throw new Error('release notes must be a non-empty string');
  }
  if (!notes.includes(String(version))) {
    throw new Error(`release notes must mention ${version}`);
  }
  return true;
}

module.exports = {
  extractFencedBlock,
  rejectBadListingCopy,
  assertReleaseNotesMentionVersion,
};
