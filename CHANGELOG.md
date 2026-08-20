# Changelog

All notable user-facing changes to Artek Tab Vault are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each listed AMO release must copy its section into `amo-metadata.json` → `version.release_notes.en-US` before signing (see `LISTING.md`).

## [Unreleased]

### Added
- Live Firefox e2e (`npm run test:firefox`): web-ext zip, headless Firefox, addon id + example.com title. Skips locally if firefox/geckodriver are missing (#20).
- CI `firefox` canary job (setup-firefox + setup-geckodriver). Jest `test` stays the merge gate (#20).
- Release workflow: tag `v*` or workflow_dispatch builds the zip and creates a GitHub Release for later store upload. No AMO sign (#22).

### Changed
- AMO listing copy refresh (docs): description (en-US and ru-RU) now covers Guardian media protection, crash-restore prompt skip, dirty-form SPA reset, and the public MIT repo/support URLs. Repo is the listing source of truth; live Hub paste is leftover (#27).
- README, CHANGELOG, and CONTRIBUTING must update in the same PR as the code (#21).
- CONTRIBUTING working rules: develop is daily work, main is released product only, issues first, tests and docs in the same PR, firefox job is a canary not the merge gate (#24).

### Fixed
- Popup status stays visible until the next action instead of vanishing after 1800ms (#39).
- Restore into current window checkbox persists in settings (#40).
- Popup tab list refreshes after discard, restore, activate, and backup (#41).
- Discard all except current now unloads other tabs in all normal windows, not only the focused window (#42).
- Default and Balanced auto-backup interval is 5 minutes so the snapshot cap lasts longer; Compact stays 2, Archivist stays 1. A value of 1 is still allowed (#43).
- Restore keeps `about:blank` tabs instead of letting Firefox replace them with a default New Tab (#34).
- Import accepts a `{snapshots:[...]}` wrapper and shows a lasting error when nothing was imported (#35).
- Double-click Restore no longer opens the snapshot twice (#36).
- Default discard shortcut is Alt+Shift+D so it no longer collides with Firefox Bookmark all tabs (#37).
- Restore skips privileged tab URLs instead of aborting, and Backup now reports when the session was unchanged (#30 #31 #32).
- Snapshot import keeps Firefox tab groups (name, color, collapsed, groupId) instead of wiping them (#6).
- Options import uses the user's snapshot and size limits instead of always capping history at 20 (#7).
- Restoring a snapshot into a new window re-applies pinned tabs after the window is created (#8).
- Restored tab groups keep their collapsed state (#9).
- countTabsInSnapshot returns 0 for null or malformed snapshots instead of throwing (#10).
- Crash-restore notification no longer re-fires after it was already shown, and it is skipped on addon install/update (#11).
- Unsaved-form protection clears the dirty flag on form reset and same-document SPA navigations (#12).
- Guardian does not discard tabs with in-use video/audio (playing or paused with progress) or known media hosts such as YouTube (#17).

## [0.3.1] - 2026-07-29

### Changed
- Minimum Firefox version raised to 142.0 (required by `data_collection_permissions` on Android; clears the AMO validation warning on upload).

## [0.3.0] - 2026-07-29

### Added
- UI localization for English, Russian, Kazakh, Ukrainian, Belarusian, and Serbian (follows Firefox's locale). Popup, settings, notifications, and status toasts are translated.

### Fixed
- Real extension icon in the toolbar, the add-ons manager and on the store page: the manifest previously pointed only at an SVG, which Firefox's add-on listing doesn't render, so the extension showed a generic placeholder puzzle piece. Ships proper 48/96/128px PNG icons instead (vault-dial mark).
- Settings page: the prefix text field was an unstyled white box on the dark settings page - it now matches the other inputs.
- Release CI no longer fails after a successful AMO upload while waiting for manual review (approval timeout), and treats an already-uploaded version as success on re-run.

## [0.2.0] - 2026-07-27

### Added
- "💤" title marker on discarded tabs: the guardian now rewrites a tab's title (e.g. `💤 Original Title`) right before discarding it, so it's visible directly in Firefox's tab strip/sidebar - not only in the popup. Prefix text/emoji is configurable, feature can be turned off. Doesn't work on pages that block script injection (about:, addons.mozilla.org, PDF viewer).
- Configurable backup retention: an optional size cap (MB, on top of the existing snapshot-count cap) with three ready-made presets (Compact/Balanced/Archivist) in settings, plus a visible "Backup prune history" log showing exactly when and why old snapshots were trimmed or a snapshot was skipped - no more silent history loss.
- Native Firefox tab group support: backups now capture group name/color, and restoring a snapshot recreates the groups (requires Firefox's `tabGroups` API; tabs still restore fine without it).
- Unsaved-form protection: the guardian now skips discarding a tab that has an unsubmitted form, so you don't silently lose typed input. Can be turned off in settings.
- Proactive crash-restore prompt: on the next Firefox launch after a likely crash/unclean shutdown, a notification offers to open the last backup.
- Restore-into-current-window option: restore a snapshot into your current window instead of always opening a new one.
- Tolerant snapshot import: importing now accepts plain URL lists and a few common export shapes from other tab managers, skipping only the entries it can't parse instead of failing the whole import.
- Popup now lists every tab in the current window with an active/loaded/discarded indicator dot, since Firefox exposes no real per-tab memory number.

### Changed
- Smart tab activation on close: when the active tab is closed, focus now jumps to the nearest already-loaded tab instead of a freshly-discarded neighbor. Firefox has no API to cancel the reload it starts internally, so this mitigates rather than fully eliminates the jump-and-reload annoyance. Can be turned off in settings.
- Visual confirmation for actions: buttons in the popup and settings page now show a brief press animation and a green "✓ done" flash after an action actually completes (discard, backup, restore, save, reset, export, import, preset), plus a short text confirmation (with correct counts, e.g. "Discarded 3 tabs") - previously a click gave no feedback beyond the data quietly changing.

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
