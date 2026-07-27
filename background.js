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
  PRUNE_LOG: 'tabvault_prune_log',
};

const DEFAULT_SETTINGS = {
  guardianEnabled: true,
  idleMinutes: 15,
  backupIntervalMinutes: 1,
  maxSnapshots: 20,
  maxBackupMB: 15,
  neverDiscardDomains: [],
  smartTabActivation: true,
  protectUnsavedForms: true,
};

const MAX_PRUNE_LOG_ENTRIES = 50;

const BACKUP_ALARM = 'tabvault-backup';
const GUARDIAN_ALARM = 'tabvault-guardian';
const SESSION_STATE_KEY = 'tabvault_session_state';
const DIRTY_FORM_MESSAGE = 'TABVAULT_CHECK_DIRTY_FORM';

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

async function attachTabGroups(windows) {
  if (!browser.tabGroups) return windows;
  for (const win of windows) {
    try {
      win.groups = await browser.tabGroups.query({ windowId: win.id });
    } catch (err) {
      win.groups = [];
    }
  }
  return windows;
}

// Roadmap #9: append-only, capped log of every time the rolling backup lost
// history - either because a limit evicted old snapshots, or because a
// snapshot was rejected outright (e.g. the #1 empty-snapshot guard). Makes
// retention behavior visible instead of the silent history loss competing
// tools got burned by.
async function appendPruneLog(entry) {
  const stored = await browser.storage.local.get(STORAGE_KEYS.PRUNE_LOG);
  let log = stored[STORAGE_KEYS.PRUNE_LOG] || [];
  log.push(Core.buildPruneLogEntry(entry));
  log = Core.trimToLast(log, MAX_PRUNE_LOG_ENTRIES);
  await browser.storage.local.set({ [STORAGE_KEYS.PRUNE_LOG]: log });
}

async function takeSnapshot() {
  const windows = await browser.windows.getAll({ populate: true });
  await attachTabGroups(windows);
  const snapshot = Core.buildSnapshotFromWindows(windows);

  const stored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
  let snapshots = stored[STORAGE_KEYS.SNAPSHOTS] || [];

  const prev = snapshots[snapshots.length - 1];
  if (!Core.shouldPersistSnapshot(prev, snapshot)) {
    if (Core.isSnapshotEmpty(snapshot)) {
      await appendPruneLog({ reason: 'skipped-empty-snapshot', droppedCount: 0 });
    }
    return;
  }

  snapshots.push(snapshot);
  const maxBytes = settings.maxBackupMB > 0 ? settings.maxBackupMB * 1024 * 1024 : null;
  const { snapshots: retained, droppedByCount, droppedBySize } = Core.enforceRetentionLimits(snapshots, {
    maxSnapshots: settings.maxSnapshots,
    maxBytes,
  });
  await browser.storage.local.set({ [STORAGE_KEYS.SNAPSHOTS]: retained });

  if (droppedByCount > 0) {
    await appendPruneLog({ reason: 'max-snapshots-limit', droppedCount: droppedByCount });
  }
  if (droppedBySize > 0) {
    await appendPruneLog({ reason: 'max-size-limit', droppedCount: droppedBySize });
  }
}

// Content script (content-scripts/dirty-form.js) tracks whether a form on
// the page was touched since load and not yet submitted. If it can't be
// reached (no content script on that page, e.g. about: pages) we assume the
// tab is safe to discard rather than blocking the guardian forever.
async function tabHasUnsavedForm(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, { type: DIRTY_FORM_MESSAGE });
    return !!(response && response.dirty);
  } catch (err) {
    return false;
  }
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

    if (!shouldDiscard) continue;
    if (settings.protectUnsavedForms && (await tabHasUnsavedForm(tab.id))) continue;

    try {
      await browser.tabs.discard(tab.id);
    } catch (err) {
      // Some tabs (e.g. about: pages) cannot be discarded; ignore.
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
    if (settings.protectUnsavedForms && (await tabHasUnsavedForm(tab.id))) continue;
    try {
      await browser.tabs.discard(tab.id);
    } catch (err) {
      // ignore tabs that refuse to be discarded
    }
  }
  await updateBadge();
}

async function applyGroupPlan(plan, createdTabIds) {
  if (!browser.tabGroups || !plan.groups || !plan.groups.length) return;
  const groupPlan = Core.buildGroupPlan(plan.tabs, plan.groups);
  for (const group of groupPlan) {
    const tabIds = group.tabIndexes.map((i) => createdTabIds[i]).filter(Boolean);
    if (!tabIds.length) continue;
    try {
      const groupId = await browser.tabs.group({ tabIds });
      await browser.tabGroups.update(groupId, { title: group.title, color: group.color });
    } catch (err) {
      // tabGroups API unavailable on this Firefox version/platform; the tabs
      // still get restored, just ungrouped.
    }
  }
}

