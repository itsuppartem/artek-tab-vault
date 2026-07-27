'use strict';

/*
 * Roadmap #10: prepend a "discarded" marker to the tab's title right before
 * background.js calls tabs.discard() on it. Firefox has no API to set a
 * tab's title directly (rejected upstream, see bugzilla 1333943/1340633),
 * so this is the standard trick every discard-based suspender uses - the
 * browser keeps showing this cached title after the page unloads, until the
 * tab is reactivated and reloads for real (which naturally restores the
 * page's own title, no cleanup needed on our side).
 *
 * Injected on demand via tabs.executeScript right before discard, not
 * declared as a persistent content script - it only ever needs to run once.
 */
(async function () {
  const DEFAULT_PREFIX = '💤 ';
  try {
    const stored = await browser.storage.local.get('tabvault_settings');
    const settings = stored.tabvault_settings || {};
    const prefix = typeof settings.discardedTitlePrefix === 'string' && settings.discardedTitlePrefix ? settings.discardedTitlePrefix : DEFAULT_PREFIX;
    if (!document.title.startsWith(prefix)) {
      document.title = prefix + document.title;
    }
  } catch (err) {
    // Best-effort only; worst case the title just doesn't get marked.
  }
})();
