'use strict';

/*
 * Screenshot harness only — injected into a throwaway copy of the extension by
 * scripts/make-store-assets.js, never part of the shipped package. Fakes the
 * WebExtension APIs popup.js/options.js call so both pages render with
 * realistic data in a plain browser tab, which is what AMO store screenshots
 * are captured from.
 *
 * Keep the fake data honest: it should look like a normal session, not like
 * numbers chosen to flatter the extension.
 */

const NOW = Date.parse('2026-07-29T14:12:00Z');

const SETTINGS = {
  guardianEnabled: true,
  idleMinutes: 30,
  backupIntervalMinutes: 1,
  maxSnapshots: 100,
  maxBackupMB: 60,
  neverDiscardDomains: ['mail.google.com', 'github.com', 'figma.com'],
  smartTabActivation: true,
  protectUnsavedForms: true,
  markDiscardedInTitle: true,
  discardedTitlePrefix: '💤 ',
};

function windowWithTabs(count) {
  return {
    tabs: Array.from({ length: count }, (_, i) => ({
      title: `Tab ${i + 1}`,
      url: `https://example.com/${i + 1}`,
    })),
  };
}

const SNAPSHOTS = [
  { timestamp: NOW - 240 * 60 * 1000, windows: [windowWithTabs(31)] },
  { timestamp: NOW - 95 * 60 * 1000, windows: [windowWithTabs(18)] },
  { timestamp: NOW - 34 * 60 * 1000, windows: [windowWithTabs(21)] },
  { timestamp: NOW - 2 * 60 * 1000, windows: [windowWithTabs(23)] },
];

const PRUNE_LOG = [
  { timestamp: NOW - 26 * 60 * 60 * 1000, reason: 'max-snapshots-limit', droppedCount: 3 },
  { timestamp: NOW - 5 * 60 * 60 * 1000, reason: 'skipped-empty-snapshot', droppedCount: 0 },
  { timestamp: NOW - 40 * 60 * 1000, reason: 'max-size-limit', droppedCount: 2 },
];

const TABS_LIST = [
  { id: 1, title: 'Artek Tab Vault — settings', state: 'active' },
  { id: 2, title: 'Bug 1554482 - Allow extensions to control tab reloading', state: 'loaded' },
  { id: 3, title: 'Inbox (14) - Gmail', state: 'loaded' },
  { id: 4, title: 'How much RAM does Firefox really need? : r/firefox', state: 'discarded' },
  { id: 5, title: 'MDN Web Docs — tabs.discard()', state: 'discarded' },
  { id: 6, title: 'Grafana / Production overview', state: 'discarded' },
  { id: 7, title: 'YouTube — Lo-fi beats to debug to', state: 'discarded' },
];

const STORE = {
  tabvault_settings: SETTINGS,
  tabvault_snapshots: SNAPSHOTS,
  tabvault_prune_log: PRUNE_LOG,
};

window.browser = {
  runtime: {
    sendMessage: async (message) => {
      if (message.type === 'GET_STATE') {
        return {
          totalTabs: 24,
          discardedCount: 11,
          settings: SETTINGS,
          snapshots: SNAPSHOTS,
          tabsList: TABS_LIST,
        };
      }
      return true;
    },
    openOptionsPage: async () => {},
    onMessage: { addListener() {} },
  },
  storage: {
    local: {
      get: async (keys) => {
        const wanted = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const key of wanted) if (key in STORE) out[key] = STORE[key];
        return out;
      },
      set: async () => {},
    },
  },
};
