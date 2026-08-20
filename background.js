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
  markDiscardedInTitle: true,
  discardedTitlePrefix: '💤 ',
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

function stripDiscardedTitlesInPlace(windows) {
  for (const win of windows) {
    for (const tab of win.tabs || []) {
      if (tab.discarded) tab.title = Core.stripDiscardedTitlePrefix(tab.title, settings.discardedTitlePrefix);
    }
  }
  return windows;
}

async function takeSnapshot() {
  const windows = await browser.windows.getAll({ populate: true });
  await attachTabGroups(windows);
  stripDiscardedTitlesInPlace(windows);
  const snapshot = Core.buildSnapshotFromWindows(windows);

  const stored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
  let snapshots = stored[STORAGE_KEYS.SNAPSHOTS] || [];

  const prev = snapshots[snapshots.length - 1];
  if (!Core.shouldPersistSnapshot(prev, snapshot)) {
    if (Core.isSnapshotEmpty(snapshot)) {
      await appendPruneLog({ reason: 'skipped-empty-snapshot', droppedCount: 0 });
    }
    return { saved: false };
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
  return { saved: true };
}

// Content script (content-scripts/dirty-form.js) tracks whether a form on
// the page was touched since load and not yet submitted. If it can't be
// reached (no content script on that page, e.g. about: pages) we assume the
// tab is safe to discard rather than blocking the guardian forever.
async function probeTabGuards(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, { type: DIRTY_FORM_MESSAGE });
    return {
      dirty: !!(response && response.dirty),
      hasMedia: !!(response && response.hasMedia),
    };
  } catch (err) {
    return { dirty: false, hasMedia: false };
  }
}

async function tabHasUnsavedForm(tabId) {
  const guards = await probeTabGuards(tabId);
  return guards.dirty;
}

async function tabHasProtectedMedia(tabId) {
  const guards = await probeTabGuards(tabId);
  return guards.hasMedia;
}

