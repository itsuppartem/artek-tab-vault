'use strict';

const Core = require('../core.js');

describe('isWhitelisted', () => {
  test('matches exact domain', () => {
    expect(Core.isWhitelisted('https://example.com/page', ['example.com'])).toBe(true);
  });

  test('matches subdomain', () => {
    expect(Core.isWhitelisted('https://mail.google.com/inbox', ['google.com'])).toBe(true);
  });

  test('does not match unrelated domain', () => {
    expect(Core.isWhitelisted('https://example.org', ['example.com'])).toBe(false);
  });

  test('returns false for empty whitelist', () => {
    expect(Core.isWhitelisted('https://example.com', [])).toBe(false);
  });

  test('returns false for invalid url', () => {
    expect(Core.isWhitelisted('not-a-url', ['example.com'])).toBe(false);
  });
});

describe('parseDomainList', () => {
  test('splits by newline and comma, trims, lowercases, dedupes', () => {
    const input = 'Example.com\n www.test.dev , example.com\nhttps://foo.com/path';
    expect(Core.parseDomainList(input)).toEqual(['example.com', 'www.test.dev', 'foo.com']);
  });

  test('returns empty array for empty input', () => {
    expect(Core.parseDomainList('')).toEqual([]);
    expect(Core.parseDomainList(null)).toEqual([]);
  });
});

describe('shouldDiscardTab', () => {
  const now = 1_000_000;
  const idleMs = 10 * 60 * 1000;

  test('does not discard the active tab', () => {
    const tab = { active: true, url: 'https://a.com' };
    expect(Core.shouldDiscardTab(tab, { now, lastActiveAt: 0, idleMs })).toBe(false);
  });

  test('does not discard pinned tabs', () => {
    const tab = { pinned: true, url: 'https://a.com' };
    expect(Core.shouldDiscardTab(tab, { now, lastActiveAt: 0, idleMs })).toBe(false);
  });

  test('does not discard tabs playing audio', () => {
    const tab = { audible: true, url: 'https://a.com' };
    expect(Core.shouldDiscardTab(tab, { now, lastActiveAt: 0, idleMs })).toBe(false);
  });

  test('does not discard already-discarded tabs', () => {
    const tab = { discarded: true, url: 'https://a.com' };
    expect(Core.shouldDiscardTab(tab, { now, lastActiveAt: 0, idleMs })).toBe(false);
  });

  test('discards a background tab idle long enough', () => {
    const tab = { url: 'https://a.com' };
    const lastActiveAt = now - idleMs - 1;
    expect(Core.shouldDiscardTab(tab, { now, lastActiveAt, idleMs })).toBe(true);
  });

  test('does not discard a background tab that is not idle enough yet', () => {
    const tab = { url: 'https://a.com' };
    const lastActiveAt = now - idleMs + 1000;
    expect(Core.shouldDiscardTab(tab, { now, lastActiveAt, idleMs })).toBe(false);
  });

  test('whitelisted domain overrides idle time', () => {
    const tab = { url: 'https://mail.google.com' };
    const lastActiveAt = now - idleMs - 1;
    expect(
      Core.shouldDiscardTab(tab, { now, lastActiveAt, idleMs, whitelist: ['google.com'] })
    ).toBe(false);
  });
});

