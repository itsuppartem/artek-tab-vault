'use strict';

const Core = window.TabVaultCore;
const I18n = window.TabVaultI18n;

I18n.apply();

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

const PRUNE_REASON_KEYS = {
  'max-snapshots-limit': 'prune_reason_max_snapshots',
  'max-size-limit': 'prune_reason_max_size',
  'skipped-empty-snapshot': 'prune_reason_skipped_empty',
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
  importLabel: document.getElementById('importLabel'),
  status: document.getElementById('status'),
};

const SNAPSHOT_WORD_FORMS = I18n.wordForms('word_snapshot');
const BAD_TAB_WORD_FORMS = I18n.wordForms('word_bad_tab');

let statusTimer = null;
function showStatus(text, options = {}) {
  els.status.textContent = text;
  els.status.classList.add('visible');
  els.status.classList.toggle('error', !!options.persist);
  clearTimeout(statusTimer);
  if (options.persist) {
    statusTimer = null;
    return;
  }
  statusTimer = setTimeout(() => {
    els.status.classList.remove('visible');
    els.status.classList.remove('error');
  }, 1800);
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
  if (!bytes) return `0 ${I18n.t('unit_kb')}`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} ${I18n.t('unit_mb')}`;
  return `${Math.ceil(bytes / 1024)} ${I18n.t('unit_kb')}`;
}

function formatLogTime(ts) {
  return new Date(ts).toLocaleString(I18n.localeTag(), {
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
  els.storageUsage.textContent = I18n.t('storage_usage_line', [
    formatBytes(bytes),
    String(snapshots.length),
    Core.pluralizeRu(snapshots.length, SNAPSHOT_WORD_FORMS),
  ]);

  els.pruneLogList.textContent = '';
  if (!log.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = I18n.t('empty_prune_log');
    els.pruneLogList.appendChild(empty);
    return;
  }
  for (const entry of log) {
    const li = document.createElement('li');
    const reasonKey = PRUNE_REASON_KEYS[entry.reason];
    const label = reasonKey ? I18n.t(reasonKey) : entry.reason;
    const countText =
      entry.droppedCount > 0 ? I18n.t('prune_dropped_suffix', [String(entry.droppedCount)]) : '';
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
    TabVaultUI.flashButton(btn, I18n.t('flash_preset_applied'), 1000);
    showStatus(I18n.t('status_preset_applied'));
  });
});

els.saveBtn.addEventListener('click', async () => {
  const settings = readForm();
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  fillForm(settings);
  TabVaultUI.flashButton(els.saveBtn, I18n.t('flash_saved'));
  showStatus(I18n.t('status_saved'));
});

els.resetBtn.addEventListener('click', async () => {
  await browser.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  fillForm(DEFAULT_SETTINGS);
  TabVaultUI.flashButton(els.resetBtn, I18n.t('flash_reset'));
  showStatus(I18n.t('status_reset'));
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
  TabVaultUI.flashButton(els.exportBtn, I18n.t('flash_exported'));
  showStatus(
    I18n.t('status_exported', [
      String(snapshots.length),
      Core.pluralizeRu(snapshots.length, SNAPSHOT_WORD_FORMS),
    ])
  );
});

els.importInput.addEventListener('change', async () => {
  const file = els.importInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const { snapshots: imported, skippedEntries } = Core.parseImportedSnapshots(text);
    if (!imported.length) {
      showStatus(I18n.t('status_import_empty'), { persist: true });
      return;
    }

    const stored = await browser.storage.local.get([SNAPSHOTS_KEY, SETTINGS_KEY]);
    const existing = stored[SNAPSHOTS_KEY] || [];
    const currentSettings = Core.sanitizeSettings(stored[SETTINGS_KEY], DEFAULT_SETTINGS);
    const combined = [...existing, ...imported].sort((a, b) => a.timestamp - b.timestamp);
    const maxBytes = currentSettings.maxBackupMB > 0 ? currentSettings.maxBackupMB * 1024 * 1024 : null;
    const { snapshots: merged } = Core.enforceRetentionLimits(combined, {
      maxSnapshots: currentSettings.maxSnapshots,
      maxBytes,
    });
    await browser.storage.local.set({ [SNAPSHOTS_KEY]: merged });
    TabVaultUI.flashElement(els.importLabel, 1000);
    const snapWord = Core.pluralizeRu(imported.length, SNAPSHOT_WORD_FORMS);
    showStatus(
      skippedEntries > 0
        ? I18n.t('status_imported_with_skips', [
            String(imported.length),
            snapWord,
            String(skippedEntries),
            Core.pluralizeRu(skippedEntries, BAD_TAB_WORD_FORMS),
          ])
        : I18n.t('status_imported', [String(imported.length), snapWord])
    );
    await loadStorageAndLog();
  } catch (err) {
    showStatus(I18n.t('status_import_error'), { persist: true });
  } finally {
    els.importInput.value = '';
  }
});

load();
