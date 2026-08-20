/**
 * @jest-environment jsdom
 */
'use strict';

const { createMockBrowser, loadPopup, flushPromises, loadEnI18n } = require('./helpers/mock-browser');

const SETTINGS = {
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

function makeState(overrides = {}) {
  return {
    settings: SETTINGS,
    discardedCount: 1,
    totalTabs: 3,
    snapshots: [
      {
        timestamp: 1_700_000_000_000,
        windows: [{ tabs: [{ url: 'https://a.com' }, { url: 'https://b.com' }] }],
      },
    ],
    tabsList: [
      { id: 1, title: 'Active tab', state: 'active', pinned: false, favIconUrl: null },
      { id: 2, title: 'Sleeping', state: 'discarded', pinned: false, favIconUrl: null },
    ],
    ...overrides,
  };
}

async function mount(state = makeState()) {
  const messages = [];
  const mock = createMockBrowser({
    i18n: loadEnI18n(),
    storage: { tabvault_settings: SETTINGS },
    sendMessage: async (message) => {
      messages.push(message);
      if (message.type === 'GET_STATE') return state;
      if (message.type === 'DISCARD_ALL_EXCEPT_CURRENT') return { discardedCount: 2 };
      if (message.type === 'BACKUP_NOW') return true;
      if (message.type === 'RESTORE_SNAPSHOT') return true;
      if (message.type === 'ACTIVATE_TAB') return true;
      return undefined;
    },
  });
  loadPopup(mock.browser);
  await flushPromises(20);
  return { mock, messages, state };
}

describe('popup', () => {
  test('refresh fills stats, snapshots, and the tab list', async () => {
    await mount();
    expect(document.getElementById('totalTabs').textContent).toBe('3');
    expect(document.getElementById('discardedTabs').textContent).toBe('1');
    expect(document.getElementById('guardianEnabled').checked).toBe(true);
    expect(document.getElementById('idleMinutes').value).toBe('15');
    expect(document.querySelectorAll('#snapshotList .snapshot-item')).toHaveLength(1);
    expect(document.querySelectorAll('#tabList .tab-item')).toHaveLength(2);
  });

  test('shows an empty snapshots placeholder', async () => {
    await mount(makeState({ snapshots: [] }));
    const empty = document.querySelector('#snapshotList .empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toBe('No snapshots yet');
  });

  test('discard / backup / restore / activate send the matching messages', async () => {
    const { messages } = await mount();
    document.getElementById('discardNowBtn').click();
    await flushPromises(15);
    expect(messages.some((m) => m.type === 'DISCARD_ALL_EXCEPT_CURRENT')).toBe(true);

    document.getElementById('backupNowBtn').click();
    await flushPromises(15);
    expect(messages.some((m) => m.type === 'BACKUP_NOW')).toBe(true);

    document.querySelector('#snapshotList button').click();
    await flushPromises(15);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'RESTORE_SNAPSHOT',
          timestamp: 1_700_000_000_000,
          intoCurrentWindow: false,
        }),
      ])
    );

    document.querySelector('#tabList .tab-item').click();
    await flushPromises(10);
    expect(messages).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'ACTIVATE_TAB', tabId: 1 })]));
  });

  test('restore uses the into-current-window checkbox', async () => {
    const { messages } = await mount();
    document.getElementById('restoreIntoCurrentWindow').checked = true;
    document.querySelector('#snapshotList button').click();
    await flushPromises(10);
    const restore = messages.find((m) => m.type === 'RESTORE_SNAPSHOT');
    expect(restore.intoCurrentWindow).toBe(true);
  });

  test('patchSettings writes guardian and idle changes to storage', async () => {
    const { mock } = await mount();
    const guardian = document.getElementById('guardianEnabled');
    guardian.checked = false;
    guardian.dispatchEvent(new Event('change'));
    await flushPromises(10);
    expect(mock.storageData.tabvault_settings.guardianEnabled).toBe(false);

    const idle = document.getElementById('idleMinutes');
    idle.value = '30';
    idle.dispatchEvent(new Event('change'));
    await flushPromises(10);
    expect(mock.storageData.tabvault_settings.idleMinutes).toBe(30);
  });

  test('open options button asks the runtime to open the page', async () => {
    const { mock } = await mount();
    document.getElementById('openOptionsBtn').click();
    expect(mock.calls.openOptionsPage).toHaveLength(1);
  });
});
