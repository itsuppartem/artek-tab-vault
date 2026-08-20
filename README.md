# Artek Tab Vault

Firefox extension for two common pain points:

1. **Lost tabs after a crash or update** — keeps an independent rolling backup of every window and tab (interval is configurable), separate from Firefox's own session restore.
2. **RAM growth from dozens of open tabs** — Guardian automatically discards (`tabs.discard`) tabs that have been idle longer than the threshold. Pinned, active, audible, and whitelisted tabs are left alone.

## Features

- Rolling session snapshots with a count limit and an optional size cap (MB), plus Compact / Balanced / Archivist presets.
- Visible prune log so retention is never silent.
- Native Firefox tab groups (name, color, collapsed) captured and restored.
- Restore into a new window or the current window.
- Tolerant snapshot import (native JSON, URL lists, common session shapes including `{snapshots:[...]}`, plain-text links).
- Keyboard shortcut for Discard all except current: Alt+Shift+D (remappable in about:addons). This unloads other discardable tabs in all normal windows and keeps the focused active tab.
- Unsaved-form protection (clears on form reset and same-document SPA navigation), smart tab activation, and a configurable title marker on discarded tabs.
- Media protection: known media hosts and in-page video/audio that is playing or paused with progress. An empty never-played video is not protected.
- Localized UI: English, Russian, Kazakh, Ukrainian, Belarusian, Serbian.

## Layout

```
artek-tab-vault/
  manifest.json
  core.js                 # pure logic (no browser APIs)
  background.js           # alarms, tabs, storage, tabGroups, notifications
  i18n.js                 # popup/options i18n helper
  ui-feedback.js          # button flash / success helpers
  content-scripts/        # dirty-form + mark-discarded
  popup/                  # toolbar popup
  options/                # settings, export/import, prune log
  _locales/               # en/ru/kk/uk/be/sr UI strings
  tests/                  # Jest unit tests
  tests/e2e/              # live Firefox e2e (not picked up by Jest)
  tests/helpers/          # WebExtension mock + script loader
```

`core.js` does not call browser APIs, so it runs in Node under Jest.

## Development

Install dependencies, then start a Firefox session with the extension loaded (hot reload). You can also load `manifest.json` from about:debugging as a temporary add-on.

Snap Firefox on Ubuntu: if the start script fails with "Profile Missing", the snap sandbox cannot see a temp profile in /tmp. The start script already points TMPDIR at a folder under HOME. Do the same if you invoke web-ext yourself.

## Tests

Unit tests (Jest) do not need Firefox:

    npm test

Live Firefox e2e builds a web-ext zip, installs it in headless Firefox, and checks the addon id plus https://example.com. The file is tests/e2e/firefox.e2e.js (not *.test.js, so Jest ignores it). Locally it skips if firefox or geckodriver is missing, unless CI=true:

    npm run test:firefox

CI on main, develop, and PRs into those branches has two jobs: `test` (Jest, the merge gate) and `firefox` (live e2e canary; it may flake).

## Settings

Open from the popup (All settings and exclusions), or about:addons then Preferences.

- Guardian on/off and idle threshold. Discard-all-except-current unloads other tabs in all normal windows (still skips pinned, audible, media, dirty, and whitelist) and keeps the focused active tab. Default shortcut is Alt+Shift+D (not Ctrl+Shift+D, which Firefox uses for Bookmark all tabs).
- Skip tabs with an unsubmitted form (the content script only reports a boolean, not the field values).
- Smart activation when a tab is closed.
- Domain whitelist (includes subdomains).
- Auto-backup interval (default and Balanced: 5 minutes; Compact: 2; Archivist: 1), snapshot count, and history size in MB.
- Restore into the current window (toggle next to the snapshot list in the popup; the choice is saved).
- Export/import snapshots. Import accepts our JSON plus flat URL lists, objects with tabs/windows/sessions/snapshots, and plain-text links; bad rows are skipped. A file with nothing to import shows a lasting error.
- Title prefix on discarded tabs (default sleep emoji); can be turned off.

## Limits

- Firefox does not expose per-tab RAM. Guardian uses idle time; the popup shows active / loaded / discarded, not bytes.
- Restoring a snapshot reopens tabs by URL; it does not restore in-page history, scroll, or unsaved form state.
- Restore only reopens http(s) and about:blank. Privileged pages (about:debugging, file:, chrome:, and similar) are skipped, and the popup reports how many tabs opened vs skipped.
- Backup now does not write a duplicate snapshot when the tab set is unchanged; the popup says the session did not change.
- There is no API to cancel the reload Firefox starts when it activates a discarded tab. Smart activation moves focus afterwards; it cannot prevent that reload.

## Releasing a WebExtension

Local development uses web-ext run (separate Firefox profile, live reload) or about:debugging temporary add-on load. Firefox Developer Edition / Nightly can install unsigned xpi files when signature checks are disabled.

The version in manifest.json is a semver-like string. AMO will not accept a reused version. Packaging and lint are local/release tools; the unit and firefox CI jobs do not run them.

Distribution goes through addons.mozilla.org (AMO). A developer account is free.

- Listed: public catalog page, search, auto-updates. Automated plus manual review.
- Unlisted: still signed by Mozilla, no public listing.

API keys come from AMO Developer Hub (Manage API Keys). Use the sign script with WEB_EXT_API_KEY and WEB_EXT_API_SECRET. For the listed channel, fill store metadata (screenshots, description, category). This project does not collect data.

After publish, listed users get updates automatically once the new version is reviewed. A new version that adds permissions prompts the user to confirm.

Store copy lives in LISTING.md (source of truth). Field-by-field Hub notes: listing/AMO-FILL.md. Assets: listing/ and store-assets/. The addon is listed; paste Hub fields from those files — do not leave Homepage empty.

## GitHub Releases

Push a version tag (`vX.Y.Z`, for example `v0.3.2`). The Release workflow runs unit tests, builds the unsigned zip with web-ext, and attaches it to a GitHub Release. Use that zip for a later AMO/store upload. The workflow does not sign or submit to AMO. You can also run it by hand (workflow_dispatch); it then uses the version in package.json.

## Contributing

See CONTRIBUTING.md. Feature work goes to develop via pull request. develop to main is pull-request only. Do not push main.

## License

MIT. See LICENSE. The repository is public: https://github.com/itsuppartem/artek-tab-vault
Issues: https://github.com/itsuppartem/artek-tab-vault/issues
