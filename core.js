/*
 * Pure, framework-free logic shared between background.js and the test suite.
 * No `browser.*` calls here on purpose - this file must run in plain Node
 * for unit testing, and be loadable as a classic script in the background
 * page (it attaches itself to `self.TabVaultCore`).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.TabVaultCore = mod;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  function getHostname(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (err) {
      return null;
    }
  }

  function isWhitelisted(url, domains) {
    if (!domains || !domains.length) return false;
    const hostname = getHostname(url);
    if (!hostname) return false;
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  }

  function parseDomainList(text) {
    if (!text) return [];
    const items = text
      .split(/[\n,]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .map((s) => s.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
    return Array.from(new Set(items));
  }

  function shouldDiscardTab(tab, { now, lastActiveAt, idleMs, whitelist = [] }) {
    if (!tab) return false;
    if (tab.discarded) return false;
    if (tab.active || tab.pinned || tab.audible) return false;
    if (isWhitelisted(tab.url, whitelist)) return false;

    const seenAt = typeof lastActiveAt === 'number' ? lastActiveAt : now;
    return now - seenAt >= idleMs;
  }

  function buildSnapshotFromWindows(windows, timestamp) {
    return {
      timestamp: timestamp ?? Date.now(),
      windows: (windows || []).map((win) => ({
        id: win.id,
        groups: (win.groups || []).map((g) => ({
          id: g.id,
          title: g.title || '',
          color: g.color || 'grey',
          collapsed: !!g.collapsed,
        })),
        tabs: (win.tabs || []).map((tab) => ({
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          pinned: !!tab.pinned,
          groupId: typeof tab.groupId === 'number' ? tab.groupId : -1,
        })),
      })),
    };
  }

  function snapshotSignature(snapshot) {
    if (!snapshot) return '';
    return snapshot.windows
      .map((w) => w.tabs.map((t) => t.url).join(','))
      .join('|');
  }

  function isDuplicateSnapshot(prevSnapshot, nextSnapshot) {
    if (!prevSnapshot) return false;
    return snapshotSignature(prevSnapshot) === snapshotSignature(nextSnapshot);
  }

  function isSnapshotEmpty(snapshot) {
    if (!snapshot) return true;
    return countTabsInSnapshot(snapshot) === 0;
  }

  // A snapshot with zero tabs is almost never a real "the user closed
  // everything" moment worth remembering - Firefox can't have a window with
  // no tabs, so this only happens during a startup/shutdown race. Persisting
  // it would let a crash/restart artifact evict good history from the
  // rolling backup, which is exactly the failure mode that wiped years of
  // sessions in competing tools (see ROADMAP.md #1).
  function shouldPersistSnapshot(prevSnapshot, nextSnapshot) {
    if (isSnapshotEmpty(nextSnapshot)) return false;
    if (isDuplicateSnapshot(prevSnapshot, nextSnapshot)) return false;
    return true;
  }

  function pruneSnapshots(snapshots, maxSnapshots) {
    if (!Array.isArray(snapshots)) return [];
    if (snapshots.length <= maxSnapshots) return snapshots;
    return snapshots.slice(snapshots.length - maxSnapshots);
  }

  function countTabsInSnapshot(snapshot) {
    return snapshot.windows.reduce((sum, w) => sum + w.tabs.length, 0);
  }

  function sanitizeSettings(settings, defaults) {
    const merged = { ...defaults, ...(settings || {}) };
    return {
      guardianEnabled: !!merged.guardianEnabled,
      idleMinutes: clampNumber(merged.idleMinutes, 1, 720, defaults.idleMinutes),
      backupIntervalMinutes: clampNumber(merged.backupIntervalMinutes, 0.5, 60, defaults.backupIntervalMinutes),
      maxSnapshots: clampNumber(merged.maxSnapshots, 1, 200, defaults.maxSnapshots),
      neverDiscardDomains: Array.isArray(merged.neverDiscardDomains) ? merged.neverDiscardDomains : [],
      smartTabActivation: merged.smartTabActivation !== undefined ? !!merged.smartTabActivation : !!defaults.smartTabActivation,
      protectUnsavedForms: merged.protectUnsavedForms !== undefined ? !!merged.protectUnsavedForms : !!defaults.protectUnsavedForms,
    };
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // --- Roadmap #2: smart tab activation on close ---------------------------
  // Firefox has no API to *prevent* the reload it kicks off when it makes a
  // discarded tab active, but we can react immediately and hand focus to the
  // nearest already-loaded tab instead, so the user isn't stuck staring at a
  // spinner they didn't ask for.
  function pickReplacementActiveTab(tabsInWindow, activatedTabId) {
    const sorted = (tabsInWindow || []).slice().sort((a, b) => a.index - b.index);
    const activatedPos = sorted.findIndex((t) => t.id === activatedTabId);
    if (activatedPos === -1) return null;
    const activated = sorted[activatedPos];
    if (!activated.discarded) return null;

    for (let offset = 1; offset < sorted.length; offset++) {
      const right = sorted[activatedPos + offset];
      if (right && !right.discarded) return right.id;
      const left = sorted[activatedPos - offset];
      if (left && !left.discarded) return left.id;
    }
    return null;
  }

  // --- Roadmap #3 / #6: tab-group-aware restore -----------------------------
  function buildGroupPlan(tabs, groups) {
    if (!Array.isArray(groups) || !groups.length || !Array.isArray(tabs)) return [];
    const byGroupId = new Map();
    tabs.forEach((tab, index) => {
      const groupId = tab && typeof tab.groupId === 'number' ? tab.groupId : -1;
      if (groupId === -1) return;
      if (!byGroupId.has(groupId)) byGroupId.set(groupId, []);
      byGroupId.get(groupId).push(index);
    });

    const plan = [];
    for (const group of groups) {
      const tabIndexes = byGroupId.get(group.id);
      if (!tabIndexes || !tabIndexes.length) continue;
      plan.push({ title: group.title || '', color: group.color || 'grey', collapsed: !!group.collapsed, tabIndexes });
    }
    return plan;
  }

  function planRestoreTargets(windows, intoCurrentWindow) {
    return (windows || [])
      .map((win, index) => {
        const tabs = (win.tabs || []).filter((t) => t.url && !t.url.startsWith('about:'));
        const mode = intoCurrentWindow && index === 0 ? 'current' : 'new';
        return { mode, tabs, groups: win.groups || [] };
      })
      .filter((plan) => plan.tabs.length > 0);
  }

  // --- Roadmap #5: proactive crash-restore prompt ---------------------------
  // We can't hook "browser is quitting" - there's no such WebExtension event.
  // Instead we track whether the last session ended via a normal all-windows-
  // closed path; if the extension starts up and that flag was never set, the
  // previous run most likely ended in a crash/force-kill/power loss.
  function shouldShowCrashPrompt(sessionState) {
    if (!sessionState) return false;
    return sessionState.cleanExit === false;
  }

  // --- Roadmap #7: tolerant snapshot import ---------------------------------
  function looksLikeUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
  }

  function normalizeImportedTab(raw) {
    const url = typeof raw === 'string' ? raw : raw && raw.url;
    if (!looksLikeUrl(url)) return null;
    const trimmedUrl = url.trim();
    return {
      url: trimmedUrl,
      title: (raw && typeof raw === 'object' && raw.title) || trimmedUrl,
      favIconUrl: (raw && typeof raw === 'object' && raw.favIconUrl) || null,
      pinned: !!(raw && typeof raw === 'object' && raw.pinned),
      groupId: -1,
    };
  }

  function normalizeImportedWindow(raw, fallbackId) {
    const rawTabs = Array.isArray(raw && raw.tabs) ? raw.tabs : Array.isArray(raw) ? raw : [];
    const tabs = rawTabs.map(normalizeImportedTab).filter(Boolean);
    return { id: (raw && raw.id) ?? fallbackId, groups: [], tabs };
  }

  function normalizeImportedSnapshot(raw, index) {
    let windowsRaw;
    if (Array.isArray(raw && raw.windows)) {
      windowsRaw = raw.windows;
    } else if (Array.isArray(raw && raw.tabs)) {
      windowsRaw = [{ tabs: raw.tabs }];
    } else {
      windowsRaw = [];
    }
    const windows = windowsRaw.map((w, i) => normalizeImportedWindow(w, i)).filter((w) => w.tabs.length > 0);
    const timestamp = Number.isFinite(raw && raw.timestamp) ? raw.timestamp : Date.now() + index;
    return { timestamp, windows };
  }

  function countRawEntries(rawSnapshots) {
    let count = 0;
    for (const raw of rawSnapshots || []) {
      if (Array.isArray(raw && raw.windows)) {
        for (const w of raw.windows) count += Array.isArray(w && w.tabs) ? w.tabs.length : 0;
      } else if (Array.isArray(raw && raw.tabs)) {
        count += raw.tabs.length;
      }
    }
    return count;
  }

  // Accepts our own export format, a handful of shapes used by competing
  // session managers (array/object of windows/tabs, {sessions:[...]}), and a
  // plain-text fallback (one URL per line, optionally "url<TAB>title"), so an
  // import never hard-fails just because the source tool structured its JSON
  // a little differently.
  function parseImportedSnapshots(input) {
    const result = { snapshots: [], skippedEntries: 0 };
    if (typeof input !== 'string' || !input.trim()) return result;

    let data;
    try {
      data = JSON.parse(input);
    } catch (err) {
      data = null;
    }

    let rawSnapshots = [];
    if (data === null) {
      const lines = input
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const tabs = lines.map((line) => {
        const [url, ...rest] = line.split(/\t| {2,}/);
        return { url, title: rest.join(' ').trim() || url };
      });
      rawSnapshots = [{ tabs }];
    } else if (Array.isArray(data)) {
      const hasSessionShape = data.some((item) => item && typeof item === 'object' && (Array.isArray(item.windows) || Array.isArray(item.tabs)));
      // No item looks like a session/window container - treat the whole
      // array as a flat list of tabs (URLs, or {url, title, ...} objects)
      // forming a single snapshot, tolerating unrelated/invalid entries.
      rawSnapshots = hasSessionShape ? data : [{ tabs: data }];
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.sessions)) {
        rawSnapshots = data.sessions;
      } else if (Array.isArray(data.windows) || Array.isArray(data.tabs)) {
        rawSnapshots = [data];
      }
    }

    const snapshots = rawSnapshots.map((raw, index) => normalizeImportedSnapshot(raw, index)).filter((snap) => snap.windows.length > 0);

    const keptTabCount = snapshots.reduce((sum, s) => sum + countTabsInSnapshot(s), 0);
    const originalTabCount = countRawEntries(rawSnapshots);

    result.snapshots = snapshots;
    result.skippedEntries = Math.max(0, originalTabCount - keptTabCount);
    return result;
  }

  // --- Roadmap #8: visible discarded/loaded state per tab -------------------
  function tabDisplayState(tab) {
    if (!tab) return 'loaded';
    if (tab.discarded) return 'discarded';
    if (tab.active) return 'active';
    return 'loaded';
  }

  return {
    getHostname,
    isWhitelisted,
    parseDomainList,
    shouldDiscardTab,
    buildSnapshotFromWindows,
    snapshotSignature,
    isDuplicateSnapshot,
    isSnapshotEmpty,
    shouldPersistSnapshot,
    pruneSnapshots,
    countTabsInSnapshot,
    sanitizeSettings,
    clampNumber,
    pickReplacementActiveTab,
    buildGroupPlan,
    planRestoreTargets,
    shouldShowCrashPrompt,
    parseImportedSnapshots,
    tabDisplayState,
  };
});
