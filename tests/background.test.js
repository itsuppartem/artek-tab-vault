'use strict';

const { readyBackground, flushPromises, loadEnI18n } = require('./helpers/mock-browser');

const SNAPSHOTS_KEY = 'tabvault_snapshots';
const SETTINGS_KEY = 'tabvault_settings';
const SESSION_STATE_KEY = 'tabvault_session_state';

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

function tab(partial) {
  return {
    url: 'https://example.com',
    title: 'Example',
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    ...partial,
  };
}

async function boot(options = {}) {
  return readyBackground({
    i18n: loadEnI18n(),
    ...options,
  });
}

describe('background GET_STATE', () => {
  test('returns settings, tab counts, reversed snapshots, and display titles', async () => {
    const { mock } = await boot({
      windows: [
        {
          id: 1,
          focused: true,
          tabs: [
            tab({ id: 10, index: 1, title: 'Second', url: 'https://b.com' }),
            tab({ id: 11, index: 0, title: '💤 First', url: 'https://a.com', discarded: true, active: true }),
          ],
        },
      ],
      storage: {
        [SNAPSHOTS_KEY]: [
          { timestamp: 1, windows: [{ tabs: [{ url: 'https://old.com' }] }] },
          { timestamp: 2, windows: [{ tabs: [{ url: 'https://new.com' }] }] },
        ],
      },
    });

    const state = await mock.browser.runtime.sendMessage({ type: 'GET_STATE' });
    expect(state.totalTabs).toBe(2);
    expect(state.discardedCount).toBe(1);
    expect(state.settings.guardianEnabled).toBe(true);
    const stamps = state.snapshots.map((s) => s.timestamp);
    expect(stamps.indexOf(2)).toBeGreaterThanOrEqual(0);
    expect(stamps.indexOf(1)).toBeGreaterThan(stamps.indexOf(2));
    expect(state.tabsList).toHaveLength(2);
    expect(state.tabsList[0]).toMatchObject({ id: 11, title: 'First', state: 'discarded' });
    expect(state.tabsList[1]).toMatchObject({ id: 10, title: 'Second', state: 'loaded' });
  });
});

describe('background takeSnapshot', () => {
  test('persists a first non-empty snapshot during init', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1, url: 'https://a.com', title: 'A' })] }],
    });
    const snaps = mock.storageData[SNAPSHOTS_KEY] || [];
    expect(snaps).toHaveLength(1);
    expect(snaps[0].windows[0].tabs[0].url).toBe('https://a.com');
  });

  test('skips an empty snapshot and logs the skip', async () => {
    const { mock } = await boot({ windows: [] });
    expect(mock.storageData[SNAPSHOTS_KEY] || []).toHaveLength(0);
    const log = mock.storageData.tabvault_prune_log || [];
    expect(log.some((e) => e.reason === 'skipped-empty-snapshot')).toBe(true);
  });

  test('skips a duplicate snapshot on BACKUP_NOW', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1, url: 'https://a.com', title: 'A' })] }],
    });
    expect(mock.storageData[SNAPSHOTS_KEY]).toHaveLength(1);
    const result = await mock.browser.runtime.sendMessage({ type: 'BACKUP_NOW' });
    expect(result).toEqual({ saved: false });
    expect(mock.storageData[SNAPSHOTS_KEY]).toHaveLength(1);
  });

  test('successful first backup returns saved:true', async () => {
    const { mock } = await boot({ windows: [] });
    expect(mock.storageData[SNAPSHOTS_KEY] || []).toHaveLength(0);
    mock.addWindow({ id: 1, tabs: [tab({ id: 1, url: 'https://a.com', title: 'A' })] });
    const result = await mock.browser.runtime.sendMessage({ type: 'BACKUP_NOW' });
    expect(result).toEqual({ saved: true });
    expect(mock.storageData[SNAPSHOTS_KEY]).toHaveLength(1);
  });

  test('persists when tabs change', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1, url: 'https://a.com', title: 'A' })] }],
    });
    mock.addTab({ id: 2, windowId: 1, url: 'https://b.com', title: 'B' });
    const result = await mock.browser.runtime.sendMessage({ type: 'BACKUP_NOW' });
    expect(result).toEqual({ saved: true });
    expect(mock.storageData[SNAPSHOTS_KEY]).toHaveLength(2);
    expect(mock.storageData[SNAPSHOTS_KEY][1].windows[0].tabs).toHaveLength(2);
  });
});

