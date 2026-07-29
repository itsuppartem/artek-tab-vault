'use strict';

/*
 * Tiny i18n helper shared by popup/options. Wraps browser.i18n and applies
 * data-i18n / data-i18n-placeholder / data-i18n-title attributes in HTML.
 */
const TabVaultI18n = {
  t(key, substitutions) {
    try {
      const msg = browser.i18n.getMessage(key, substitutions);
      return msg || key;
    } catch (err) {
      return key;
    }
  },

  localeTag() {
    return this.t('locale_tag') || 'en';
  },

  wordForms(prefix) {
    return [this.t(`${prefix}_one`), this.t(`${prefix}_few`), this.t(`${prefix}_many`)];
  },

  apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const text = this.t(key);
      if (el.tagName === 'TITLE') {
        el.textContent = text;
        document.title = text;
      } else {
        el.textContent = text;
      }
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', this.t(el.getAttribute('data-i18n-title')));
    });
    const htmlLang = (this.localeTag() || 'en').split('-')[0];
    if (document.documentElement) document.documentElement.lang = htmlLang;
  },
};
