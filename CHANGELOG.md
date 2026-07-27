# Changelog

All notable user-facing changes to Artek Tab Vault are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each listed AMO release must copy its section into `amo-metadata.json` → `version.release_notes.en-US` before signing (see `LISTING.md`).

## [Unreleased]

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
