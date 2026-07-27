'use strict';

/*
 * Artek Tab Vault
 * - Keeps its own rolling backup of all open windows/tabs, independent of
 *   Firefox's native session restore (which can fail on crash/update).
 * - Guardian: discards tabs that have been idle for a while to free memory,
 *   skipping pinned tabs, tabs playing audio, the active tab and whitelisted
 *   domains.
 *
 * Pure decision-making logic lives in core.js so it can be unit tested
 * without a browser environment.
 */

const Core = self.TabVaultCore;

const STORAGE_KEYS = {
  SETTINGS: 'tabvault_settings',
  SNAPSHOTS: 'tabvault_snapshots',
};

const DEFAULT_SETTINGS = {
  guardianEnabled: true,
  idleMinutes: 15,
  backupIntervalMinutes: 1,
  maxSnapshots: 20,
  neverDiscardDomains: [],
};

const BACKUP_ALARM = 'tabvault-backup';
const GUARDIAN_ALARM = 'tabvault-guardian';

const lastActive = new Map(); // tabId -> timestamp

let settings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  const stored = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
  settings = Core.sanitizeSettings(stored[STORAGE_KEYS.SETTINGS], DEFAULT_SETTINGS);
  return settings;
}

function scheduleAlarms() {
  browser.alarms.create(BACKUP_ALARM, { periodInMinutes: Math.max(0.5, settings.backupIntervalMinutes) });
  browser.alarms.create(GUARDIAN_ALARM, { periodInMinutes: 1 });
}

async function touchAllTabsActivity() {
  const tabs = await browser.tabs.query({});
  const now = Date.now();
  for (const tab of tabs) {
    if (!lastActive.has(tab.id)) {
      lastActive.set(tab.id, now);
    }
  }
}

async function takeSnapshot() {
  const windows = await browser.windows.getAll({ populate: true });
  const snapshot = Core.buildSnapshotFromWindows(windows);

  const stored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
  let snapshots = stored[STORAGE_KEYS.SNAPSHOTS] || [];

  const prev = snapshots[snapshots.length - 1];
  if (Core.isDuplicateSnapshot(prev, snapshot)) return;

  snapshots.push(snapshot);
  snapshots = Core.pruneSnapshots(snapshots, settings.maxSnapshots);
  await browser.storage.local.set({ [STORAGE_KEYS.SNAPSHOTS]: snapshots });
}

async function runGuardian() {
  if (!settings.guardianEnabled) return;

  const idleMs = settings.idleMinutes * 60 * 1000;
  const now = Date.now();
  const tabs = await browser.tabs.query({});

  for (const tab of tabs) {
    if (tab.active || tab.pinned || tab.audible) {
      lastActive.set(tab.id, now);
    } else if (!lastActive.has(tab.id)) {
      lastActive.set(tab.id, now);
    }

    const shouldDiscard = Core.shouldDiscardTab(tab, {
      now,
      lastActiveAt: lastActive.get(tab.id),
      idleMs,
      whitelist: settings.neverDiscardDomains,
    });

    if (shouldDiscard) {
      try {
        await browser.tabs.discard(tab.id);
      } catch (err) {
        // Some tabs (e.g. about: pages) cannot be discarded; ignore.
      }
    }
  }

  await updateBadge();
}

async function updateBadge() {
  const tabs = await browser.tabs.query({});
  const discardedCount = tabs.filter((t) => t.discarded).length;
  await browser.browserAction.setBadgeBackgroundColor({ color: '#ff5f0f' });
  await browser.browserAction.setBadgeText({ text: discardedCount > 0 ? String(discardedCount) : '' });
}

async function discardAllExceptCurrent() {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tabs = await browser.tabs.query({ currentWindow: true });
  for (const tab of tabs) {
    if (tab.id === activeTab?.id) continue;
    if (Core.isWhitelisted(tab.url, settings.neverDiscardDomains)) continue;
    if (tab.pinned || tab.audible || tab.discarded) continue;
    try {
      await browser.tabs.discard(tab.id);
    } catch (err) {
      // ignore tabs that refuse to be discarded
    }
  }
  await updateBadge();
}

async function restoreSnapshot(timestamp) {
  const stored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
  const snapshots = stored[STORAGE_KEYS.SNAPSHOTS] || [];
  const snapshot = snapshots.find((s) => s.timestamp === timestamp);
  if (!snapshot) return false;

  for (const win of snapshot.windows) {
    const urls = win.tabs.map((t) => t.url).filter((u) => u && !u.startsWith('about:'));
    if (urls.length === 0) continue;
    await browser.windows.create({ url: urls });
  }
  return true;
}

browser.runtime.onMessage.addListener(async (message) => {
  switch (message?.type) {
    case 'GET_STATE': {
      const tabs = await browser.tabs.query({});
      const stored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
      return {
        settings,
        discardedCount: tabs.filter((t) => t.discarded).length,
        totalTabs: tabs.length,
        snapshots: (stored[STORAGE_KEYS.SNAPSHOTS] || []).slice().reverse(),
      };
    }
    case 'DISCARD_ALL_EXCEPT_CURRENT':
      await discardAllExceptCurrent();
      return true;
    case 'RESTORE_SNAPSHOT':
      return restoreSnapshot(message.timestamp);
    case 'BACKUP_NOW':
      await takeSnapshot();
      return true;
    default:
      return undefined;
  }
});

// Settings are written directly to storage by the popup/options pages;
// the background page just reacts and re-applies them.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEYS.SETTINGS]) return;
  settings = Core.sanitizeSettings(changes[STORAGE_KEYS.SETTINGS].newValue, DEFAULT_SETTINGS);
  scheduleAlarms();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BACKUP_ALARM) takeSnapshot();
  if (alarm.name === GUARDIAN_ALARM) runGuardian();
});

browser.tabs.onActivated.addListener(({ tabId }) => {
  lastActive.set(tabId, Date.now());
});

browser.tabs.onRemoved.addListener((tabId) => {
  lastActive.delete(tabId);
});

browser.commands.onCommand.addListener((command) => {
  if (command === 'discard-all-except-current') discardAllExceptCurrent();
});

(async function init() {
  await loadSettings();
  await touchAllTabsActivity();
  scheduleAlarms();
  await takeSnapshot();
  await updateBadge();
})();
