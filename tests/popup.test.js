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

async function mount(state = makeState(), responses = {}) {
  const messages = [];
  const mock = createMockBrowser({
    i18n: loadEnI18n(),
    storage: { tabvault_settings: SETTINGS },
    sendMessage: async (message) => {
      messages.push(message);
      if (message.type === 'GET_STATE') return state;
      if (message.type === 'DISCARD_ALL_EXCEPT_CURRENT') return { discardedCount: 2 };
      if (message.type === 'BACKUP_NOW') return responses.BACKUP_NOW !== undefined ? responses.BACKUP_NOW : { saved: true };
      if (message.type === 'RESTORE_SNAPSHOT') {
        const r =
          responses.RESTORE_SNAPSHOT !== undefined
            ? responses.RESTORE_SNAPSHOT
            : { ok: true, restored: 2, skipped: 0 };
        return typeof r === 'function' ? r(message) : r;
      }
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

  test('backup now flashes saved only when a snapshot was stored', async () => {
    await mount();
    document.getElementById('backupNowBtn').click();
    await flushPromises(15);
    expect(document.getElementById('popupStatus').textContent).toBe('Session snapshot saved');
    expect(document.getElementById('backupNowBtn').textContent).toBe('✓ Saved');
  });

  test('backup now shows the unchanged status when saved is false', async () => {
    await mount(makeState(), { BACKUP_NOW: { saved: false } });
    document.getElementById('backupNowBtn').click();
    await flushPromises(15);
    expect(document.getElementById('popupStatus').textContent).toBe('Session did not change');
    expect(document.getElementById('popupStatus').textContent).not.toBe('Session snapshot saved');
    expect(document.getElementById('backupNowBtn').textContent).toBe('✓ Unchanged');
  });

  test('restore status does not claim every tab opened when some were skipped', async () => {
    await mount(makeState(), { RESTORE_SNAPSHOT: { ok: true, restored: 2, skipped: 1 } });
    document.querySelector('#snapshotList button').click();
    await flushPromises(15);
    const status = document.getElementById('popupStatus').textContent;
    expect(status).toBe('Restored 2 tabs, skipped 1 tab');
    expect(status).not.toBe('Restored 3 tabs');
    expect(status).not.toBe('Restored 2 tabs');
  });

  test('restore status says nothing was restored when restored is 0', async () => {
    await mount(makeState(), { RESTORE_SNAPSHOT: { ok: false, restored: 0, skipped: 3 } });
    document.querySelector('#snapshotList button').click();
    await flushPromises(15);
    expect(document.getElementById('popupStatus').textContent).toBe('Nothing was restored');
  });

  test('two rapid Restore clicks send only one RESTORE_SNAPSHOT (#36)', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const { messages } = await mount(makeState(), {
      RESTORE_SNAPSHOT: () => gate.then(() => ({ ok: true, restored: 2, skipped: 0 })),
    });
    const button = document.querySelector('#snapshotList button');
    button.click();
    button.click();
    expect(button.disabled).toBe(true);
    release();
    await flushPromises(20);
    expect(messages.filter((m) => m.type === 'RESTORE_SNAPSHOT')).toHaveLength(1);
  });
});
