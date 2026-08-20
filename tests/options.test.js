/**
 * @jest-environment jsdom
 */
'use strict';

if (typeof File !== 'undefined' && typeof File.prototype.text !== 'function') {
  File.prototype.text = function () {
    return new Response(this).text();
  };
}

const { createMockBrowser, loadOptions, flushPromises, loadEnI18n } = require('./helpers/mock-browser');

const SETTINGS_KEY = 'tabvault_settings';
const SNAPSHOTS_KEY = 'tabvault_snapshots';

const SETTINGS = {
  guardianEnabled: true,
  idleMinutes: 15,
  backupIntervalMinutes: 1,
  maxSnapshots: 20,
  maxBackupMB: 15,
  neverDiscardDomains: ['mail.example.com'],
  smartTabActivation: true,
  protectUnsavedForms: true,
  markDiscardedInTitle: true,
  discardedTitlePrefix: '💤 ',
};

async function mount(storage = {}) {
  const mock = createMockBrowser({
    i18n: loadEnI18n(),
    storage: {
      [SETTINGS_KEY]: SETTINGS,
      [SNAPSHOTS_KEY]: [{ timestamp: 10, windows: [{ tabs: [{ url: 'https://kept.com', title: 'Kept' }] }] }],
      tabvault_prune_log: [{ timestamp: 20, reason: 'max-snapshots-limit', droppedCount: 2 }],
      ...storage,
    },
  });
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:mock';
    URL.revokeObjectURL = () => {};
  }
  loadOptions(mock.browser);
  await flushPromises(25);
  return mock;
}