describe('background runGuardian', () => {
  test('does nothing when guardian is disabled', async () => {
    const now = 1_000_000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { mock } = await boot({
      storage: { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, guardianEnabled: false } },
      windows: [{ id: 1, tabs: [tab({ id: 5, url: 'https://idle.com' })] }],
    });
    spy.mockReturnValue(now + 20 * 60 * 1000);
    mock.emitAlarm('tabvault-guardian');
    await flushPromises(20);
    expect(mock.calls.tabsDiscard).toEqual([]);
    spy.mockRestore();
  });

  test('discards an idle background tab', async () => {
    const now = 1_000_000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { mock } = await boot({
      windows: [
        {
          id: 1,
          tabs: [
            tab({ id: 1, active: true, url: 'https://active.com' }),
            tab({ id: 2, url: 'https://idle.com', title: 'Idle' }),
          ],
        },
      ],
    });
    spy.mockReturnValue(now + 16 * 60 * 1000);
    mock.emitAlarm('tabvault-guardian');
    await flushPromises(30);
    expect(mock.calls.tabsDiscard).toContain(2);
    expect(mock.calls.tabsDiscard).not.toContain(1);
    expect(mock.calls.executeScript.some((c) => c.tabId === 2)).toBe(true);
    spy.mockRestore();
  });

  test('skips whitelist, pinned, audible, and active tabs', async () => {
    const now = 1_000_000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { mock } = await boot({
      storage: { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, neverDiscardDomains: ['mail.example.com'] } },
      windows: [
        {
          id: 1,
          tabs: [
            tab({ id: 1, active: true, url: 'https://active.com' }),
            tab({ id: 2, pinned: true, url: 'https://pin.com' }),
            tab({ id: 3, audible: true, url: 'https://music.com' }),
            tab({ id: 4, url: 'https://mail.example.com/inbox' }),
            tab({ id: 5, url: 'https://idle.com' }),
          ],
        },
      ],
    });
    spy.mockReturnValue(now + 16 * 60 * 1000);
    mock.emitAlarm('tabvault-guardian');
    await flushPromises(40);
    expect(mock.calls.tabsDiscard).toEqual([5]);
    spy.mockRestore();
  });

  test('skips a tab with a dirty form when protection is on', async () => {
    const now = 1_000_000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { mock } = await boot({
      tabMessageHandlers: { 2: { dirty: true } },
      windows: [{ id: 1, tabs: [tab({ id: 2, url: 'https://form.com' })] }],
    });
    spy.mockReturnValue(now + 16 * 60 * 1000);
    mock.emitAlarm('tabvault-guardian');
    await flushPromises(30);
    expect(mock.calls.tabsDiscard).toEqual([]);
    spy.mockRestore();
  });

  test('fail-open: sendMessage throw does not block discard (current #12 contract)', async () => {
    const now = 1_000_000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { mock } = await boot({
      defaultTabMessage: 'throw',
      windows: [{ id: 1, tabs: [tab({ id: 2, url: 'https://idle.com' })] }],
    });
    spy.mockReturnValue(now + 16 * 60 * 1000);
    mock.emitAlarm('tabvault-guardian');
    await flushPromises(30);
    expect(mock.calls.tabsDiscard).toEqual([2]);
    spy.mockRestore();
  });
});

describe('background discardAllExceptCurrent', () => {
  test('discards other tabs in the current window, honoring guards', async () => {
    const { mock } = await boot({
      storage: { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, neverDiscardDomains: ['keep.com'] } },
      tabMessageHandlers: { 5: { dirty: true } },
      windows: [
        {
          id: 1,
          focused: true,
          tabs: [
            tab({ id: 1, active: true, url: 'https://now.com' }),
            tab({ id: 2, url: 'https://gone.com' }),
            tab({ id: 3, pinned: true, url: 'https://pin.com' }),
            tab({ id: 4, url: 'https://keep.com/x' }),
            tab({ id: 5, url: 'https://form.com' }),
            tab({ id: 6, discarded: true, url: 'https://already.com' }),
          ],
        },
      ],
    });
    const result = await mock.browser.runtime.sendMessage({ type: 'DISCARD_ALL_EXCEPT_CURRENT' });
    expect(result.discardedCount).toBe(1);
    expect(mock.calls.tabsDiscard).toEqual([2]);
  });
});

