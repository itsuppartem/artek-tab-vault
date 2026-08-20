# AMO Product Page — what to paste where

Developer Hub → **Edit Product Page**. Icons and screenshots live in this `listing/` folder.

Canonical full description: `../LISTING.md`. Ready-made snippets for each Hub field are below.

## Auto-fill via the AMO API

```bash
source ~/.config/web-ext-keys/artek-tab-vault-amo.env
node scripts/fill-amo-listing.js          # meta + icon + previews
node scripts/fill-amo-listing.js meta     # text / tags / icon only
node scripts/fill-amo-listing.js previews # screenshots (if throttled)
```

The API does not set Support Email — that value is not in the repo; enter it by hand in Hub.

---

## Describe Add-on

### Name
```
Artek Tab Vault
```

### Summary (already set — leave it)
```
Crash-proof tab session backup and idle tab memory guardian for Firefox.
```

### Description (en-US) — paste in full
Copy the **Description (full, en-US)** block from `../LISTING.md` (between the triple backticks).

Do not rewrite it by hand, so the live listing and the repo stay in sync.

### Description (ru-RU) — optional but recommended
Copy the **Description (ru-RU)** block from `../LISTING.md`.
In Developer Hub: add the **Русский** locale and paste the Russian text there.

### Experimental?
`This add-on is ready for general use.` — leave as is (No).

### Requires Payment?
`This add-on doesn't require any additional payments…` — leave as is (No).

### Categories
`Tabs` — already set.

### Email (Support Email)
Use a work address you will actually answer. It is not stored in this repo — fill it in Hub.

---

## Images

### Add-on icon
Upload by size:

| Size   | File |
|--------|------|
| 32x32  | amo-icon-32.png |
| 64x64  | amo-icon-64.png |
| 128x128| amo-icon-128.png |

Source: the orange vault mark in ../icons/icon.svg.

### Store images (upload order)

Real captures of the extension UI, not generated mockups:

1. screenshot-01-popup.png — popup
2. screenshot-02-options.png — Guardian / settings
3. screenshot-03-backup.png — backup / retention

Regenerate via the store-assets script in package.json.

Captions, en-US:

1. Popup: session snapshots, discard controls, and per-tab active/loaded/discarded state.
2. Settings: Guardian options, unsaved-form protection, title marker, whitelist.
3. Backup retention presets, size limits, export/import, prune history.

ru-RU captions stay in Russian (they are store-listing copy, not repo docs).

---

## Additional Details

### Tags (comma-separated, or one per field in Hub)
```
tabs
session
backup
memory
discard
productivity
privacy
crash recovery
```

### Contributions URL
Leave empty until there is a Patreon/Ko-fi (or similar). Add it here later if that changes.

### Default Locale
`English (US)` — keep.

### Homepage / Website
Leave **empty**. The repository is private — do not publish a GitHub URL on the listing.
When there is a public page or public Issues, add it here and in `scripts/fill-amo-listing.js`.

---

## Technical Details

### Developer Comments (AMO reviewers only, not public)
```
Artek Tab Vault combines two local-only features: rolling session snapshots
and idle-tab discarding via the native tabs.discard API.

Permissions notes for reviewers:
- <all_urls> is used only on-device: (1) a content script that reports a
  boolean "has unsaved form" flag so the guardian can skip that tab —
  form contents are never read, stored, or transmitted; (2) a one-shot
  content script that prefixes document.title immediately
  before tabs.discard(), because Firefox has no API to set a tab title.
- unlimitedStorage is for the local snapshot history when the user raises
  the size cap; nothing is uploaded.
- tabGroups is used to capture/restore native Firefox tab group name/color.
- notifications is used for the optional crash-restore prompt after an
  unclean shutdown.
- No remote code, no analytics, no third-party servers. Data never leaves
  the user's machine.

Source and tests: the GitHub repository linked as Homepage. Jest unit tests
cover pure logic in core.js; CI runs on every push.
```

### Whiteboard
Leave empty.

---

## Checklist before Submit changes

- [ ] Description en-US pasted from LISTING.md
- [ ] Description ru-RU (recommended)
- [ ] Email filled in
- [ ] Homepage left empty (private repo)
- [ ] Icons 32/64/128 uploaded
- [ ] Three store images uploaded with captions
- [ ] Tags added
- [ ] Developer Comments pasted
- [ ] Save (Submit Changes)

After save, the AMO page updates; reviewers of a pending version will see the filled listing.
