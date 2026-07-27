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
    expect(snapshot.windows[0].groups).toEqual([]);
    expect(snapshot.windows[0].tabs).toEqual([
      { url: 'https://a.com', title: 'A', favIconUrl: null, pinned: false, groupId: -1 },
      { url: 'https://b.com', title: 'B', favIconUrl: null, pinned: true, groupId: -1 },
    ]);
  });

  test('buildSnapshotFromWindows carries tab groups through', () => {
    const withGroups = [
      {
        id: 1,
        groups: [{ id: 7, title: 'Work', color: 'blue', collapsed: true }],
        tabs: [
          { url: 'https://a.com', title: 'A', groupId: 7 },
          { url: 'https://b.com', title: 'B', groupId: -1 },
        ],
      },
    ];
    const snapshot = Core.buildSnapshotFromWindows(withGroups, 1);
    expect(snapshot.windows[0].groups).toEqual([{ id: 7, title: 'Work', color: 'blue', collapsed: true }]);
    expect(snapshot.windows[0].tabs[0].groupId).toBe(7);
    expect(snapshot.windows[0].tabs[1].groupId).toBe(-1);
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
    smartTabActivation: true,
    protectUnsavedForms: true,
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

  test('coerces smartTabActivation and protectUnsavedForms to boolean, defaulting from defaults', () => {
    expect(Core.sanitizeSettings({}, defaults).smartTabActivation).toBe(true);
    expect(Core.sanitizeSettings({ smartTabActivation: false }, defaults).smartTabActivation).toBe(false);
    expect(Core.sanitizeSettings({ protectUnsavedForms: 0 }, defaults).protectUnsavedForms).toBe(false);
  });
});

describe('pickReplacementActiveTab', () => {
  test('returns null when the activated tab is not discarded', () => {
    const tabs = [
      { id: 1, index: 0, discarded: false },
      { id: 2, index: 1, discarded: false },
    ];
    expect(Core.pickReplacementActiveTab(tabs, 2)).toBeNull();
  });

  test('picks the nearest non-discarded tab to the right first', () => {
    const tabs = [
      { id: 1, index: 0, discarded: false },
      { id: 2, index: 1, discarded: true },
      { id: 3, index: 2, discarded: false },
    ];
    expect(Core.pickReplacementActiveTab(tabs, 2)).toBe(3);
  });

  test('falls back to the left when the right side is also discarded', () => {
    const tabs = [
      { id: 1, index: 0, discarded: false },
      { id: 2, index: 1, discarded: true },
      { id: 3, index: 2, discarded: true },
    ];
    expect(Core.pickReplacementActiveTab(tabs, 2)).toBe(1);
  });

  test('returns null when every other tab is also discarded', () => {
    const tabs = [
      { id: 1, index: 0, discarded: true },
      { id: 2, index: 1, discarded: true },
    ];
    expect(Core.pickReplacementActiveTab(tabs, 1)).toBeNull();
  });

  test('returns null when the activated tab cannot be found', () => {
    const tabs = [{ id: 1, index: 0, discarded: true }];
    expect(Core.pickReplacementActiveTab(tabs, 999)).toBeNull();
  });
});

describe('buildGroupPlan', () => {
  const groups = [
    { id: 5, title: 'Work', color: 'blue' },
    { id: 6, title: 'Reading', color: 'green' },
  ];
  const tabs = [
    { url: 'https://a.com', groupId: 5 },
    { url: 'https://b.com', groupId: -1 },
    { url: 'https://c.com', groupId: 5 },
    { url: 'https://d.com', groupId: 6 },
  ];

  test('groups tab indexes by their original groupId', () => {
    const plan = Core.buildGroupPlan(tabs, groups);
    expect(plan).toEqual([
      { title: 'Work', color: 'blue', collapsed: false, tabIndexes: [0, 2] },
      { title: 'Reading', color: 'green', collapsed: false, tabIndexes: [3] },
    ]);
  });

  test('returns an empty plan when there are no groups', () => {
    expect(Core.buildGroupPlan(tabs, [])).toEqual([]);
  });

  test('skips groups with no matching tabs', () => {
    const plan = Core.buildGroupPlan([{ url: 'https://a.com', groupId: -1 }], groups);
    expect(plan).toEqual([]);
  });
});