// Roadmap #10: mark the tab's title (e.g. "💤 Original Title") right
// before discarding it, so it's visible at a glance in Firefox's own tab
// strip/sidebar, not just in our popup. Best-effort: some pages (about:,
// addons.mozilla.org, PDF viewer, etc.) refuse script injection - the tab
// still gets discarded either way, it just won't carry the visual marker.
async function markThenDiscard(tabId) {
  if (settings.markDiscardedInTitle) {
    try {
      await browser.tabs.executeScript(tabId, { file: 'content-scripts/mark-discarded.js' });
    } catch (err) {
      // ignore - see comment above.
    }
  }
  await browser.tabs.discard(tabId);
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
    const guards = await probeTabGuards(tab.id);
    if (guards.hasMedia) continue;
    if (settings.protectUnsavedForms && guards.dirty) continue;

    try {
      await markThenDiscard(tab.id);
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
  let discardedCount = 0;
  for (const tab of tabs) {
    if (tab.id === activeTab?.id) continue;
    if (Core.isWhitelisted(tab.url, settings.neverDiscardDomains)) continue;
    if (tab.pinned || tab.audible || tab.discarded) continue;
    if (Core.isKnownMediaUrl(tab.url)) continue;
    const guards = await probeTabGuards(tab.id);
    if (guards.hasMedia) continue;
    if (settings.protectUnsavedForms && guards.dirty) continue;
    try {
      await markThenDiscard(tab.id);
      discardedCount++;
    } catch (err) {
      // ignore tabs that refuse to be discarded
    }
  }
  await updateBadge();
  return discardedCount;
}

async function applyGroupPlan(plan, createdTabIds) {
  if (!browser.tabGroups || !plan.groups || !plan.groups.length) return;
  const groupPlan = Core.buildGroupPlan(plan.tabs, plan.groups);
  for (const group of groupPlan) {
    const tabIds = group.tabIndexes.map((i) => createdTabIds[i]).filter(Boolean);
    if (!tabIds.length) continue;
    try {
      const groupId = await browser.tabs.group({ tabIds });
      await browser.tabGroups.update(groupId, {
        title: group.title,
        color: group.color,
        collapsed: !!group.collapsed,
      });
    } catch (err) {
      // tabGroups API unavailable on this Firefox version/platform; the tabs
      // still get restored, just ungrouped.
    }
  }
}

async function pinRestoredTab(tabId) {
  if (tabId == null) return;
  try {
    await browser.tabs.update(tabId, { pinned: true });
  } catch (err) {
    // pin is best-effort; the tab is still restored.
  }
}

async function createRestoredTab(createProps) {
  if (!Core.isRestorableTabUrl(createProps && createProps.url)) {
    return null;
  }
  try {
    const created = await browser.tabs.create(createProps);
    return created && created.id != null ? created.id : null;
  } catch (err) {
    return null;
  }
}

// New-window restore: never pass unrestorable URLs. Create the window with
// the first restorable URL, then tabs.create the rest (pins after). If a
// url-array create is attempted and rejects, the same one-URL path is the
// fallback. try/catch each create.
async function restoreTabsIntoNewWindow(tabs) {
  const createdTabIds = [];
  let restored = 0;
  let skipped = 0;
  let windowId = null;

  const openWindow = async (url) => {
    try {
      return await browser.windows.create({ url });
    } catch (arrayErr) {
      if (Array.isArray(url) && url.length) {
        return browser.windows.create({ url: url[0] });
      }
      throw arrayErr;
    }
  };

  for (const tab of tabs) {
    if (!Core.isRestorableTabUrl(tab && tab.url)) {
      createdTabIds.push(null);
      skipped += 1;
      continue;
    }
    try {
      if (windowId == null) {
        const createdWindow = await openWindow(tab.url);
        windowId = createdWindow.id;
        const firstId = createdWindow.tabs && createdWindow.tabs[0] && createdWindow.tabs[0].id;
        createdTabIds.push(firstId != null ? firstId : null);
        if (firstId != null) {
          restored += 1;
          if (tab.pinned) await pinRestoredTab(firstId);
        } else {
          skipped += 1;
        }
      } else {
        const tabId = await createRestoredTab({
          windowId,
          url: tab.url,
          pinned: !!tab.pinned,
        });
        createdTabIds.push(tabId);
        if (tabId != null) restored += 1;
        else skipped += 1;
      }
    } catch (err) {
      createdTabIds.push(null);
      skipped += 1;
    }
  }
  return { createdTabIds, restored, skipped };
}

async function restoreSnapshot(timestamp, options = {}) {
  const stored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
  const snapshots = stored[STORAGE_KEYS.SNAPSHOTS] || [];
  const snapshot = snapshots.find((s) => s.timestamp === timestamp);
  if (!snapshot) return { ok: false, restored: 0, skipped: 0 };

  const summary = Core.summarizeRestorePlan(snapshot.windows);
  const plans = Core.planRestoreTargets(snapshot.windows, !!options.intoCurrentWindow);
  let restored = 0;
  let skipped = summary.skipped;

  for (const plan of plans) {
    const tabs = (plan.tabs || []).filter((t) => Core.isRestorableTabUrl(t && t.url));
    if (tabs.length < (plan.tabs || []).length) {
      skipped += (plan.tabs || []).length - tabs.length;
    }
    let createdTabIds = [];
    if (!tabs.length) continue;

    if (plan.mode === 'current') {
      const currentWindow = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
      for (const tab of tabs) {
        const tabId = await createRestoredTab({
          windowId: currentWindow.id,
          url: tab.url,
          pinned: !!tab.pinned,
        });
        createdTabIds.push(tabId);
        if (tabId != null) restored += 1;
        else skipped += 1;
      }
    } else {
      const opened = await restoreTabsIntoNewWindow(tabs);
      createdTabIds = opened.createdTabIds;
      restored += opened.restored;
      skipped += opened.skipped;
    }
    await applyGroupPlan({ ...plan, tabs }, createdTabIds);
  }
  return { ok: restored > 0, restored, skipped };
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
            title: t.discarded ? Core.stripDiscardedTitlePrefix(t.title, settings.discardedTitlePrefix) : t.title,
            favIconUrl: t.favIconUrl,
            pinned: t.pinned,
            state: Core.tabDisplayState(t),
          })),
      };
    }
    case 'DISCARD_ALL_EXCEPT_CURRENT':
      return { discardedCount: await discardAllExceptCurrent() };
    case 'RESTORE_SNAPSHOT':
      return restoreSnapshot(message.timestamp, { intoCurrentWindow: !!message.intoCurrentWindow });
    case 'BACKUP_NOW':
      return takeSnapshot();
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
async function markSessionState(cleanExit, extra) {
  const crashNotified = !!(extra && extra.crashNotified);
  await browser.storage.local.set({ [SESSION_STATE_KEY]: { cleanExit, crashNotified } });
}

function resolveLaunchKind() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (kind) => {
      if (settled) return;
      settled = true;
      resolve(kind);
    };
    if (browser.runtime.onInstalled) {
      browser.runtime.onInstalled.addListener((details) => {
        finish(details && details.reason === 'update' ? 'update' : 'install');
      });
    }
    if (browser.runtime.onStartup) {
      browser.runtime.onStartup.addListener(() => finish('startup'));
    }
    setTimeout(() => finish('startup'), 0);
  });
}

async function checkForCrashRestore(launchKind) {
  const stored = await browser.storage.local.get(SESSION_STATE_KEY);
  const previousState = stored[SESSION_STATE_KEY];
  const snapshotsStored = await browser.storage.local.get(STORAGE_KEYS.SNAPSHOTS);
  const hasSnapshots = (snapshotsStored[STORAGE_KEYS.SNAPSHOTS] || []).length > 0;
  const show =
    hasSnapshots && Core.shouldShowCrashPrompt(previousState, { launchKind: launchKind || 'startup' });
  const keepNotified = !!(previousState && previousState.cleanExit === false && previousState.crashNotified);
  await markSessionState(false, { crashNotified: show || keepNotified });
  if (!show) return;

  try {
    await browser.notifications.create('tabvault-crash-restore', {
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-96.png'),
      title: browser.i18n.getMessage('notif_crash_title'),
      message: browser.i18n.getMessage('notif_crash_message'),
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
  const launchKind = await resolveLaunchKind();
  await checkForCrashRestore(launchKind);
})();
