# Changelog

All notable user-facing changes to Artek Tab Vault are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each listed AMO release must copy its section into `amo-metadata.json` → `version.release_notes.en-US` before signing (see `LISTING.md`).

## [Unreleased]

### Added
- Configurable backup retention: an optional size cap (MB, on top of the existing snapshot-count cap) with three ready-made presets (Компактный/Сбалансированный/Архивариус) in settings, plus a visible "История обрезки бэкапов" log showing exactly when and why old snapshots were trimmed or a snapshot was skipped - no more silent history loss.
- Native Firefox tab group support: backups now capture group name/color, and restoring a snapshot recreates the groups (requires Firefox's `tabGroups` API; tabs still restore fine without it).
- Unsaved-form protection: the guardian now skips discarding a tab that has an unsubmitted form, so you don't silently lose typed input. Can be turned off in settings.
- Proactive crash-restore prompt: on the next Firefox launch after a likely crash/unclean shutdown, a notification offers to open the last backup.
- Restore-into-current-window option: restore a snapshot into your current window instead of always opening a new one.
- Tolerant snapshot import: importing now accepts plain URL lists and a few common export shapes from other tab managers, skipping only the entries it can't parse instead of failing the whole import.
- Popup now lists every tab in the current window with an active/loaded/discarded indicator dot, since Firefox exposes no real per-tab memory number.

### Changed
- Smart tab activation on close: when the active tab is closed, focus now jumps to the nearest already-loaded tab instead of a freshly-discarded neighbor. Firefox has no API to cancel the reload it starts internally, so this mitigates rather than fully eliminates the jump-and-reload annoyance. Can be turned off in settings.

### Fixed
- Snapshot integrity guard: the backup engine no longer persists a fully-empty (zero-tab) snapshot. Firefox can't have a window with zero tabs, so this state only occurs during a startup/shutdown race - previously it could still get saved and evict good history from the rolling backup.

## [0.1.2] - 2026-07-27

### Added
- MIT license for the project, required for listed AMO distribution.

### Changed
- Prepared metadata (category, summary, license) for AMO listed submission.

## [0.1.1] - 2026-07-27

### Fixed
- `strict_min_version` bumped to 140.0 - required by the `data_collection_permissions` manifest key, fixes an AMO validation warning.

## [0.1.0] - 2026-07-27

### Added
- Independent tab/session backup, separate from Firefox's native session restore.
- Guardian: automatic discard of idle background tabs to free memory.
- Domain whitelist to exclude sites from auto-discard.
- Popup with quick controls (discard all except current, backup now, snapshot restore list).
- Options page: idle threshold, backup interval, snapshot retention, whitelist editor, export/import snapshots to JSON.
- Keyboard shortcut for "discard all except current".
