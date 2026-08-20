/**
 * @jest-environment jsdom
 */
'use strict';

const { createMockBrowser, createDomSandbox, loadScriptInto, loadEnI18n } = require('./helpers/mock-browser');

function loadI18n(i18n) {
  const mock = createMockBrowser({ i18n });
  const sandbox = createDomSandbox(mock.browser);
  loadScriptInto(sandbox, 'i18n.js');
  return { mock, sandbox, I18n: sandbox.window.TabVaultI18n };
}

describe('TabVaultI18n', () => {
  test('t() returns the English message and substitutes placeholders', () => {
    const { I18n } = loadI18n(loadEnI18n());
    expect(I18n.t('extensionName')).toBe('Artek Tab Vault');
    expect(I18n.t('status_restored', ['3', 'tabs'])).toBe('Restored 3 tabs');
  });

  test('t() falls back to the key when the message is missing or getMessage throws', () => {
    const { I18n } = loadI18n({});
    expect(I18n.t('missing_key')).toBe('missing_key');
  });

  test('localeTag and wordForms read locale messages', () => {
    const { I18n } = loadI18n(loadEnI18n());
    expect(I18n.localeTag()).toBe('en');
    expect(I18n.wordForms('word_tab')).toEqual(['tab', 'tabs', 'tabs']);
  });

  test('apply() fills data-i18n, placeholder, title, and html lang', () => {
    document.documentElement.lang = 'xx';
    document.body.innerHTML = `
      <title data-i18n="extensionName">x</title>
      <p id="sub" data-i18n="popup_subtitle"></p>
      <input id="ph" data-i18n-placeholder="label_prefix_text" />
      <span id="ti" data-i18n-title="tab_state_active"></span>
    `;
    const { I18n } = loadI18n(loadEnI18n());
    I18n.apply();
    expect(document.getElementById('sub').textContent).toBe('Session backup + idle tab memory guardian');
    expect(document.getElementById('ph').getAttribute('placeholder')).toBe('Prefix text');
    expect(document.getElementById('ti').getAttribute('title')).toBe('active');
    expect(document.title).toBe('Artek Tab Vault');
    expect(document.documentElement.lang).toBe('en');
  });
});