describe('planRestoreTargets', () => {
  const windows = [
    { tabs: [{ url: 'https://a.com' }, { url: 'about:blank' }], groups: [] },
    { tabs: [{ url: 'https://b.com' }], groups: [] },
  ];

  test('all windows restore as new windows by default', () => {
    const plan = Core.planRestoreTargets(windows, false);
    expect(plan.map((p) => p.mode)).toEqual(['new', 'new']);
  });

  test('the first window restores into the current window when requested', () => {
    const plan = Core.planRestoreTargets(windows, true);
    expect(plan.map((p) => p.mode)).toEqual(['current', 'new']);
  });

  test('filters out about: urls and drops windows left with no tabs', () => {
    const onlyAbout = [{ tabs: [{ url: 'about:blank' }], groups: [] }];
    expect(Core.planRestoreTargets(onlyAbout, false)).toEqual([]);
  });
});

describe('shouldShowCrashPrompt', () => {
  test('is false on first ever run (no prior session state)', () => {
    expect(Core.shouldShowCrashPrompt(null)).toBe(false);
    expect(Core.shouldShowCrashPrompt(undefined)).toBe(false);
  });

  test('is false when the previous session exited cleanly', () => {
    expect(Core.shouldShowCrashPrompt({ cleanExit: true })).toBe(false);
  });

  test('is true when the previous session did not exit cleanly', () => {
    expect(Core.shouldShowCrashPrompt({ cleanExit: false })).toBe(true);
  });
});

describe('tabDisplayState', () => {
  test('classifies discarded tabs', () => {
    expect(Core.tabDisplayState({ discarded: true, active: false })).toBe('discarded');
  });

  test('classifies the active tab', () => {
    expect(Core.tabDisplayState({ discarded: false, active: true })).toBe('active');
  });

  test('classifies a normal loaded background tab', () => {
    expect(Core.tabDisplayState({ discarded: false, active: false })).toBe('loaded');
  });

  test('defaults to loaded for missing tab', () => {
    expect(Core.tabDisplayState(null)).toBe('loaded');
  });
});

describe('parseImportedSnapshots', () => {
  test('parses our own native export format unchanged', () => {
    const native = JSON.stringify([
      { timestamp: 100, windows: [{ tabs: [{ url: 'https://a.com', title: 'A' }] }] },
    ]);
    const { snapshots, skippedEntries } = Core.parseImportedSnapshots(native);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].timestamp).toBe(100);
    expect(snapshots[0].windows[0].tabs[0].url).toBe('https://a.com');
    expect(skippedEntries).toBe(0);
  });

  test('accepts a flat array of URL strings', () => {
    const { snapshots } = Core.parseImportedSnapshots(JSON.stringify(['https://a.com', 'https://b.com']));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].windows[0].tabs.map((t) => t.url)).toEqual(['https://a.com', 'https://b.com']);
  });

  test('accepts a flat array of tab-like objects', () => {
    const { snapshots } = Core.parseImportedSnapshots(JSON.stringify([{ url: 'https://a.com', title: 'A' }]));
    expect(snapshots[0].windows[0].tabs[0]).toMatchObject({ url: 'https://a.com', title: 'A' });
  });

  test('accepts a {sessions:[...]} wrapper (Tab Session Manager style)', () => {
    const raw = JSON.stringify({
      sessions: [{ windows: [{ tabs: [{ url: 'https://a.com' }] }] }, { windows: [{ tabs: [{ url: 'https://b.com' }] }] }],
    });
    const { snapshots } = Core.parseImportedSnapshots(raw);
    expect(snapshots).toHaveLength(2);
  });

  test('accepts a bare {tabs:[...]} object', () => {
    const { snapshots } = Core.parseImportedSnapshots(JSON.stringify({ tabs: [{ url: 'https://a.com' }] }));
    expect(snapshots).toHaveLength(1);
  });

  test('falls back to plain-text one-url-per-line parsing when JSON is invalid', () => {
    const text = 'https://a.com\nhttps://b.com\tMy Tab Title\nnot a url';
    const { snapshots, skippedEntries } = Core.parseImportedSnapshots(text);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].windows[0].tabs).toHaveLength(2);
    expect(snapshots[0].windows[0].tabs[1].title).toBe('My Tab Title');
    expect(skippedEntries).toBe(1);
  });

  test('drops invalid entries instead of failing the whole import', () => {
    const raw = JSON.stringify([{ url: 'https://a.com' }, { url: 'not-a-url' }, { title: 'no url at all' }]);
    const { snapshots, skippedEntries } = Core.parseImportedSnapshots(raw);
    expect(snapshots[0].windows[0].tabs).toHaveLength(1);
    expect(skippedEntries).toBe(2);
  });

  test('returns no snapshots for empty/blank input', () => {
    expect(Core.parseImportedSnapshots('')).toEqual({ snapshots: [], skippedEntries: 0 });
    expect(Core.parseImportedSnapshots('   ')).toEqual({ snapshots: [], skippedEntries: 0 });
  });
});
