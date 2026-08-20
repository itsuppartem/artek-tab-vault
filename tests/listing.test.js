'use strict';

const fs = require('fs');
const path = require('path');
const {
  extractFencedBlock,
  rejectBadListingCopy,
  assertReleaseNotesMentionVersion,
} = require('./helpers/listing-copy');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('AMO listing copy', () => {
  const listingMd = read('LISTING.md');
  const en = extractFencedBlock(listingMd, '## Description (full, en-US)');
  const ru = extractFencedBlock(listingMd, '## Description (ru-RU)');
  const meta = JSON.parse(read('amo-metadata.json'));
  const notes = meta.version.release_notes['en-US'];

  test('LISTING.md en-US description mentions Guardian media protection (known hosts + in-use video/audio)', () => {
    expect(en).toMatch(/media protection/i);
    expect(en).toMatch(/known media hosts/i);
    expect(en).toMatch(/playing or paused with progress/i);
    expect(en).toMatch(/never-played video is not protected/i);
    expect(rejectBadListingCopy(en, { locale: 'en' })).toBe(true);
  });

  test('LISTING.md ru-RU description mentions media protection', () => {
    expect(ru).toMatch(/защита медиа/i);
    expect(ru).toMatch(/медиа-хост/i);
    expect(ru).toMatch(/видео/i);
    expect(rejectBadListingCopy(ru, { locale: 'ru' })).toBe(true);
  });

  test('LISTING.md crash-restore copy says the prompt skips install/update/reload and does not re-fire', () => {
    expect(en).toMatch(/crash-restore/i);
    expect(en).toMatch(/skipped on addon install, update, or reload/i);
    expect(en).toMatch(/does not re-fire/i);
    expect(ru).toMatch(/пропускается при установке, обновлении или перезагрузке/i);
  });

  test('amo-metadata.json release_notes.en-US mention listed version 0.3.2', () => {
    expect(assertReleaseNotesMentionVersion(notes, '0.3.2')).toBe(true);
    expect(notes).toMatch(/0\.3\.2/);
  });

  test('rejectBadListingCopy throws when English copy omits media protection', () => {
    expect(() => rejectBadListingCopy('')).toThrow(/non-empty/);
    expect(() => rejectBadListingCopy('session backup only, no guardian extras')).toThrow(
      /media protection/
    );
    expect(() => assertReleaseNotesMentionVersion('0.3.0 notes only', '0.3.1')).toThrow(/0\.3\.1/);
  });
});