async function restoreSnapshot(timestamp, options = {}) {
  const stored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
  const snapshots = stored[STORAGE_KEYS.SNAPSHOTS] || [];
  const snapshot = snapshots.find((s) => s.timestamp === timestamp);
  if (!snapshot) return false;

  const plans = Core.planRestoreTargets(snapshot.windows, !!options.intoCurrentWindow);

  for (const plan of plans) {
    let createdTabIds = [];
    if (plan.mode === 'current') {
      const currentWindow = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
      for (const tab of plan.tabs) {
        const created = await browser.tabs.create({ windowId: currentWindow.id, url: tab.url, pinned: !!tab.pinned });
        createdTabIds.push(created.id);
      }
    } else {
      const createdWindow = await browser.windows.create({ url: plan.tabs.map((t) => t.url) });
      createdTabIds = createdWindow.tabs.map((t) => t.id);
    }
    await applyGroupPlan(plan, createdTabIds);
  }
  return true;
}

browser.runtime.onMessage.addListener(async (message) => {
  switch (message?.type) {
    case 'GET_STATE': {
      const allTabs = await browser.tabs.query({});
      const windowTabs = await browser.tabs.query({ currentWindow: true });
      const stored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
      return {
        settings,
        discardedCount: allTabs.filter((t) => t.discarded).length,
        totalTabs: allTabs.length,
        snapshots: (stored[STORAGE_KEYS.SNAPSHOTS] || []).slice().reverse(),
        tabsList: windowTabs
          .sort((a, b) => a.index - b.index)
          .map((t) => ({
            id: t.id,
            title: t.title,
            favIconUrl: t.favIconUrl,
            pinned: t.pinned,
            state: Core.tabDisplayState(t),
          })),
      };
    }
    case 'DISCARD_ALL_EXCEPT_CURRENT':
      await discardAllExceptCurrent();
      return true;
    case 'RESTORE_SNAPSHOT':
      return restoreSnapshot(message.timestamp, { intoCurrentWindow: !!message.intoCurrentWindow });
    case 'BACKUP_NOW':
      await takeSnapshot();
      return true;
    case 'ACTIVATE_TAB':
      await browser.tabs.update(message.tabId, { active: true });
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

browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  lastActive.delete(tabId);
  if (removeInfo.isWindowClosing || !settings.smartTabActivation) return;
  try {
    const tabsInWindow = await browser.tabs.query({ windowId: removeInfo.windowId });
    const activeTab = tabsInWindow.find((t) => t.active);
    if (!activeTab) return;
    const replacementId = Core.pickReplacementActiveTab(tabsInWindow, activeTab.id);
    if (replacementId) await browser.tabs.update(replacementId, { active: true });
  } catch (err) {
    // The window may have closed concurrently with the tab; nothing to do.
  }
});

browser.commands.onCommand.addListener((command) => {
  if (command === 'discard-all-except-current') discardAllExceptCurrent();
});

// --- Roadmap #5: proactive crash-restore prompt -----------------------------
// `cleanExit` is flipped to true whenever the last window in the browser
// closes normally, and back to false as soon as a new session starts. If we
// come up at startup and it's still false, the previous run never reached
// that "all windows closed" path - most likely a crash, force-quit, or power
// loss - so we proactively point the user at their last backup.
async function markSessionState(cleanExit) {
  await browser.storage.local.set({ [SESSION_STATE_KEY]: { cleanExit } });
}

async function checkForCrashRestore() {
  const stored = await browser.storage.local.get(SESSION_STATE_KEY);
  const previousState = stored[SESSION_STATE_KEY];
  await markSessionState(false);
  if (!Core.shouldShowCrashPrompt(previousState)) return;

  const snapshotsStored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
  if (!(snapshotsStored[STORAGE_KEYS.SNAPSHOTS] || []).length) return;

  try {
    await browser.notifications.create('tabvault-crash-restore', {
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon.svg'),
      title: 'Artek Tab Vault',
      message: 'Похоже, прошлая сессия Firefox завершилась некорректно. Нажмите, чтобы открыть последний бэкап вкладок.',
    });
  } catch (err) {
    // notifications permission/platform issue; skip silently.
  }
}

browser.notifications?.onClicked?.addListener((notificationId) => {
  if (notificationId === 'tabvault-crash-restore') {
    browser.runtime.openOptionsPage();
    browser.notifications.clear(notificationId);
  }
});

browser.windows.onRemoved.addListener(async () => {
  const remaining = await browser.windows.getAll();
  if (remaining.length === 0) await markSessionState(true);
});

(async function init() {
  await loadSettings();
  await touchAllTabsActivity();
  scheduleAlarms();
  await takeSnapshot();
  await updateBadge();
  await checkForCrashRestore();
})();