describe('background restoreSnapshot', () => {
  const groupedSnapshot = {
    timestamp: 99,
    windows: [
      {
        id: 7,
        groups: [{ id: 5, title: 'Work', color: 'blue', collapsed: true }],
        tabs: [
          { url: 'https://a.com', title: 'A', pinned: true, groupId: 5 },
          { url: 'https://b.com', title: 'B', pinned: false, groupId: 5 },
        ],
      },
    ],
  };

  test('returns false when the timestamp is missing', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: { [SNAPSHOTS_KEY]: [groupedSnapshot] },
    });
    const result = await mock.browser.runtime.sendMessage({ type: 'RESTORE_SNAPSHOT', timestamp: 123456 });
    expect(result).toEqual({ ok: false, restored: 0, skipped: 0 });
    expect(mock.calls.windowsCreate).toEqual([]);
    expect(mock.calls.tabsCreate).toEqual([]);
  });

  test('restores into a new window and applies pins after create (#8)', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: { [SNAPSHOTS_KEY]: [groupedSnapshot] },
    });
    const result = await mock.browser.runtime.sendMessage({
      type: 'RESTORE_SNAPSHOT',
      timestamp: 99,
      intoCurrentWindow: false,
    });
    expect(result).toEqual({ ok: true, restored: 2, skipped: 0 });
    expect(mock.calls.windowsCreate).toHaveLength(1);
    expect(mock.calls.windowsCreate[0].url).toEqual(['https://a.com']);
    expect(mock.calls.tabsCreate).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: 'https://b.com', pinned: false })])
    );
    expect(mock.calls.tabsUpdate.some((c) => c.props.pinned === true)).toBe(true);
  });

  test('restores into the current window with pinned flags on create', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, focused: true, tabs: [tab({ id: 1 })] }],
      storage: { [SNAPSHOTS_KEY]: [groupedSnapshot] },
    });
    const result = await mock.browser.runtime.sendMessage({
      type: 'RESTORE_SNAPSHOT',
      timestamp: 99,
      intoCurrentWindow: true,
    });
    expect(result).toEqual({ ok: true, restored: 2, skipped: 0 });
    expect(mock.calls.windowsCreate).toEqual([]);
    expect(mock.calls.tabsCreate[0]).toMatchObject({ url: 'https://a.com', pinned: true, windowId: 1 });
    expect(mock.calls.tabsCreate[1]).toMatchObject({ url: 'https://b.com', pinned: false, windowId: 1 });
  });

  test('recreates groups and passes collapsed through (#9)', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: { [SNAPSHOTS_KEY]: [groupedSnapshot] },
    });
    await mock.browser.runtime.sendMessage({ type: 'RESTORE_SNAPSHOT', timestamp: 99 });
    expect(mock.calls.tabsGroup).toHaveLength(1);
    expect(mock.calls.tabGroupsUpdate).toEqual(
      expect.arrayContaining([expect.objectContaining({ props: expect.objectContaining({ title: 'Work', color: 'blue', collapsed: true }) })])
    );
  });

  const mixedSnapshot = {
    timestamp: 42,
    windows: [
      {
        tabs: [
          { url: 'about:debugging', title: 'Debugging' },
          { url: 'https://example.com', title: 'Example' },
          { url: 'https://example.org', title: 'Org' },
        ],
      },
    ],
  };

  test('new-window restore with about:debugging plus https still opens the https tabs', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: { [SNAPSHOTS_KEY]: [mixedSnapshot] },
    });
    const result = await mock.browser.runtime.sendMessage({
      type: 'RESTORE_SNAPSHOT',
      timestamp: 42,
      intoCurrentWindow: false,
    });
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(2);
    expect(result.skipped).toBeGreaterThan(0);
    expect(mock.calls.windowsCreate).toHaveLength(1);
    expect(mock.calls.windowsCreate[0].url).toEqual(['https://example.com']);
    expect(mock.calls.windowsCreate[0].url).not.toContain('about:debugging');
    expect(mock.calls.tabsCreate.map((c) => c.url)).toEqual(['https://example.org']);
    const opened = [...mock.calls.windowsCreate[0].url, ...mock.calls.tabsCreate.map((c) => c.url)];
    expect(opened).toEqual(['https://example.com', 'https://example.org']);
  });

  test('windows.create throwing on a url array still restores remaining tabs via fallback', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: { [SNAPSHOTS_KEY]: [groupedSnapshot] },
      windowsCreate: ({ url }) => {
        if (Array.isArray(url)) throw new Error('url array rejected');
      },
    });
    const result = await mock.browser.runtime.sendMessage({
      type: 'RESTORE_SNAPSHOT',
      timestamp: 99,
      intoCurrentWindow: false,
    });
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(2);
    expect(mock.calls.windowsCreate.some((c) => c.url.includes('https://a.com'))).toBe(true);
    expect(mock.calls.tabsCreate).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: 'https://b.com' })])
    );
  });

  test('all-privileged snapshot does not call windows.create', async () => {
    const privileged = {
      timestamp: 7,
      windows: [{ tabs: [{ url: 'about:debugging' }, { url: 'about:config' }] }],
    };
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: { [SNAPSHOTS_KEY]: [privileged] },
    });
    const result = await mock.browser.runtime.sendMessage({
      type: 'RESTORE_SNAPSHOT',
      timestamp: 7,
      intoCurrentWindow: false,
    });
    expect(result).toEqual({ ok: false, restored: 0, skipped: 2 });
    expect(mock.calls.windowsCreate).toEqual([]);
  });


  test('current-window restore skips about:debugging and still creates https', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, focused: true, tabs: [tab({ id: 1 })] }],
      storage: { [SNAPSHOTS_KEY]: [mixedSnapshot] },
    });
    const result = await mock.browser.runtime.sendMessage({
      type: 'RESTORE_SNAPSHOT',
      timestamp: 42,
      intoCurrentWindow: true,
    });
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(2);
    expect(result.skipped).toBeGreaterThan(0);
    expect(mock.calls.windowsCreate).toEqual([]);
    expect(mock.calls.tabsCreate.map((c) => c.url)).toEqual(['https://example.com', 'https://example.org']);
    expect(mock.calls.tabsCreate.map((c) => c.url)).not.toContain('about:debugging');
  });
});

