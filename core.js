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

  const KNOWN_MEDIA_HOSTS = [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
    'netflix.com',
    'soundcloud.com',
    'open.spotify.com',
    'music.apple.com',
    'music.yandex.ru',
    'music.yandex.com',
  ];

  function isKnownMediaUrl(url) {
    const hostname = getHostname(url);
    if (!hostname) return false;
    return KNOWN_MEDIA_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  }

  function mediaElementIsInUse(el) {
    if (!el) return false;
    if (el.ended) return false;
    if (!el.paused) return true;
    return typeof el.currentTime === 'number' && el.currentTime > 0;
  }

  function pageHasInUseMedia(elements, iframeSrcs) {
    if ((elements || []).some(mediaElementIsInUse)) return true;
    return (iframeSrcs || []).some((src) => isKnownMediaUrl(src));
  }

  function shouldDiscardTab(tab, { now, lastActiveAt, idleMs, whitelist = [], hasMedia = false } = {}) {
    if (!tab) return false;
    if (tab.discarded) return false;
    if (tab.active || tab.pinned || tab.audible) return false;
    if (hasMedia) return false;
    if (isKnownMediaUrl(tab.url)) return false;
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

  // Generic "keep only the most recent N entries" trim, shared by snapshot
  // retention and the prune-log itself so the log doesn't grow forever.
  function trimToLast(items, max) {
    if (!Array.isArray(items)) return [];
    if (!Number.isFinite(max) || max < 0) return items;
    if (items.length <= max) return items;
    return items.slice(items.length - max);
  }

  function pruneSnapshots(snapshots, maxSnapshots) {
    return trimToLast(snapshots, maxSnapshots);
  }

  function countTabsInSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.windows)) return 0;
    return snapshot.windows.reduce((sum, w) => sum + (w && Array.isArray(w.tabs) ? w.tabs.length : 0), 0);
  }

  function sanitizeSettings(settings, defaults) {
    const merged = { ...defaults, ...(settings || {}) };
    return {
      guardianEnabled: !!merged.guardianEnabled,
      idleMinutes: clampNumber(merged.idleMinutes, 1, 720, defaults.idleMinutes),
      backupIntervalMinutes: clampNumber(merged.backupIntervalMinutes, 0.5, 60, defaults.backupIntervalMinutes),
      maxSnapshots: clampNumber(merged.maxSnapshots, 1, 200, defaults.maxSnapshots),
      maxBackupMB: clampBackupSizeMB(merged.maxBackupMB, defaults.maxBackupMB),
      neverDiscardDomains: Array.isArray(merged.neverDiscardDomains) ? merged.neverDiscardDomains : [],
      smartTabActivation: merged.smartTabActivation !== undefined ? !!merged.smartTabActivation : !!defaults.smartTabActivation,
      protectUnsavedForms: merged.protectUnsavedForms !== undefined ? !!merged.protectUnsavedForms : !!defaults.protectUnsavedForms,
      markDiscardedInTitle: merged.markDiscardedInTitle !== undefined ? !!merged.markDiscardedInTitle : !!defaults.markDiscardedInTitle,
      discardedTitlePrefix: sanitizeTitlePrefix(merged.discardedTitlePrefix, defaults.discardedTitlePrefix),
      restoreIntoCurrentWindow: !!merged.restoreIntoCurrentWindow,
    };
  }

  function sanitizeTitlePrefix(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.slice(0, 20); // keep tab titles from becoming unreadable
    return trimmed.length ? trimmed : fallback;
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // 0 is a valid, meaningful value here ("no extra size cap beyond the
  // snapshot-count limit and the browser's own storage quota").
  function clampBackupSizeMB(value, fallback) {
    const n = Number(value);
    if (n === 0) return 0;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(500, Math.max(1, n));
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

  // Privileged/internal URLs cannot be opened via windows.create / tabs.create
  // (Firefox rejects the whole call if any URL in the list is privileged).
  // about:blank is the only about: URL extensions can restore.
  function isRestorableTabUrl(url) {
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (lower === 'about:blank') return true;
    if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
    return false;
  }

  function summarizeRestorePlan(windows) {
    let restorable = 0;
    let skipped = 0;
    for (const win of windows || []) {
      for (const tab of win.tabs || []) {
        if (isRestorableTabUrl(tab && tab.url)) restorable += 1;
        else skipped += 1;
      }
    }
    return { restorable, skipped };
  }

  function planRestoreTargets(windows, intoCurrentWindow) {
    return (windows || [])
      .map((win, index) => {
        const tabs = (win.tabs || []).filter((t) => isRestorableTabUrl(t.url));
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
  function shouldShowCrashPrompt(sessionState, options) {
    if (!sessionState) return false;
    if (sessionState.cleanExit !== false) return false;
    if (sessionState.crashNotified) return false;
    const launchKind = options && options.launchKind;
    if (launchKind && launchKind !== 'startup') return false;
    return true;
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
      groupId: raw && typeof raw === 'object' && typeof raw.groupId === 'number' ? raw.groupId : -1,
    };
  }

  function normalizeImportedGroup(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'number') return null;
    return {
      id: raw.id,
      title: raw.title || '',
      color: raw.color || 'grey',
      collapsed: !!raw.collapsed,
    };
  }

  function normalizeImportedWindow(raw, fallbackId) {
    const rawTabs = Array.isArray(raw && raw.tabs) ? raw.tabs : Array.isArray(raw) ? raw : [];
    const tabs = rawTabs.map(normalizeImportedTab).filter(Boolean);
    const groups = Array.isArray(raw && raw.groups)
      ? raw.groups.map(normalizeImportedGroup).filter(Boolean)
      : [];
    return { id: (raw && raw.id) ?? fallbackId, groups, tabs };
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
  // session managers (array/object of windows/tabs, {sessions:[...]},
  // {snapshots:[...]}), and a plain-text fallback (one URL per line,
  // optionally "url<TAB>title"), so an import never hard-fails just because
  // the source tool structured its JSON a little differently.
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
      } else if (Array.isArray(data.snapshots)) {
        rawSnapshots = data.snapshots;
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

  // --- Roadmap #10: sleep-emoji title marker on discarded tabs (Auto Tab
  // Discard parity) -------------------------------------------------------
  // Firefox's WebExtension APIs have no way to set a tab's title directly
  // (`tabs.update({title})` was proposed and rejected upstream - see
  // bugzilla 1333943/1340633). The trick every discard-based suspender uses:
  // rewrite `document.title` via a content script *right before* calling
  // `tabs.discard()`. Once discarded, the page is unloaded and nothing can
  // overwrite the cached title again until the tab reloads for real, at
  // which point the page's own title naturally replaces it.
  const DEFAULT_DISCARDED_TITLE_PREFIX = '💤 ';

  function withDiscardedTitlePrefix(title, prefix) {
    const p = typeof prefix === 'string' && prefix.length ? prefix : DEFAULT_DISCARDED_TITLE_PREFIX;
    const safeTitle = title || '';
    return safeTitle.startsWith(p) ? safeTitle : p + safeTitle;
  }

  function stripDiscardedTitlePrefix(title, prefix) {
    const p = typeof prefix === 'string' && prefix.length ? prefix : DEFAULT_DISCARDED_TITLE_PREFIX;
    const safeTitle = title || '';
    return safeTitle.startsWith(p) ? safeTitle.slice(p.length) : safeTitle;
  }

  // --- UI polish: Slavic pluralization for count-based success
  // messages (one / few / many) in the popup/options confirmation toasts,
  // instead of always picking one fixed word form.
  function pluralizeRu(count, forms) {
    const n = Math.abs(Math.trunc(Number(count) || 0));
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  }

  // --- Roadmap #9: configurable backup size/retention + transparency log ---
  function estimateSnapshotBytes(snapshot) {
    const json = JSON.stringify(snapshot) || '';
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
    return json.length;
  }

  function totalSnapshotsBytes(snapshots) {
    return (snapshots || []).reduce((sum, s) => sum + estimateSnapshotBytes(s), 0);
  }

  // Drops the oldest snapshots until the rolling backup fits the byte
  // budget, but always keeps at least the single most recent snapshot even
  // if it alone exceeds the budget - a bad limit shouldn't be able to wipe
  // the only backup a user has (same philosophy as the #1 integrity guard).
  function pruneSnapshotsBySize(snapshots, maxBytes) {
    if (!Array.isArray(snapshots)) return [];
    if (!maxBytes || maxBytes <= 0) return snapshots;
    const kept = snapshots.slice();
    while (kept.length > 1 && totalSnapshotsBytes(kept) > maxBytes) {
      kept.shift();
    }
    return kept;
  }

  // Applies the count limit first, then the byte-size limit on top, and
  // reports how many snapshots each step actually dropped so the caller can
  // log *why* history got shorter instead of silently discarding it.
  function enforceRetentionLimits(snapshots, limits = {}) {
    const before = Array.isArray(snapshots) ? snapshots : [];
    const afterCount = Number.isFinite(limits.maxSnapshots) ? pruneSnapshots(before, limits.maxSnapshots) : before;
    const droppedByCount = before.length - afterCount.length;

    let afterSize = afterCount;
    let droppedBySize = 0;
    if (limits.maxBytes) {
      afterSize = pruneSnapshotsBySize(afterCount, limits.maxBytes);
      droppedBySize = afterCount.length - afterSize.length;
    }

    return { snapshots: afterSize, droppedByCount, droppedBySize };
  }

  // Predefined retention/idle combinations so users don't have to reason
  // about interacting knobs from scratch; still just fills the form, every
  // field stays editable afterwards.
  const RETENTION_PRESETS = {
    compact: { idleMinutes: 10, backupIntervalMinutes: 2, maxSnapshots: 10, maxBackupMB: 5 },
    balanced: { idleMinutes: 15, backupIntervalMinutes: 5, maxSnapshots: 20, maxBackupMB: 15 },
    archivist: { idleMinutes: 30, backupIntervalMinutes: 1, maxSnapshots: 100, maxBackupMB: 60 },
  };

  function applyRetentionPreset(name) {
    const preset = RETENTION_PRESETS[name];
    return preset ? { ...preset } : null;
  }

  function buildPruneLogEntry({ timestamp, reason, droppedCount }) {
    return {
      timestamp: typeof timestamp === 'number' ? timestamp : Date.now(),
      reason,
      droppedCount: Number.isFinite(droppedCount) ? droppedCount : 0,
    };
  }

  return {
    getHostname,
    isWhitelisted,
    parseDomainList,
    isKnownMediaUrl,
    mediaElementIsInUse,
    pageHasInUseMedia,
    KNOWN_MEDIA_HOSTS,
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
    isRestorableTabUrl,
    summarizeRestorePlan,
    planRestoreTargets,
    shouldShowCrashPrompt,
    parseImportedSnapshots,
    tabDisplayState,
    trimToLast,
    clampBackupSizeMB,
    estimateSnapshotBytes,
    totalSnapshotsBytes,
    pruneSnapshotsBySize,
    enforceRetentionLimits,
    RETENTION_PRESETS,
    applyRetentionPreset,
    buildPruneLogEntry,
    DEFAULT_DISCARDED_TITLE_PREFIX,
    withDiscardedTitlePrefix,
    stripDiscardedTitlePrefix,
    pluralizeRu,
  };
});
