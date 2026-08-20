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

  test('does not discard known media hosts like YouTube even when idle and silent', () => {
    const lastActiveAt = now - idleMs - 1;
    expect(Core.shouldDiscardTab({ url: 'https://www.youtube.com/watch?v=abc' }, { now, lastActiveAt, idleMs })).toBe(false);
    expect(Core.shouldDiscardTab({ url: 'https://youtu.be/abc' }, { now, lastActiveAt, idleMs })).toBe(false);
    expect(Core.shouldDiscardTab({ url: 'https://music.youtube.com/watch?v=abc' }, { now, lastActiveAt, idleMs })).toBe(false);
  });

  test('does not discard a tab the content script marked as having media', () => {
    const lastActiveAt = now - idleMs - 1;
    expect(Core.shouldDiscardTab({ url: 'https://news.example.com' }, { now, lastActiveAt, idleMs, hasMedia: true })).toBe(false);
  });
});

describe('media detection helpers', () => {
  test('isKnownMediaUrl matches hosts and subdomains only', () => {
    expect(Core.isKnownMediaUrl('https://www.youtube.com/watch?v=1')).toBe(true);
    expect(Core.isKnownMediaUrl('https://notyoutube.com')).toBe(false);
    expect(Core.isKnownMediaUrl('not-a-url')).toBe(false);
  });

  test('mediaElementIsInUse treats playing and paused-with-progress as in use', () => {
    expect(Core.mediaElementIsInUse({ paused: false, ended: false, currentTime: 0 })).toBe(true);
    expect(Core.mediaElementIsInUse({ paused: true, ended: false, currentTime: 42 })).toBe(true);
    expect(Core.mediaElementIsInUse({ paused: true, ended: false, currentTime: 0 })).toBe(false);
    expect(Core.mediaElementIsInUse({ paused: true, ended: true, currentTime: 99 })).toBe(false);
  });

  test('pageHasInUseMedia sees embed iframes for known media hosts', () => {
    expect(Core.pageHasInUseMedia([], ['https://www.youtube.com/embed/abc'])).toBe(true);
    expect(Core.pageHasInUseMedia([], ['https://example.com/player'])).toBe(false);
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

  test('countTabsInSnapshot returns 0 for null, undefined, or malformed input (#10)', () => {
    expect(Core.countTabsInSnapshot(null)).toBe(0);
    expect(Core.countTabsInSnapshot(undefined)).toBe(0);
    expect(Core.countTabsInSnapshot({})).toBe(0);
    expect(Core.countTabsInSnapshot({ windows: null })).toBe(0);
    expect(Core.countTabsInSnapshot({ windows: [{}, { tabs: [1] }] })).toBe(1);
  });
});

describe('sanitizeSettings', () => {
  const defaults = {
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

  test('maxBackupMB: 0 is preserved as "no extra size cap"', () => {
    expect(Core.sanitizeSettings({ maxBackupMB: 0 }, defaults).maxBackupMB).toBe(0);
  });

  test('maxBackupMB: clamps out-of-range values and falls back for garbage input', () => {
    expect(Core.sanitizeSettings({ maxBackupMB: 9999 }, defaults).maxBackupMB).toBe(500);
    expect(Core.sanitizeSettings({ maxBackupMB: -5 }, defaults).maxBackupMB).toBe(1);
    expect(Core.sanitizeSettings({ maxBackupMB: 'nope' }, defaults).maxBackupMB).toBe(defaults.maxBackupMB);
  });

  test('coerces markDiscardedInTitle to boolean, defaulting from defaults', () => {
    expect(Core.sanitizeSettings({}, defaults).markDiscardedInTitle).toBe(true);
    expect(Core.sanitizeSettings({ markDiscardedInTitle: false }, defaults).markDiscardedInTitle).toBe(false);
  });

  test('discardedTitlePrefix: keeps a valid custom prefix, truncated to 20 chars', () => {
    expect(Core.sanitizeSettings({ discardedTitlePrefix: 'zzz ' }, defaults).discardedTitlePrefix).toBe('zzz ');
    const long = 'x'.repeat(50);
    expect(Core.sanitizeSettings({ discardedTitlePrefix: long }, defaults).discardedTitlePrefix).toHaveLength(20);
  });

  test('discardedTitlePrefix: falls back to default for empty or non-string input', () => {
    expect(Core.sanitizeSettings({ discardedTitlePrefix: '' }, defaults).discardedTitlePrefix).toBe(defaults.discardedTitlePrefix);
    expect(Core.sanitizeSettings({ discardedTitlePrefix: 42 }, defaults).discardedTitlePrefix).toBe(defaults.discardedTitlePrefix);
  });
});

describe('discarded-tab title prefix (roadmap #10)', () => {
  test('withDiscardedTitlePrefix prepends the default prefix', () => {
    expect(Core.withDiscardedTitlePrefix('My Page')).toBe('💤 My Page');
  });

  test('withDiscardedTitlePrefix supports a custom prefix', () => {
    expect(Core.withDiscardedTitlePrefix('My Page', '[sleep] ')).toBe('[sleep] My Page');
  });

  test('withDiscardedTitlePrefix is idempotent - does not double up', () => {
    const once = Core.withDiscardedTitlePrefix('My Page');
    expect(Core.withDiscardedTitlePrefix(once)).toBe(once);
  });

  test('withDiscardedTitlePrefix handles an empty/missing title', () => {
    expect(Core.withDiscardedTitlePrefix('')).toBe('💤 ');
    expect(Core.withDiscardedTitlePrefix(undefined)).toBe('💤 ');
  });

  test('stripDiscardedTitlePrefix removes a known prefix', () => {
    expect(Core.stripDiscardedTitlePrefix('💤 My Page')).toBe('My Page');
  });

  test('stripDiscardedTitlePrefix is a no-op when the prefix is absent', () => {
    expect(Core.stripDiscardedTitlePrefix('My Page')).toBe('My Page');
  });

  test('stripDiscardedTitlePrefix supports a custom prefix', () => {
    expect(Core.stripDiscardedTitlePrefix('[sleep] My Page', '[sleep] ')).toBe('My Page');
  });

  test('with + strip round-trip back to the original title', () => {
    const original = 'Some Page Title';
    expect(Core.stripDiscardedTitlePrefix(Core.withDiscardedTitlePrefix(original))).toBe(original);
  });
});

describe('pluralizeRu', () => {
  const forms = ['вкладка', 'вкладки', 'вкладок'];

  test('uses the "one" form for 1, 21, 31...', () => {
    expect(Core.pluralizeRu(1, forms)).toBe('вкладка');
    expect(Core.pluralizeRu(21, forms)).toBe('вкладка');
    expect(Core.pluralizeRu(101, forms)).toBe('вкладка');
  });

  test('uses the "few" form for 2-4, 22-24...', () => {
    expect(Core.pluralizeRu(2, forms)).toBe('вкладки');
    expect(Core.pluralizeRu(3, forms)).toBe('вкладки');
    expect(Core.pluralizeRu(4, forms)).toBe('вкладки');
    expect(Core.pluralizeRu(22, forms)).toBe('вкладки');
  });

  test('uses the "many" form for 0, 5-20, 25...', () => {
    expect(Core.pluralizeRu(0, forms)).toBe('вкладок');
    expect(Core.pluralizeRu(5, forms)).toBe('вкладок');
    expect(Core.pluralizeRu(11, forms)).toBe('вкладок');
    expect(Core.pluralizeRu(12, forms)).toBe('вкладок');
    expect(Core.pluralizeRu(14, forms)).toBe('вкладок');
    expect(Core.pluralizeRu(20, forms)).toBe('вкладок');
    expect(Core.pluralizeRu(25, forms)).toBe('вкладок');
  });

  test('11-14 always take the "many" form even though they end in 1-4', () => {
    expect(Core.pluralizeRu(111, forms)).toBe('вкладок');
    expect(Core.pluralizeRu(112, forms)).toBe('вкладок');
  });

  test('handles non-numeric input as 0', () => {
    expect(Core.pluralizeRu('nope', forms)).toBe('вкладок');
    expect(Core.pluralizeRu(undefined, forms)).toBe('вкладок');
  });
});

describe('trimToLast', () => {
  test('keeps only the last N items', () => {
    expect(Core.trimToLast([1, 2, 3, 4, 5], 2)).toEqual([4, 5]);
  });

  test('is a no-op when already under the limit', () => {
    expect(Core.trimToLast([1, 2], 10)).toEqual([1, 2]);
  });

  test('returns an empty array for non-array input', () => {
    expect(Core.trimToLast(null, 5)).toEqual([]);
  });
});

describe('backup size estimation and byte-based pruning', () => {
  const small = { timestamp: 1, windows: [{ tabs: [{ url: 'https://a.com' }] }] };
  const bigTabs = Array.from({ length: 50 }, (_, i) => ({ url: `https://example.com/page-${i}`, title: 'x'.repeat(200) }));
  const big = { timestamp: 2, windows: [{ tabs: bigTabs }] };

  test('estimateSnapshotBytes returns a positive number that grows with content', () => {
    expect(Core.estimateSnapshotBytes(small)).toBeGreaterThan(0);
    expect(Core.estimateSnapshotBytes(big)).toBeGreaterThan(Core.estimateSnapshotBytes(small));
  });

  test('totalSnapshotsBytes sums estimates across snapshots', () => {
    const total = Core.totalSnapshotsBytes([small, big]);
    expect(total).toBe(Core.estimateSnapshotBytes(small) + Core.estimateSnapshotBytes(big));
  });

  test('pruneSnapshotsBySize drops oldest snapshots until under budget', () => {
    const snapshots = [small, big];
    const budget = Core.estimateSnapshotBytes(big); // only room for the newest one
    const pruned = Core.pruneSnapshotsBySize(snapshots, budget);
    expect(pruned).toEqual([big]);
  });

  test('pruneSnapshotsBySize always keeps at least the most recent snapshot', () => {
    const pruned = Core.pruneSnapshotsBySize([small, big], 1); // impossibly tiny budget
    expect(pruned).toEqual([big]);
  });

  test('pruneSnapshotsBySize is a no-op when maxBytes is falsy', () => {
    expect(Core.pruneSnapshotsBySize([small, big], 0)).toEqual([small, big]);
    expect(Core.pruneSnapshotsBySize([small, big], null)).toEqual([small, big]);
  });
});

describe('enforceRetentionLimits', () => {
  const snapshots = [1, 2, 3, 4, 5].map((n) => ({ timestamp: n, windows: [{ tabs: [{ url: `https://a.com/${n}` }] }] }));

  test('applies only the count limit when no byte budget is given', () => {
    const result = Core.enforceRetentionLimits(snapshots, { maxSnapshots: 3 });
    expect(result.snapshots.map((s) => s.timestamp)).toEqual([3, 4, 5]);
    expect(result.droppedByCount).toBe(2);
    expect(result.droppedBySize).toBe(0);
  });

  test('applies the byte budget on top of the count limit', () => {
    const perSnapshotBytes = Core.estimateSnapshotBytes(snapshots[0]);
    const result = Core.enforceRetentionLimits(snapshots, { maxSnapshots: 5, maxBytes: perSnapshotBytes * 2 });
    expect(result.snapshots).toHaveLength(2);
    expect(result.droppedByCount).toBe(0);
    expect(result.droppedBySize).toBe(3);
  });

  test('is a no-op when nothing exceeds either limit', () => {
    const result = Core.enforceRetentionLimits(snapshots, { maxSnapshots: 100 });
    expect(result.snapshots).toHaveLength(5);
    expect(result.droppedByCount).toBe(0);
    expect(result.droppedBySize).toBe(0);
  });
});

describe('retention presets', () => {
  test('applyRetentionPreset returns a copy of a known preset', () => {
    const preset = Core.applyRetentionPreset('balanced');
    expect(preset).toEqual(Core.RETENTION_PRESETS.balanced);
    preset.maxSnapshots = 999;
    expect(Core.RETENTION_PRESETS.balanced.maxSnapshots).not.toBe(999);
  });

  test('applyRetentionPreset returns null for an unknown name', () => {
    expect(Core.applyRetentionPreset('does-not-exist')).toBeNull();
  });

  test('every preset produces settings that survive sanitizeSettings unchanged', () => {
    const defaults = {
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
    for (const name of Object.keys(Core.RETENTION_PRESETS)) {
      const preset = Core.applyRetentionPreset(name);
      const sanitized = Core.sanitizeSettings(preset, defaults);
      expect(sanitized.idleMinutes).toBe(preset.idleMinutes);
      expect(sanitized.backupIntervalMinutes).toBe(preset.backupIntervalMinutes);
      expect(sanitized.maxSnapshots).toBe(preset.maxSnapshots);
      expect(sanitized.maxBackupMB).toBe(preset.maxBackupMB);
    }
  });
});

describe('buildPruneLogEntry', () => {
  test('fills in a timestamp when none is given', () => {
    const entry = Core.buildPruneLogEntry({ reason: 'max-snapshots-limit', droppedCount: 3 });
    expect(entry.reason).toBe('max-snapshots-limit');
    expect(entry.droppedCount).toBe(3);
    expect(typeof entry.timestamp).toBe('number');
  });

  test('defaults droppedCount to 0 when not a finite number', () => {
    const entry = Core.buildPruneLogEntry({ timestamp: 5, reason: 'skipped-empty-snapshot' });
    expect(entry).toEqual({ timestamp: 5, reason: 'skipped-empty-snapshot', droppedCount: 0 });
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

  test('carries collapsed through to the restore plan (#9)', () => {
    const plan = Core.buildGroupPlan(
      [{ url: 'https://a.com', groupId: 5 }],
      [{ id: 5, title: 'Work', color: 'blue', collapsed: true }]
    );
    expect(plan).toEqual([{ title: 'Work', color: 'blue', collapsed: true, tabIndexes: [0] }]);
  });
});

describe('isRestorableTabUrl', () => {
  test('allows http, https, and about:blank', () => {
    expect(Core.isRestorableTabUrl('http://example.com')).toBe(true);
    expect(Core.isRestorableTabUrl('https://example.org/path')).toBe(true);
    expect(Core.isRestorableTabUrl('HTTPS://Example.ORG')).toBe(true);
    expect(Core.isRestorableTabUrl('about:blank')).toBe(true);
  });

  test('rejects privileged, empty, and non-http schemes', () => {
    expect(Core.isRestorableTabUrl('about:debugging')).toBe(false);
    expect(Core.isRestorableTabUrl('about:config')).toBe(false);
    expect(Core.isRestorableTabUrl('moz-extension://abc/popup.html')).toBe(false);
    expect(Core.isRestorableTabUrl('chrome://settings')).toBe(false);
    expect(Core.isRestorableTabUrl('file:///tmp/page.html')).toBe(false);
    expect(Core.isRestorableTabUrl('data:text/html,hi')).toBe(false);
    expect(Core.isRestorableTabUrl('javascript:alert(1)')).toBe(false);
    expect(Core.isRestorableTabUrl('')).toBe(false);
    expect(Core.isRestorableTabUrl('   ')).toBe(false);
    expect(Core.isRestorableTabUrl(null)).toBe(false);
    expect(Core.isRestorableTabUrl(undefined)).toBe(false);
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

  test('keeps about:blank together with http(s) tabs', () => {
    const plan = Core.planRestoreTargets(windows, false);
    expect(plan[0].tabs.map((t) => t.url)).toEqual(['https://a.com', 'about:blank']);
  });

  test('filters out privileged about: urls and drops windows left with no tabs', () => {
    const onlyAbout = [{ tabs: [{ url: 'about:debugging' }], groups: [] }];
    expect(Core.planRestoreTargets(onlyAbout, false)).toEqual([]);
  });
});

describe('summarizeRestorePlan', () => {
  test('counts restorable vs skipped tabs', () => {
    const windows = [
      {
        tabs: [
          { url: 'https://a.com' },
          { url: 'about:debugging' },
          { url: 'about:blank' },
          { url: 'file:///tmp/x' },
        ],
      },
    ];
    expect(Core.summarizeRestorePlan(windows)).toEqual({ restorable: 2, skipped: 2 });
  });

  test('returns zeros for empty or missing windows', () => {
    expect(Core.summarizeRestorePlan([])).toEqual({ restorable: 0, skipped: 0 });
    expect(Core.summarizeRestorePlan(null)).toEqual({ restorable: 0, skipped: 0 });
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

  test('accepts a {snapshots:[...]} wrapper the same way as sessions (#35)', () => {
    const raw = JSON.stringify({
      snapshots: [{ createdAt: 1, tabs: [{ url: 'https://a.com', title: 'A' }] }],
    });
    const { snapshots, skippedEntries } = Core.parseImportedSnapshots(raw);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].windows[0].tabs[0].url).toBe('https://a.com');
    expect(skippedEntries).toBe(0);
  });

  test('unknown object returns empty so the UI can report failure (#35)', () => {
    expect(Core.parseImportedSnapshots(JSON.stringify({ foo: 1, bar: [] }))).toEqual({
      snapshots: [],
      skippedEntries: 0,
    });
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

  test('preserves native tab groups, groupId, pinned, and collapsed (#6 #9)', () => {
    const native = JSON.stringify([
      {
        timestamp: 100,
        windows: [
          {
            groups: [{ id: 7, title: 'Work', color: 'blue', collapsed: true }],
            tabs: [{ url: 'https://a.com', title: 'A', groupId: 7, pinned: true }],
          },
        ],
      },
    ]);
    const { snapshots, skippedEntries } = Core.parseImportedSnapshots(native);
    expect(skippedEntries).toBe(0);
    expect(snapshots[0].windows[0].groups).toEqual([
      { id: 7, title: 'Work', color: 'blue', collapsed: true },
    ]);
    expect(snapshots[0].windows[0].tabs[0]).toMatchObject({
      url: 'https://a.com',
      title: 'A',
      groupId: 7,
      pinned: true,
    });
  });
});

describe('www vs apex whitelist (current behavior)', () => {
  test('www host matches an apex whitelist entry via the subdomain rule', () => {
    expect(Core.isWhitelisted('https://www.example.com/page', ['example.com'])).toBe(true);
  });

  test('apex host does not match a www-only whitelist entry', () => {
    expect(Core.isWhitelisted('https://example.com/', ['www.example.com'])).toBe(false);
  });
});

describe('countTabsInSnapshot null-safety (#10)', () => {
  test('returns 0 for null, undefined, or a snapshot without windows', () => {
    expect(Core.countTabsInSnapshot(null)).toBe(0);
    expect(Core.countTabsInSnapshot(undefined)).toBe(0);
    expect(Core.countTabsInSnapshot({})).toBe(0);
    expect(Core.countTabsInSnapshot({ windows: [{ tabs: null }] })).toBe(0);
  });
});

describe('parseImportedSnapshots native groups (#6)', () => {
  test('native export format preserves groups and tab groupId', () => {
    const native = JSON.stringify([
      {
        timestamp: 100,
        windows: [
          {
            id: 1,
            groups: [{ id: 7, title: 'Work', color: 'blue', collapsed: true }],
            tabs: [
              { url: 'https://a.com', title: 'A', pinned: false, groupId: 7 },
              { url: 'https://b.com', title: 'B', pinned: true, groupId: -1 },
            ],
          },
        ],
      },
    ]);
    const { snapshots, skippedEntries } = Core.parseImportedSnapshots(native);
    expect(skippedEntries).toBe(0);
    expect(snapshots[0].windows[0].groups).toEqual([
      { id: 7, title: 'Work', color: 'blue', collapsed: true },
    ]);
    expect(snapshots[0].windows[0].tabs[0].groupId).toBe(7);
    expect(snapshots[0].windows[0].tabs[1]).toMatchObject({ groupId: -1, pinned: true });
  });

  test('flat URL lists still import without groups', () => {
    const { snapshots } = Core.parseImportedSnapshots(JSON.stringify(['https://a.com']));
    expect(snapshots[0].windows[0].groups).toEqual([]);
    expect(snapshots[0].windows[0].tabs[0].groupId).toBe(-1);
  });
});

describe('backupIntervalMinutes clamp', () => {
  const defaults = {
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

  test('clamps backupIntervalMinutes to 0.5–60', () => {
    expect(Core.sanitizeSettings({ backupIntervalMinutes: 0.1 }, defaults).backupIntervalMinutes).toBe(0.5);
    expect(Core.sanitizeSettings({ backupIntervalMinutes: 90 }, defaults).backupIntervalMinutes).toBe(60);
    expect(Core.sanitizeSettings({ backupIntervalMinutes: 5 }, defaults).backupIntervalMinutes).toBe(5);
  });
});

describe('shouldShowCrashPrompt extra contract (#11 characterization)', () => {
  test('is false unless cleanExit is strictly false', () => {
    expect(Core.shouldShowCrashPrompt({})).toBe(false);
    expect(Core.shouldShowCrashPrompt({ cleanExit: 0 })).toBe(false);
    expect(Core.shouldShowCrashPrompt({ cleanExit: null })).toBe(false);
  });

  test('does not re-fire after the unclean event was already notified', () => {
    expect(Core.shouldShowCrashPrompt({ cleanExit: false, crashNotified: true })).toBe(false);
    expect(Core.shouldShowCrashPrompt({ cleanExit: false, crashNotified: false })).toBe(true);
  });

  test('skips install, update, and reload launches', () => {
    const unclean = { cleanExit: false };
    expect(Core.shouldShowCrashPrompt(unclean, { launchKind: 'startup' })).toBe(true);
    expect(Core.shouldShowCrashPrompt(unclean, { launchKind: 'update' })).toBe(false);
    expect(Core.shouldShowCrashPrompt(unclean, { launchKind: 'install' })).toBe(false);
    expect(Core.shouldShowCrashPrompt(unclean, { launchKind: 'reload' })).toBe(false);
  });
});
