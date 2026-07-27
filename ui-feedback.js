'use strict';

/*
 * Tiny, framework-free UI feedback helpers shared by popup.js and
 * options.js. Pure DOM wiring (no decision logic to unit-test per
 * .cursor/rules/testing-required.mdc) - a button press already gets a
 * `:active` scale animation from CSS alone; these two helpers add a
 * temporary "it worked" state on top of that so an action's success is
 * visible, not just inferred from data quietly changing elsewhere.
 */
const TabVaultUI = {
  // Swaps a button's label for "✓ <successText>" with a green flash for a
  // moment, then restores it. Only safe for buttons whose entire content is
  // plain text (not e.g. a label wrapping a hidden <input>).
  flashButton(button, successText, duration = 1100) {
    if (!button) return;
    const originalText = button.textContent;
    const wasDisabled = button.disabled;
    button.classList.add('is-success');
    button.disabled = true;
    if (successText) button.textContent = `✓ ${successText}`;
    setTimeout(() => {
      button.classList.remove('is-success');
      button.textContent = originalText;
      button.disabled = wasDisabled;
    }, duration);
  },

  // Class-only flash (background pulse via CSS `@keyframes`) - safe for any
  // element, including ones with nested children (e.g. a checkbox's row, or
  // a file-input label) since it never touches textContent.
  flashElement(el, duration = 650) {
    if (!el) return;
    el.classList.add('tv-flash');
    setTimeout(() => el.classList.remove('tv-flash'), duration);
  },
};
