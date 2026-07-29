# AMO Product Page — что куда вставить

Developer Hub → **Edit Product Page**. Файлы иконок/скриншотов лежат в этой же папке `listing/`.

Канонический полный текст описания: `../LISTING.md`. Ниже — готовые куски под каждое поле формы.

## Автозаливка через AMO API

```bash
source ~/.config/web-ext-keys/artek-tab-vault-amo.env
node scripts/fill-amo-listing.js          # meta + icon + previews
node scripts/fill-amo-listing.js meta     # только текст/теги/иконка
node scripts/fill-amo-listing.js previews # добить скриншоты (если throttle)
```

Email (Support Email) API не заполняет — его нет в репо; поставь руками в Hub.

---

## Describe Add-on

### Name
```
Artek Tab Vault
```

### Summary (уже стоит — можно не трогать)
```
Crash-proof tab session backup and idle tab memory guardian for Firefox.
```

### Description (en-US) — вставь целиком
Скопируй блок **Description (full, en-US)** из `../LISTING.md` (между тройными кавычками).

Коротко: полный текст уже там; не переписывай руками, чтобы listing и код не разъехались.

### Description (ru-RU) — опционально, но желательно
Скопируй блок **Description (ru-RU)** из `../LISTING.md`.
В Developer Hub: добавь locale **Русский** и вставь туда русский текст.

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
1. `screenshot-01-popup.png` — попап: счётчики, Guardian, снимки, индикаторы вкладок  
2. `screenshot-02-options.png` — страница настроек: пресеты, retention, whitelist  
3. `screenshot-03-crash-prompt.png` — уведомление о crash-restore  

Подписи к скриншотам (Caption), en-US:

1. ```Popup: session snapshots, discard controls, and per-tab active/loaded/discarded state.```
2. ```Settings: Guardian options, retention presets, whitelist, export/import.```
3. ```After an unclean shutdown, a notification offers to restore the last backup.```

ru-RU captions (если добавишь русскую локаль):

1. ```Попап: снимки сессии, выгрузка вкладок и статус каждой вкладки.```
2. ```Настройки: Guardian, профили хранения, белый список, экспорт/импорт.```
3. ```После «грязного» завершения Firefox предлагает восстановить последний бэкап.```

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
```
https://github.com/itsuppartem/artek-tab-vault
```
(репозиторий приватный — если AMO/юзеры не смогут открыть Issues, либо сделай публичным README-only, либо поставь публичную страницу / Issues позже. Пока GitHub URL — лучший вариант из имеющихся.)

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

## Чеклист перед Submit changes

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
