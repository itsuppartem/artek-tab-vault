# AMO Product Page — fill-in guide

Everything needed for Developer Hub → **Edit Product Page** for Artek Tab Vault,
field by field, in the order the page shows them. The two long texts (summary and
description) live in `../LISTING.md` — that file stays the single source of truth;
this one covers the fields around them plus the assets to upload.

Add-on: https://addons.mozilla.org/en-US/developers/addon/163825d560024587b5b4/

---

## Describe Add-on

### Name
```
Artek Tab Vault
```
Already set. Leave as is.

### Add-on URL (slug)
Currently the auto-generated hash `163825d560024587b5b4`, which makes the public
URL unreadable and unsearchable. Change it to:
```
artek-tab-vault
```
Public page then becomes `https://addons.mozilla.org/firefox/addon/artek-tab-vault/`.
Do this **before** the listing gets traffic — changing the slug later breaks any
links already shared.

### Summary
Already set, matches `amo-metadata.json` → `summary.en-US`:
```
Crash-proof tab session backup and idle tab memory guardian for Firefox.
```

Russian locale (add under "Localize for: Русский"):
```
Бэкап сессий вкладок и авто-выгрузка простаивающих вкладок из памяти.
```

### Description
Currently empty — this is the biggest gap on the page. Paste the block from
`../LISTING.md` → "Description (full, en-US)" for the English locale, and the
block from "Description (ru-RU)" for the Russian locale.

AMO strips most HTML here; plain text with blank lines between paragraphs is
what the canonical text is written for. Don't reflow it by hand — edit
`LISTING.md` and re-paste, so the live page and the repo never drift.

### Experimental?
`This add-on is ready for general use.` — already correct.

### Requires Payment?
`No additional payments/services/hardware` — already correct.

### Categories
`Tabs` — already correct, and the right primary fit. AMO allows a second
category; `Privacy & Security` is a poor match (nothing here is a privacy tool),
so leaving just Tabs is deliberate, not an omission.

### Email
Support address shown publicly on the listing. Needs a real, monitored inbox —
AMO reviewers also use it for policy questions. Not filled yet (decision needed).

### Website
Homepage link on the listing. The GitHub repo is public. Use the repository URL as the listing homepage and
the Issues page as the support site.

---

## Images

### Add-on icon
The listing icon comes from the icon in the submitted version's `manifest.json`.
AMO doesn't render SVG there, which is why the page shows the default green
puzzle piece today.

Fixed in the repo: `icons/icon-48.png`, `icons/icon-96.png`, `icons/icon-128.png`
are now generated and referenced from the manifest. The real icon replaces the
puzzle piece **once a version carrying these PNGs is submitted and approved** —
version 0.2.0 (currently awaiting review) still has the SVG-only manifest, so this
lands with the next release.

### Screenshots
Three ready to upload, in this order, from `screenshots/`:

| File | Caption (en-US) | Caption (ru-RU) |
|------|-----------------|-----------------|
| `01-popup.png` (850×1960) | Popup: tab counts, guardian controls, session snapshots, and per-tab active/loaded/discarded state | Попап: счётчики вкладок, управление guardian, снимки сессий и состояние каждой вкладки |
| `02-guardian-settings.png` (1500×1700) | Guardian settings: idle threshold, unsaved-form protection, discarded-tab title marker, domain whitelist | Настройки guardian: порог простоя, защита форм, метка в заголовке, белый список доменов |
| `03-backup-retention.png` (1500×2450) | Backup retention: Balanced 5 min interval, count and size limits with presets, and a visible log of every trim | Хранение бэкапов: интервал, лимиты по количеству и размеру с профилями, журнал обрезки |

Regenerate them with `npm run screenshots` after any UI change, so the store
never shows a stale interface.

---

## Additional Details

### Tags
Picked from AMO's fixed tag list, most relevant first (max 10 allowed, these 6
are enough — irrelevant tags dilute search relevance rather than help it):
```
tabs
memory
session
backup
productivity
performance
```

### Contributions URL
Optional donation link (GitHub Sponsors, Ko-fi, Buy Me a Coffee, Liberapay…).
Leave empty unless there's a real page — AMO rejects links that aren't on its
allowed donation-host list (decision needed).

### Default locale
`English (US)` — keep as the default. The addon UI is localized; still fill the
Russian locale for summary/description so AMO visitors in ru-RU see native copy.

### Homepage
Same consideration as Website above. If the repo goes public, use the repo URL
for Homepage and the issues page as the support site.

---

## Technical Details

### Developer Comments
Public, shown on the listing page. Sets expectations that otherwise turn into
one-star reviews:
```
Two deliberate design choices worth knowing before you install:

1. Tab discarding uses Firefox's native tabs.discard() API rather than replacing
   pages with a placeholder. That means nothing breaks if you disable or remove
   this extension - your tabs are ordinary tabs the whole time - but it also
   means Firefox, not this extension, decides when a discarded tab reloads.

2. Firefox exposes no per-tab memory figure to extensions, so the guardian acts
   on idle time rather than measured RAM, and the popup shows each tab's
   loaded/discarded state instead of a fake megabyte number.

The interface follows Firefox's language (English, Russian, Kazakh, Ukrainian,
Belarusian, Serbian). Bug reports and feature requests are read - please describe
the problem in a review or on the support page rather than leaving a bare low rating.
```

### UUID
`artek-tab-vault@artek.local` — set by the manifest, not editable here.

### Whiteboard
Private, visible only to AMO reviewers. Filling it in speeds up review of the
broad host permission, which is the one thing likely to slow this add-on down:
```
Source layout: no build step, no bundler, no minification. The submitted package
is the source as written.

- core.js       - pure logic (no browser.* calls), unit-tested with Jest
- background.js - alarms/tabs/storage wiring
- popup/, options/ - UI pages
- content-scripts/dirty-form.js - reports only a boolean

Why <all_urls> is requested (both uses are local-only, nothing is transmitted):

1. content-scripts/dirty-form.js checks whether the page has an unsubmitted form
   and answers a single true/false to the background script, so the memory
   guardian can skip discarding a tab that holds typed-in input. Form contents
   are never read, stored, or sent.

2. content-scripts/mark-discarded.js is injected programmatically, once, right
   before tabs.discard(), to prepend a marker (default "💤 ") to that tab's own
   document.title. Firefox has no API to set a tab title, and the marker is the
   only way to show discarded state in the native tab strip. It touches nothing
   else on the page.

No remote code, no analytics, no network requests of any kind. All data
(settings, session snapshots) stays in browser.storage.local; unlimitedStorage is
requested only because users can raise the snapshot history size limit above the
default local-storage quota.

To exercise the extension: open the toolbar popup, press "Discard all except current"
with a few tabs open, then "Backup now" and restore the snapshot from the list.
```

---

## Still needs a decision from the owner

- Support **Email** address for the listing.
- **Website/Homepage**: public GitHub repository URL.
- **Contributions URL**: donation link, or none.
