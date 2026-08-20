'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCALES = ['en', 'ru', 'kk', 'uk', 'be', 'sr'];

function load(locale) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', locale, 'messages.json'), 'utf8'));
}

function placeholders(message) {
  return (String(message).match(/\$\d+/g) || []).sort();
}

describe('locales', () => {
  const en = load('en');
  const enKeys = Object.keys(en).sort();

  test('English catalog is non-empty and every entry has a message', () => {
    expect(enKeys.length).toBeGreaterThan(20);
    for (const key of enKeys) {
      expect(typeof en[key].message).toBe('string');
      expect(en[key].message.length).toBeGreaterThan(0);
    }
  });

  test.each(LOCALES)('%s has the same keys as English and matching placeholders', (locale) => {
    const data = load(locale);
    expect(Object.keys(data).sort()).toEqual(enKeys);
    for (const key of enKeys) {
      expect(typeof data[key].message).toBe('string');
      expect(data[key].message.length).toBeGreaterThan(0);
      expect(placeholders(data[key].message)).toEqual(placeholders(en[key].message));
    }
  });

  test('each locale ships a locale_tag', () => {
    for (const locale of LOCALES) {
      expect(load(locale).locale_tag.message).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
    }
  });
});
