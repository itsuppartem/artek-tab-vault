'use strict';

const totalTabsEl = document.getElementById('totalTabs');
const discardedTabsEl = document.getElementById('discardedTabs');
const guardianEnabledEl = document.getElementById('guardianEnabled');
const idleMinutesEl = document.getElementById('idleMinutes');
const discardNowBtn = document.getElementById('discardNowBtn');
const backupNowBtn = document.getElementById('backupNowBtn');
const openOptionsBtn = document.getElementById('openOptionsBtn');
const snapshotListEl = document.getElementById('snapshotList');

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
      await browser.runtime.sendMessage({ type: 'RESTORE_SNAPSHOT', timestamp: snap.timestamp });
    });

    li.appendChild(span);
    li.appendChild(button);
    snapshotListEl.appendChild(li);
  }
}

async function refresh() {
  const state = await browser.runtime.sendMessage({ type: 'GET_STATE' });
  totalTabsEl.textContent = state.totalTabs;
  discardedTabsEl.textContent = state.discardedCount;
  guardianEnabledEl.checked = state.settings.guardianEnabled;
  idleMinutesEl.value = state.settings.idleMinutes;
  renderSnapshots(state.snapshots);
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
