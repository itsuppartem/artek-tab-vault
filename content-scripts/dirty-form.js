'use strict';

/*
 * Roadmap #4: unsaved-form protection.
 * Tracks whether the page has an edited-but-unsubmitted form so the
 * background guardian can skip discarding this tab and silently losing
 * typed input. Runs on every page; stays inert (near-zero overhead) unless
 * the background script asks.
 */
(function () {
  let dirty = false;

  function markDirty(event) {
    const target = event.target;
    if (!target) return;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
      dirty = true;
    }
  }

  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);
  document.addEventListener('submit', () => {
    dirty = false;
  }, true);

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'TABVAULT_CHECK_DIRTY_FORM') {
      return Promise.resolve({ dirty });
    }
    return undefined;
  });
})();
