'use strict';

/*
 * Roadmap #4: unsaved-form protection.
 * Tracks whether the page has an edited-but-unsubmitted form so the
 * background guardian can skip discarding this tab and silently losing
 * typed input. Runs on every page; stays inert (near-zero overhead) unless
 * the background script asks.
 *
 * Dirty clears on submit, form reset, and same-document navigations
 * (popstate / hashchange / pageshow / history.pushState|replaceState)
 * so an SPA route change does not keep the tab undiscardable forever.
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

  function clearDirty() {
    dirty = false;
  }

  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);
  document.addEventListener('submit', clearDirty, true);
  document.addEventListener('reset', clearDirty, true);

  window.addEventListener('popstate', clearDirty);
  window.addEventListener('hashchange', clearDirty);
  window.addEventListener('pageshow', clearDirty);

  const historyObj = window.history;
  if (historyObj) {
    const wrap = (method) => {
      const original = historyObj[method];
      if (typeof original !== 'function') return;
      historyObj[method] = function () {
        const result = original.apply(this, arguments);
        clearDirty();
        return result;
      };
    };
    wrap('pushState');
    wrap('replaceState');
  }

  function collectIframeSrcs() {
    const srcs = [];
    const frames = document.querySelectorAll('iframe[src]');
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].src) srcs.push(frames[i].src);
    }
    return srcs;
  }

  function hasMedia() {
    const Core = window.TabVaultCore;
    const nodes = Array.from(document.querySelectorAll('video, audio'));
    if (Core && Core.pageHasInUseMedia) {
      return Core.pageHasInUseMedia(nodes, collectIframeSrcs());
    }
    return nodes.some((el) => {
      if (!el || el.ended) return false;
      if (!el.paused) return true;
      return typeof el.currentTime === 'number' && el.currentTime > 0;
    });
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'TABVAULT_CHECK_DIRTY_FORM') {
      return Promise.resolve({ dirty, hasMedia: hasMedia() });
    }
    return undefined;
  });
})();
