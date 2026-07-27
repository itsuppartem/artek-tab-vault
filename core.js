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
        tabs: (win.tabs || []).map((tab) => ({
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          pinned: !!tab.pinned,
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
    };
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  return {
    getHostname,
    isWhitelisted,
    parseDomainList,
    shouldDiscardTab,
    buildSnapshotFromWindows,
    snapshotSignature,
    isDuplicateSnapshot,
    pruneSnapshots,
    countTabsInSnapshot,
    sanitizeSettings,
    clampNumber,
  };
});
