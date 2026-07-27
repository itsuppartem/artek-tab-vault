'use strict';

const Core = window.TabVaultCore;
const SETTINGS_KEY = 'tabvault_settings';
const SNAPSHOTS_KEY = 'tabvault_snapshots';
const PRUNE_LOG_KEY = 'tabvault_prune_log';

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

const PRUNE_REASON_LABELS = {
  'max-snapshots-limit': 'обрезано по лимиту количества снимков',
  'max-size-limit': 'обрезано по лимиту размера истории',
  'skipped-empty-snapshot': 'пропущен пустой/повреждённый снимок (защита от гонки при крэше)',
};

const els = {
  guardianEnabled: document.getElementById('guardianEnabled'),
  idleMinutes: document.getElementById('idleMinutes'),
  protectUnsavedForms: document.getElementById('protectUnsavedForms'),
  smartTabActivation: document.getElementById('smartTabActivation'),
  markDiscardedInTitle: document.getElementById('markDiscardedInTitle'),
  discardedTitlePrefix: document.getElementById('discardedTitlePrefix'),
  whitelist: document.getElementById('whitelist'),
  backupIntervalMinutes: document.getElementById('backupIntervalMinutes'),
  maxSnapshots: document.getElementById('maxSnapshots'),
  maxBackupMB: document.getElementById('maxBackupMB'),
  storageUsage: document.getElementById('storageUsage'),
  pruneLogList: document.getElementById('pruneLogList'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  status: document.getElementById('status'),
};

function showStatus(text) {
  els.status.textContent = text;
  els.status.classList.add('visible');
  setTimeout(() => els.status.classList.remove('visible'), 1800);
}

function fillForm(settings) {
  els.guardianEnabled.checked = settings.guardianEnabled;
  els.idleMinutes.value = settings.idleMinutes;
  els.protectUnsavedForms.checked = settings.protectUnsavedForms;
  els.smartTabActivation.checked = settings.smartTabActivation;
  els.markDiscardedInTitle.checked = settings.markDiscardedInTitle;
  els.discardedTitlePrefix.value = settings.discardedTitlePrefix;
  els.backupIntervalMinutes.value = settings.backupIntervalMinutes;
  els.maxSnapshots.value = settings.maxSnapshots;
  els.maxBackupMB.value = settings.maxBackupMB;
  els.whitelist.value = (settings.neverDiscardDomains || []).join('\n');
}

function readForm() {
  return Core.sanitizeSettings(
    {
      guardianEnabled: els.guardianEnabled.checked,
      idleMinutes: els.idleMinutes.value,
      protectUnsavedForms: els.protectUnsavedForms.checked,
      smartTabActivation: els.smartTabActivation.checked,
      markDiscardedInTitle: els.markDiscardedInTitle.checked,
      discardedTitlePrefix: els.discardedTitlePrefix.value,
      backupIntervalMinutes: els.backupIntervalMinutes.value,
      maxSnapshots: els.maxSnapshots.value,
      maxBackupMB: els.maxBackupMB.value,
      neverDiscardDomains: Core.parseDomainList(els.whitelist.value),
    },
    DEFAULT_SETTINGS
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 КБ';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} МБ`;
  return `${Math.ceil(bytes / 1024)} КБ`;
}

function formatLogTime(ts) {
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadStorageAndLog() {
  const stored = await browser.storage.local.get([SNAPSHOTS_KEY, PRUNE_LOG_KEY]);
  const snapshots = stored[SNAPSHOTS_KEY] || [];
  const log = (stored[PRUNE_LOG_KEY] || []).slice().reverse();

  const bytes = Core.totalSnapshotsBytes(snapshots);
  els.storageUsage.textContent = `${formatBytes(bytes)} · ${snapshots.length} снимков`;

  els.pruneLogList.textContent = '';
  if (!log.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Пока пусто - лимиты ни разу не срабатывали';
    els.pruneLogList.appendChild(empty);
    return;
  }
  for (const entry of log) {
    const li = document.createElement('li');
    const label = PRUNE_REASON_LABELS[entry.reason] || entry.reason;
    const countText = entry.droppedCount > 0 ? ` (${entry.droppedCount} шт.)` : '';
    li.textContent = `${formatLogTime(entry.timestamp)} · ${label}${countText}`;
    els.pruneLogList.appendChild(li);
  }
}

async function load() {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const settings = Core.sanitizeSettings(stored[SETTINGS_KEY], DEFAULT_SETTINGS);
  fillForm(settings);
  await loadStorageAndLog();
}

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = Core.applyRetentionPreset(btn.dataset.preset);
    if (!preset) return;
    els.backupIntervalMinutes.value = preset.backupIntervalMinutes;
    els.maxSnapshots.value = preset.maxSnapshots;
    els.maxBackupMB.value = preset.maxBackupMB;
    els.idleMinutes.value = preset.idleMinutes;
    showStatus('Профиль применён - не забудьте «Сохранить»');
  });
});

els.saveBtn.addEventListener('click', async () => {
  const settings = readForm();
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  fillForm(settings);
  showStatus('Сохранено');
});

els.resetBtn.addEventListener('click', async () => {
  await browser.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  fillForm(DEFAULT_SETTINGS);
  showStatus('Сброшено к значениям по умолчанию');
});

els.exportBtn.addEventListener('click', async () => {
  const stored = await browser.storage.local.get(SNAPSHOTS_KEY);
  const snapshots = stored[SNAPSHOTS_KEY] || [];
  const blob = new Blob([JSON.stringify(snapshots, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tab-vault-snapshots-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('Снимки экспортированы');
});

els.importInput.addEventListener('change', async () => {
  const file = els.importInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const { snapshots: imported, skippedEntries } = Core.parseImportedSnapshots(text);
    if (!imported.length) {
      showStatus('Ничего не найдено для импорта - проверьте файл');
      return;
    }

    const stored = await browser.storage.local.get(SNAPSHOTS_KEY);
    const existing = stored[SNAPSHOTS_KEY] || [];
    const merged = Core.pruneSnapshots(
      [...existing, ...imported].sort((a, b) => a.timestamp - b.timestamp),
      DEFAULT_SETTINGS.maxSnapshots
    );
    await browser.storage.local.set({ [SNAPSHOTS_KEY]: merged });
    showStatus(
      skippedEntries > 0
        ? `Импортировано ${imported.length} снимков, пропущено ${skippedEntries} некорректных вкладок`
        : `Импортировано ${imported.length} снимков`
    );
    await loadStorageAndLog();
  } catch (err) {
    showStatus('Ошибка импорта: неверный файл');
  } finally {
    els.importInput.value = '';
  }
});

load();