describe('background smart tab activation', () => {
  test('moves focus from a discarded neighbor to a loaded tab', async () => {
    const { mock } = await boot({
      windows: [
        {
          id: 1,
          tabs: [
            tab({ id: 1, index: 0, url: 'https://loaded.com', discarded: false, active: false }),
            tab({ id: 2, index: 1, url: 'https://discarded.com', discarded: true, active: true }),
          ],
        },
      ],
    });
    mock.emitTabRemoved(99, { windowId: 1, isWindowClosing: false });
    await flushPromises(20);
    expect(mock.calls.tabsUpdate.some((c) => c.tabId === 1 && c.props.active === true)).toBe(true);
  });

  test('does not run when the window is closing or the setting is off', async () => {
    const { mock } = await boot({
      storage: { [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, smartTabActivation: false } },
      windows: [
        {
          id: 1,
          tabs: [
            tab({ id: 1, index: 0, discarded: false, active: false }),
            tab({ id: 2, index: 1, discarded: true, active: true }),
          ],
        },
      ],
    });
    const before = mock.calls.tabsUpdate.length;
    mock.emitTabRemoved(99, { windowId: 1, isWindowClosing: false });
    await flushPromises(15);
    expect(mock.calls.tabsUpdate.length).toBe(before);
  });
});

