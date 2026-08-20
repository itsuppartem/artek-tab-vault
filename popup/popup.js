'use strict';

const Core = window.TabVaultCore;
const I18n = window.TabVaultI18n;

I18n.apply();

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
const popupStatusEl = document.getElementById('popupStatus');

const TAB_STATE_LABELS = {
  active: I18n.t('tab_state_active'),
  discarded: I18n.t('tab_state_discarded'),
  loaded: I18n.t('tab_state_loaded'),
};

const SETTINGS_KEY = 'tabvault_settings';
const TAB_WORD_FORMS = I18n.wordForms('word_tab');

let popupStatusTimer = null;
function showPopupStatus(text) {
  popupStatusEl.textContent = text;
  popupStatusEl.classList.add('visible');
  clearTimeout(popupStatusTimer);
  popupStatusTimer = setTimeout(() => popupStatusEl.classList.remove('visible'), 1800);
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(I18n.localeTag(), {
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
    empty.textContent = I18n.t('empty_snapshots');
    snapshotListEl.appendChild(empty);
    return;
  }
  for (const snap of snapshots) {
    const li = document.createElement('li');
    li.className = 'snapshot-item';

    const span = document.createElement('span');
    span.textContent = `${formatTime(snap.timestamp)} · ${tabCount(snap)} ${I18n.t('snapshot_tabs_short')}`;

    const button = document.createElement('button');
    button.textContent = I18n.t('btn_restore');
    button.addEventListener('click', async () => {
      const result = await browser.runtime.sendMessage({
        type: 'RESTORE_SNAPSHOT',
        timestamp: snap.timestamp,
        intoCurrentWindow: restoreIntoCurrentWindowEl.checked,
      });
      const restored = result && typeof result.restored === 'number' ? result.restored : 0;
      const skipped = result && typeof result.skipped === 'number' ? result.skipped : 0;
      if (restored <= 0) {
        TabVaultUI.flashButton(button, I18n.t('flash_done'), 1300);
        showPopupStatus(I18n.t('status_restored_none'));
        return;
      }
      TabVaultUI.flashButton(button, I18n.t('flash_opened'), 1300);
      if (skipped > 0) {
        showPopupStatus(
          I18n.t('status_restored_partial', [
            String(restored),
            Core.pluralizeRu(restored, TAB_WORD_FORMS),
            String(skipped),
            Core.pluralizeRu(skipped, TAB_WORD_FORMS),
          ])
        );
      } else {
        showPopupStatus(I18n.t('status_restored', [String(restored), Core.pluralizeRu(restored, TAB_WORD_FORMS)]));
      }
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
    title.textContent = tab.title || I18n.t('tab_untitled');

    const state = document.createElement('span');
    state.className = 'tab-state-label';
    state.textContent = TAB_STATE_LABELS[tab.state] || tab.state;

    li.appendChild(dot);
    li.appendChild(title);
    li.appendChild(state);
    li.addEventListener('click', () => {
      TabVaultUI.flashElement(li, 400);
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
  TabVaultUI.flashElement(guardianEnabledEl.closest('.row'));
  showPopupStatus(guardianEnabledEl.checked ? I18n.t('status_guardian_on') : I18n.t('status_guardian_off'));
});

idleMinutesEl.addEventListener('change', () => {
  const value = Math.max(1, Number(idleMinutesEl.value) || 15);
  idleMinutesEl.value = value;
  patchSettings({ idleMinutes: value });
  TabVaultUI.flashElement(idleMinutesEl.closest('.row'));
  showPopupStatus(I18n.t('status_idle_saved'));
});

openOptionsBtn.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

discardNowBtn.addEventListener('click', async () => {
  const { discardedCount } = await browser.runtime.sendMessage({ type: 'DISCARD_ALL_EXCEPT_CURRENT' });
  await refresh();
  TabVaultUI.flashButton(discardNowBtn, I18n.t('flash_done'));
  showPopupStatus(
    discardedCount > 0
      ? I18n.t('status_discarded', [String(discardedCount), Core.pluralizeRu(discardedCount, TAB_WORD_FORMS)])
      : I18n.t('status_nothing_to_discard')
  );
});

backupNowBtn.addEventListener('click', async () => {
  const result = await browser.runtime.sendMessage({ type: 'BACKUP_NOW' });
  await refresh();
  if (result && result.saved) {
    TabVaultUI.flashButton(backupNowBtn, I18n.t('flash_saved'));
    showPopupStatus(I18n.t('status_snapshot_saved'));
  } else {
    TabVaultUI.flashButton(backupNowBtn, I18n.t('flash_unchanged'));
    showPopupStatus(I18n.t('status_snapshot_unchanged'));
  }
});

refresh();
