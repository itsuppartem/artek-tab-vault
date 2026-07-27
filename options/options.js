'use strict';

const Core = window.TabVaultCore;
const SETTINGS_KEY = 'tabvault_settings';
const SNAPSHOTS_KEY = 'tabvault_snapshots';

const DEFAULT_SETTINGS = {
  guardianEnabled: true,
  idleMinutes: 15,
  backupIntervalMinutes: 1,
  maxSnapshots: 20,
  neverDiscardDomains: [],
  smartTabActivation: true,
  protectUnsavedForms: true,
};

const els = {
  guardianEnabled: document.getElementById('guardianEnabled'),
  idleMinutes: document.getElementById('idleMinutes'),
  protectUnsavedForms: document.getElementById('protectUnsavedForms'),
  smartTabActivation: document.getElementById('smartTabActivation'),
  whitelist: document.getElementById('whitelist'),
  backupIntervalMinutes: document.getElementById('backupIntervalMinutes'),
  maxSnapshots: document.getElementById('maxSnapshots'),
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
  els.backupIntervalMinutes.value = settings.backupIntervalMinutes;
  els.maxSnapshots.value = settings.maxSnapshots;
  els.whitelist.value = (settings.neverDiscardDomains || []).join('\n');
}

function readForm() {
  return Core.sanitizeSettings(
    {
      guardianEnabled: els.guardianEnabled.checked,
      idleMinutes: els.idleMinutes.value,
      protectUnsavedForms: els.protectUnsavedForms.checked,
      smartTabActivation: els.smartTabActivation.checked,
      backupIntervalMinutes: els.backupIntervalMinutes.value,
      maxSnapshots: els.maxSnapshots.value,
      neverDiscardDomains: Core.parseDomainList(els.whitelist.value),
    },
    DEFAULT_SETTINGS
  );
}

async function load() {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const settings = Core.sanitizeSettings(stored[SETTINGS_KEY], DEFAULT_SETTINGS);
  fillForm(settings);
}

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
  } catch (err) {
    showStatus('Ошибка импорта: неверный файл');
  } finally {
    els.importInput.value = '';
  }
});

load();