describe('background crash prompt contract (#11 characterization)', () => {
  test('notifies when previous cleanExit is strictly false and snapshots exist', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: {
        [SESSION_STATE_KEY]: { cleanExit: false },
        [SNAPSHOTS_KEY]: [{ timestamp: 1, windows: [{ tabs: [{ url: 'https://a.com' }] }] }],
      },
    });
    expect(mock.calls.notificationsCreate.some((c) => c.id === 'tabvault-crash-restore')).toBe(true);
    expect(mock.storageData[SESSION_STATE_KEY].cleanExit).toBe(false);
  });

  test('does not notify after a clean exit or when there is no snapshot', async () => {
    const clean = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: {
        [SESSION_STATE_KEY]: { cleanExit: true },
        [SNAPSHOTS_KEY]: [{ timestamp: 1, windows: [{ tabs: [{ url: 'https://a.com' }] }] }],
      },
    });
    expect(clean.mock.calls.notificationsCreate).toEqual([]);

    const empty = await boot({
      windows: [],
      storage: { [SESSION_STATE_KEY]: { cleanExit: false } },
    });
    expect(empty.mock.calls.notificationsCreate).toEqual([]);
  });

  test('clicking the crash notification opens the options page', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: {
        [SESSION_STATE_KEY]: { cleanExit: false },
        [SNAPSHOTS_KEY]: [{ timestamp: 1, windows: [{ tabs: [{ url: 'https://a.com' }] }] }],
      },
    });
    mock.emitNotificationClicked('tabvault-crash-restore');
    expect(mock.calls.openOptionsPage).toHaveLength(1);
  });

  test('does not notify again when crashNotified is already set', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: {
        [SESSION_STATE_KEY]: { cleanExit: false, crashNotified: true },
        [SNAPSHOTS_KEY]: [{ timestamp: 1, windows: [{ tabs: [{ url: 'https://a.com' }] }] }],
      },
    });
    expect(mock.calls.notificationsCreate).toEqual([]);
    expect(mock.storageData[SESSION_STATE_KEY].crashNotified).toBe(true);
  });

  test('does not notify on addon update even if the previous exit was unclean', async () => {
    const { mock } = await boot({
      launchKind: 'update',
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
      storage: {
        [SESSION_STATE_KEY]: { cleanExit: false },
        [SNAPSHOTS_KEY]: [{ timestamp: 1, windows: [{ tabs: [{ url: 'https://a.com' }] }] }],
      },
    });
    expect(mock.calls.notificationsCreate).toEqual([]);
  });

  test('last window closing marks a clean exit', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
    });
    mock.emitWindowRemoved(1);
    await flushPromises(15);
    expect(mock.storageData[SESSION_STATE_KEY]).toEqual({ cleanExit: true, crashNotified: false });
  });
});

describe('background wiring', () => {
  test('storage.onChanged reschedules alarms from the new settings', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 1 })] }],
    });
    const before = mock.calls.alarmsCreate.length;
    await mock.browser.storage.local.set({
      [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, backupIntervalMinutes: 5 },
    });
    const after = mock.calls.alarmsCreate.slice(before);
    expect(after.some((c) => c.name === 'tabvault-backup' && c.info.periodInMinutes === 5)).toBe(true);
    expect(after.some((c) => c.name === 'tabvault-guardian')).toBe(true);
  });

  test('command discard-all-except-current is wired', async () => {
    const { mock } = await boot({
      windows: [
        {
          id: 1,
          focused: true,
          tabs: [tab({ id: 1, active: true }), tab({ id: 2, url: 'https://other.com' })],
        },
      ],
    });
    mock.emitCommand('discard-all-except-current');
    await flushPromises(20);
    expect(mock.calls.tabsDiscard).toContain(2);
  });

  test('ACTIVATE_TAB updates the requested tab', async () => {
    const { mock } = await boot({
      windows: [{ id: 1, tabs: [tab({ id: 3, url: 'https://x.com' })] }],
    });
    await mock.browser.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: 3 });
    expect(mock.calls.tabsUpdate).toContainEqual({ tabId: 3, props: { active: true } });
  });

  test('unknown message type returns undefined', async () => {
    const { mock } = await boot({ windows: [{ id: 1, tabs: [tab({ id: 1 })] }] });
    const result = await mock.browser.runtime.sendMessage({ type: 'NOT_A_REAL_MESSAGE' });
    expect(result).toBeUndefined();
  });
});