describe('snapshot helpers', () => {
  const windows = [
    {
      id: 1,
      tabs: [
        { url: 'https://a.com', title: 'A', favIconUrl: null, pinned: false },
        { url: 'https://b.com', title: 'B', favIconUrl: null, pinned: true },
      ],
    },
  ];

  test('buildSnapshotFromWindows maps to a plain snapshot shape', () => {
    const snapshot = Core.buildSnapshotFromWindows(windows, 42);
    expect(snapshot.timestamp).toBe(42);
    expect(snapshot.windows).toHaveLength(1);
    expect(snapshot.windows[0].tabs).toEqual([
      { url: 'https://a.com', title: 'A', favIconUrl: null, pinned: false },
      { url: 'https://b.com', title: 'B', favIconUrl: null, pinned: true },
    ]);
  });

  test('isDuplicateSnapshot detects identical url sets', () => {
    const a = Core.buildSnapshotFromWindows(windows, 1);
    const b = Core.buildSnapshotFromWindows(windows, 2);
    expect(Core.isDuplicateSnapshot(a, b)).toBe(true);
  });

  test('isDuplicateSnapshot detects changed url sets', () => {
    const a = Core.buildSnapshotFromWindows(windows, 1);
    const changed = [{ id: 1, tabs: [{ url: 'https://c.com', title: 'C' }] }];
    const b = Core.buildSnapshotFromWindows(changed, 2);
    expect(Core.isDuplicateSnapshot(a, b)).toBe(false);
  });

  test('isDuplicateSnapshot is false when there is no previous snapshot', () => {
    const b = Core.buildSnapshotFromWindows(windows, 1);
    expect(Core.isDuplicateSnapshot(null, b)).toBe(false);
  });

  test('isSnapshotEmpty is true for a snapshot with zero tabs', () => {
    const empty = Core.buildSnapshotFromWindows([], 1);
    expect(Core.isSnapshotEmpty(empty)).toBe(true);
  });

  test('isSnapshotEmpty is true for windows with no tabs', () => {
    const empty = Core.buildSnapshotFromWindows([{ id: 1, tabs: [] }], 1);
    expect(Core.isSnapshotEmpty(empty)).toBe(true);
  });

  test('isSnapshotEmpty is false when at least one tab exists', () => {
    const notEmpty = Core.buildSnapshotFromWindows(windows, 1);
    expect(Core.isSnapshotEmpty(notEmpty)).toBe(false);
  });

  test('isSnapshotEmpty is true for null/undefined', () => {
    expect(Core.isSnapshotEmpty(null)).toBe(true);
    expect(Core.isSnapshotEmpty(undefined)).toBe(true);
  });

  describe('shouldPersistSnapshot', () => {
    test('rejects an empty snapshot even with no history yet', () => {
      const empty = Core.buildSnapshotFromWindows([], 1);
      expect(Core.shouldPersistSnapshot(null, empty)).toBe(false);
    });

    test('rejects an empty snapshot even if previous had tabs (crash/quit guard)', () => {
      const prev = Core.buildSnapshotFromWindows(windows, 1);
      const empty = Core.buildSnapshotFromWindows([], 2);
      expect(Core.shouldPersistSnapshot(prev, empty)).toBe(false);
    });

    test('rejects a duplicate of the previous snapshot', () => {
      const prev = Core.buildSnapshotFromWindows(windows, 1);
      const same = Core.buildSnapshotFromWindows(windows, 2);
      expect(Core.shouldPersistSnapshot(prev, same)).toBe(false);
    });

    test('accepts a healthy, changed snapshot', () => {
      const prev = Core.buildSnapshotFromWindows(windows, 1);
      const changed = Core.buildSnapshotFromWindows(
        [{ id: 1, tabs: [{ url: 'https://c.com', title: 'C' }] }],
        2
      );
      expect(Core.shouldPersistSnapshot(prev, changed)).toBe(true);
    });

    test('accepts the very first snapshot when there is no history', () => {
      const first = Core.buildSnapshotFromWindows(windows, 1);
      expect(Core.shouldPersistSnapshot(null, first)).toBe(true);
    });
  });

  test('pruneSnapshots keeps only the most recent N entries', () => {
    const snapshots = [1, 2, 3, 4, 5].map((n) => ({ timestamp: n, windows: [] }));
    const pruned = Core.pruneSnapshots(snapshots, 2);
    expect(pruned.map((s) => s.timestamp)).toEqual([4, 5]);
  });

  test('pruneSnapshots is a no-op when under the limit', () => {
    const snapshots = [1, 2].map((n) => ({ timestamp: n, windows: [] }));
    expect(Core.pruneSnapshots(snapshots, 10)).toHaveLength(2);
  });

  test('countTabsInSnapshot sums tabs across windows', () => {
    const snapshot = {
      windows: [{ tabs: [1, 2] }, { tabs: [3] }],
    };
    expect(Core.countTabsInSnapshot(snapshot)).toBe(3);
  });
});

describe('sanitizeSettings', () => {
  const defaults = {
    guardianEnabled: true,
    idleMinutes: 15,
    backupIntervalMinutes: 1,
    maxSnapshots: 20,
    neverDiscardDomains: [],
  };

  test('fills in missing fields with defaults', () => {
    expect(Core.sanitizeSettings({}, defaults)).toEqual(defaults);
  });

  test('clamps out-of-range numbers', () => {
    const result = Core.sanitizeSettings({ idleMinutes: -5, maxSnapshots: 9999 }, defaults);
    expect(result.idleMinutes).toBe(1);
    expect(result.maxSnapshots).toBe(200);
  });

  test('falls back to default for non-numeric input', () => {
    const result = Core.sanitizeSettings({ idleMinutes: 'not-a-number' }, defaults);
    expect(result.idleMinutes).toBe(defaults.idleMinutes);
  });

  test('coerces guardianEnabled to boolean', () => {
    expect(Core.sanitizeSettings({ guardianEnabled: 0 }, defaults).guardianEnabled).toBe(false);
    expect(Core.sanitizeSettings({ guardianEnabled: 1 }, defaults).guardianEnabled).toBe(true);
  });

  test('ignores non-array neverDiscardDomains', () => {
    const result = Core.sanitizeSettings({ neverDiscardDomains: 'nope' }, defaults);
    expect(result.neverDiscardDomains).toEqual([]);
  });
});
