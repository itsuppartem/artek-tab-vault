# Artek Tab Vault

Firefox extension for two common tab-management problems:

1. **Lost tabs after a crash or update** — keeps an independent rolling backup of every window and tab, separate from Firefox built-in session restore.
2. **RAM growth from dozens of open tabs** — Guardian discards idle tabs. Pinned, active, audible, and whitelisted tabs are left alone.

## Install for development

Install dependencies, then start a local Firefox session with the extension loaded and live reload.

You can also load it from about:debugging: This Firefox, Load Temporary Add-on, then pick manifest.json.

On Snap Firefox, the start script puts the temporary profile under the home directory so the sandbox can see it.

## Tests and CI

The Jest suite covers core logic, the background page, popup, options, content scripts, i18n, and locales.

CI runs that suite on pushes and pull requests to main and develop. Local web-ext lint is optional and is not part of CI.

## Repository layout

- core.js — pure logic, no browser APIs, shared by the background page and tests
- background.js — alarms, tabs, storage, tab groups, notifications
- popup/ and options/ — toolbar UI and settings
- content-scripts/ — unsaved-form detector and discarded-title marker
- _locales/ — addon UI translations (en, ru, kk, uk, be, sr)
- tests/ — Jest suite
- scripts/ — development utilities, not shipped in the extension zip

## Settings

Open via the popup or about:addons Preferences: Guardian, idle threshold, unsaved-form protection, smart activation, domain whitelist, backup interval and retention, export/import, and an optional discarded-tab title prefix.

## Limits

Firefox does not expose per-tab RAM, so Guardian uses idle time. Restoring a snapshot reopens tabs by URL. Smart activation cannot cancel the reload Firefox starts when it focuses a discarded tab.

## Contributing

See CONTRIBUTING.md. Feature work lands on develop via pull request. main is updated only by PR from develop.