describe('options page', () => {
  test('fillForm loads stored settings and readForm round-trips them', async () => {
    await mount();
    expect(document.getElementById('guardianEnabled').checked).toBe(true);
    expect(document.getElementById('idleMinutes').value).toBe('15');
    expect(document.getElementById('whitelist').value).toContain('mail.example.com');
    expect(document.getElementById('maxSnapshots').value).toBe('20');
    expect(document.getElementById('storageUsage').textContent).toMatch(/1/);
    expect(document.querySelectorAll('#pruneLogList li')).toHaveLength(1);
  });

  test('presets fill the form but do not save until Save', async () => {
    const mock = await mount();
    document.querySelector('[data-preset="archivist"]').click();
    expect(document.getElementById('maxSnapshots').value).toBe('100');
    expect(document.getElementById('idleMinutes').value).toBe('30');
    expect(mock.storageData[SETTINGS_KEY].maxSnapshots).toBe(20);

    document.getElementById('saveBtn').click();
    await flushPromises(15);
    expect(mock.storageData[SETTINGS_KEY].maxSnapshots).toBe(100);
    expect(mock.storageData[SETTINGS_KEY].idleMinutes).toBe(30);
  });

  test('reset writes default settings', async () => {
    const mock = await mount({
      [SETTINGS_KEY]: { ...SETTINGS, idleMinutes: 99, maxSnapshots: 7 },
    });
    document.getElementById('resetBtn').click();
    await flushPromises(15);
    expect(mock.storageData[SETTINGS_KEY].idleMinutes).toBe(15);
    expect(mock.storageData[SETTINGS_KEY].maxSnapshots).toBe(20);
  });

  test('export creates a JSON download of stored snapshots', async () => {
    const created = [];
    URL.createObjectURL = (blob) => {
      created.push(blob);
      return 'blob:export';
    };
    URL.revokeObjectURL = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await mount();
    document.getElementById('exportBtn').click();
    await flushPromises(15);
    expect(created).toHaveLength(1);
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  test('import understands native JSON and preserves groups', async () => {
    const mock = await mount({ [SNAPSHOTS_KEY]: [] });
    const payload = JSON.stringify([
      {
        timestamp: 50,
        windows: [
          {
            groups: [{ id: 7, title: 'Work', color: 'blue', collapsed: true }],
            tabs: [{ url: 'https://a.com', title: 'A', groupId: 7, pinned: false }],
          },
        ],
      },
    ]);
    const file = { text: async () => payload };
    const input = document.getElementById('importInput');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await flushPromises(25);
    const snaps = mock.storageData[SNAPSHOTS_KEY];
    expect(snaps).toHaveLength(1);
    expect(snaps[0].windows[0].groups[0]).toEqual({ id: 7, title: 'Work', color: 'blue', collapsed: true });
    expect(snaps[0].windows[0].tabs[0].groupId).toBe(7);
  });

  test('import honors the user maxSnapshots via enforceRetentionLimits (#7)', async () => {
    const existing = [1, 2, 3].map((n) => ({
      timestamp: n,
      windows: [{ tabs: [{ url: `https://old.com/${n}`, title: 'old' }] }],
    }));
    const mock = await mount({
      [SETTINGS_KEY]: { ...SETTINGS, maxSnapshots: 3, maxBackupMB: 0 },
      [SNAPSHOTS_KEY]: existing,
    });
    const imported = JSON.stringify([
      { timestamp: 10, windows: [{ tabs: [{ url: 'https://new.com/1' }] }] },
      { timestamp: 11, windows: [{ tabs: [{ url: 'https://new.com/2' }] }] },
    ]);
    const file = { text: async () => imported };
    const input = document.getElementById('importInput');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await flushPromises(25);
    const snaps = mock.storageData[SNAPSHOTS_KEY];
    expect(snaps).toHaveLength(3);
    expect(snaps.map((s) => s.timestamp)).toEqual([3, 10, 11]);
  });

  test('import accepts {snapshots:[...]} with tabs (#35)', async () => {
    const mock = await mount({ [SNAPSHOTS_KEY]: [] });
    const payload = JSON.stringify({
      snapshots: [{ createdAt: 9, tabs: [{ url: 'https://wrapped.com', title: 'Wrapped' }] }],
    });
    const file = { text: async () => payload };
    const input = document.getElementById('importInput');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await flushPromises(25);
    expect(mock.storageData[SNAPSHOTS_KEY]).toHaveLength(1);
    expect(mock.storageData[SNAPSHOTS_KEY][0].windows[0].tabs[0].url).toBe('https://wrapped.com');
    expect(document.getElementById('status').classList.contains('error')).toBe(false);
  });

  test('unknown object import shows a lasting failure status (#35)', async () => {
    await mount({ [SNAPSHOTS_KEY]: [] });
    const file = { text: async () => JSON.stringify({ notSnapshots: true }) };
    const input = document.getElementById('importInput');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await flushPromises(25);
    const status = document.getElementById('status');
    expect(status.textContent).toMatch(/Nothing found/i);
    expect(status.classList.contains('visible')).toBe(true);
    expect(status.classList.contains('error')).toBe(true);
  });

  test('import accepts a flat URL list and reports empty input', async () => {
    const mock = await mount({ [SNAPSHOTS_KEY]: [] });
    const file = { text: async () => JSON.stringify(['https://a.com', 'https://b.com']) };
    const input = document.getElementById('importInput');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await flushPromises(25);
    expect(mock.storageData[SNAPSHOTS_KEY]).toHaveLength(1);
    expect(mock.storageData[SNAPSHOTS_KEY][0].windows[0].tabs).toHaveLength(2);

    const empty = { text: async () => '[]' };
    Object.defineProperty(input, 'files', { configurable: true, value: [empty] });
    input.dispatchEvent(new Event('change'));
    await flushPromises(15);
    const emptyStatus = document.getElementById('status');
    expect(emptyStatus.textContent).toMatch(/Nothing found/i);
    expect(emptyStatus.classList.contains('error')).toBe(true);
    expect(emptyStatus.classList.contains('visible')).toBe(true);
  });

  test('import keeps more than 20 snapshots when the user cap is higher (#7)', async () => {
    const existing = Array.from({ length: 18 }, (_, i) => ({
      timestamp: i + 1,
      windows: [{ tabs: [{ url: `https://old.com/${i + 1}` }] }],
    }));
    const mock = await mount({
      [SETTINGS_KEY]: { ...SETTINGS, maxSnapshots: 50, maxBackupMB: 0 },
      [SNAPSHOTS_KEY]: existing,
    });
    const imported = JSON.stringify(
      Array.from({ length: 8 }, (_, i) => ({
        timestamp: 100 + i,
        windows: [{ tabs: [{ url: `https://new.com/${i}` }] }],
      }))
    );
    const file = { text: async () => imported };
    const input = document.getElementById('importInput');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    await flushPromises(25);
    expect(mock.storageData[SNAPSHOTS_KEY]).toHaveLength(26);
  });
});
