'use strict';

const totalTabsEl = document.getElementById('totalTabs');
const discardedTabsEl = document.getElementById('discardedTabs');
const guardianEnabledEl = document.getElementById('guardianEnabled');
const idleMinutesEl = document.getElementById('idleMinutes');
const discardNowBtn = document.getElementById('discardNowBtn');
const backupNowBtn = document.getElementById('backupNowBtn');
const openOptionsBtn = document.getElementById('openOptionsBtn');
const snapshotListEl = document.getElementById('snapshotList');
const restoreIntoCurrentWindowEl = document.getElementById('restoreIntoCurrentWindow');
const tabListEl = document.getElementById('tabList');

const TAB_STATE_LABELS = {
  active: 'активна',
  discarded: 'выгружена',
  loaded: 'загружена',
};

const SETTINGS_KEY = 'tabvault_settings';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tabCount(snapshot) {
  return snapshot.windows.reduce((sum, w) => sum + w.tabs.length, 0);
}

function renderSnapshots(snapshots) {
  snapshotListEl.textContent = '';
  if (!snapshots.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Пока нет снимков';
    snapshotListEl.appendChild(empty);
    return;
  }
  for (const snap of snapshots) {
    const li = document.createElement('li');
    li.className = 'snapshot-item';

    const span = document.createElement('span');
    span.textContent = `${formatTime(snap.timestamp)} · ${tabCount(snap)} вкл.`;

    const button = document.createElement('button');
    button.textContent = 'Восстановить';
    button.addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        type: 'RESTORE_SNAPSHOT',
        timestamp: snap.timestamp,
        intoCurrentWindow: restoreIntoCurrentWindowEl.checked,
      });
    });

    li.appendChild(span);
    li.appendChild(button);
    snapshotListEl.appendChild(li);
  }
}

function renderTabList(tabs) {
  tabListEl.textContent = '';
  if (!tabs || !tabs.length) return;
  for (const tab of tabs) {
    const li = document.createElement('li');
    li.className = 'tab-item';

    const dot = document.createElement('span');
    dot.className = `tab-dot tab-dot--${tab.state}`;
    dot.title = TAB_STATE_LABELS[tab.state] || tab.state;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || '(без названия)';

    const state = document.createElement('span');
    state.className = 'tab-state-label';
    state.textContent = TAB_STATE_LABELS[tab.state] || tab.state;

    li.appendChild(dot);
    li.appendChild(title);
    li.appendChild(state);
    li.addEventListener('click', () => {
      browser.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: tab.id });
    });
    tabListEl.appendChild(li);
  }
}

async function refresh() {
  const state = await browser.runtime.sendMessage({ type: 'GET_STATE' });
  totalTabsEl.textContent = state.totalTabs;
  discardedTabsEl.textContent = state.discardedCount;
  guardianEnabledEl.checked = state.settings.guardianEnabled;
  idleMinutesEl.value = state.settings.idleMinutes;
  renderSnapshots(state.snapshots);
  renderTabList(state.tabsList);
}

async function patchSettings(partial) {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const current = stored[SETTINGS_KEY] || {};
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...current, ...partial } });
}

guardianEnabledEl.addEventListener('change', () => {
  patchSettings({ guardianEnabled: guardianEnabledEl.checked });
});

idleMinutesEl.addEventListener('change', () => {
  const value = Math.max(1, Number(idleMinutesEl.value) || 15);
  idleMinutesEl.value = value;
  patchSettings({ idleMinutes: value });
});

openOptionsBtn.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

discardNowBtn.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'DISCARD_ALL_EXCEPT_CURRENT' });
  await refresh();
});

backupNowBtn.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'BACKUP_NOW' });
  await refresh();
});

refresh();
