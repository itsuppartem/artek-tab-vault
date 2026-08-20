# AMO Product Page — field guide

Developer Hub → **Edit Product Page**. Icon and screenshot files live in this listing/ folder.

Canonical full description: ../LISTING.md. Below are ready-to-paste pieces for each form field.

## Auto-fill via the AMO API

```bash
source ~/.config/web-ext-keys/artek-tab-vault-amo.env
node scripts/fill-amo-listing.js          # meta + icon + previews
node scripts/fill-amo-listing.js meta     # только текст/теги/иконка
node scripts/fill-amo-listing.js previews # добить скриншоты (если throttle)
```

Support Email is not filled by the API and is not in the repo; set it in Hub.

---

## Describe Add-on

### Name
```
Artek Tab Vault
```

### Summary (already set)
```
Crash-proof tab session backup and idle tab memory guardian for Firefox.
```

### Description (en-US) — paste in full
Copy the Description (full, en-US) block from ../LISTING.md.

Do not rewrite it by hand so the listing and repo stay in sync.

### Description (ru-RU) — optional but recommended
Copy the Description (ru-RU) block from ../LISTING.md.
In Developer Hub, add the Russian locale and paste the Russian store copy.

### Experimental?
`This add-on is ready for general use.` — оставь как есть (No).

### Requires Payment?
`This add-on doesn't require any additional payments…` — оставь как есть (No).

### Categories
`Tabs` — уже стоит, ок.

### Email (Support Email)
Поставь свой рабочий email (тот, на который готов отвечать юзерам).  
Пока в репо email не зашит — заполни вручную в Hub.

---

## Images

### Add-on icon
Загрузи по размерам:

| Size   | File |
|--------|------|
| 32×32  | `amo-icon-32.png` |
| 64×64  | `amo-icon-64.png` |
| 128×128| `amo-icon-128.png` |

Источник — оранжевая vault-иконка из `../icons/icon.svg`.

### Screenshots (порядок загрузки)

Реальные скрины из headless Firefox (`npm run screenshots`), не AI-мокапы:

1. `screenshot-01-popup.png` — попап  
2. `screenshot-02-options.png` — Guardian / настройки  
3. `screenshot-03-backup.png` — бэкап / retention  

Переснять: `npm run screenshots` (реальный UI через Chromium + puppeteer).

Подписи (Caption), en-US:

1. ```Popup: session snapshots, discard controls, and per-tab active/loaded/discarded state.```
2. ```Settings: Guardian options, unsaved-form protection, title marker, whitelist.```
3. ```Backup retention presets, size limits, export/import, prune history.```

ru-RU:

1. ```Попап: снимки сессии, выгрузка вкладок и статус каждой вкладки.```
2. ```Настройки Guardian: формы, умная активация, префикс 💤, белый список.```
3. ```Бэкап: профили хранения, лимиты, экспорт/импорт, журнал обрезки.```

---

## Additional Details

### Tags (через запятую / по одному в Hub)
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
Оставь пустым, пока нет Patreon/Ko-fi.  
Если появится — вставь сюда позже.

### Default Locale
`English (US)` — ок.

### Homepage / Website
Оставь **пустым**. Репозиторий приватный — публичный GitHub URL на listing нельзя.
Когда появится публичная страница / публичные Issues — вставь сюда и в `scripts/fill-amo-listing.js`.

---

## Technical Details

### Developer Comments (только для ревьюеров AMO, не публично)
```
Artek Tab Vault combines two local-only features: rolling session snapshots
and idle-tab discarding via the native tabs.discard API.

Permissions notes for reviewers:
- <all_urls> is used only on-device: (1) a content script that reports a
  boolean "has unsaved form" flag so the guardian can skip that tab —
  form contents are never read, stored, or transmitted; (2) a one-shot
  content script that prefixes document.title (e.g. "💤 ") immediately
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
Оставь пустым.

---

## Checklist before submitting changes

- [ ] Description en-US вставлена из LISTING.md
- [ ] Description ru-RU (желательно)
- [ ] Email заполнен
- [ ] Homepage = GitHub URL
- [ ] Иконки 32/64/128 загружены
- [ ] 3 скриншота загружены с captions
- [ ] Tags добавлены
- [ ] Developer Comments вставлены
- [ ] Сохранить (Submit Changes)

После сохранения страница AMO обновится; версия 0.2.0 останется в Awaiting Review — ревьюеры увидят уже заполненный listing.
