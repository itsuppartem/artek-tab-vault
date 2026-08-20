# AMO Listing Copy — Artek Tab Vault

Canonical text for the addon's product page on addons.mozilla.org. Paste the relevant section into the corresponding field in Developer Hub → Edit Product Page whenever it drifts from what's below. This file is the source of truth — the live AMO listing must always match it.

**How to fill every Hub field (icons, screenshots, tags, developer comments):** see [`listing/AMO-FILL.md`](listing/AMO-FILL.md). Assets live in [`listing/`](listing/).

## Summary (short, ~250 chars max)

> Crash-proof tab session backup and idle tab memory guardian for Firefox.

Kept in sync with `amo-metadata.json` → `summary.en-US`.

## Description (full, en-US)

```
Artek Tab Vault fixes two of the most common Firefox pain points: losing every
open tab after a crash or update, and Firefox slowly eating your RAM with
dozens of tabs open.

WHAT IT DOES

Independent session backup
- Takes a rolling snapshot of every open window and tab on an interval you
  control, completely independent of Firefox's own session restore (which
  can and does fail on crash or update).
- Keeps a configurable number of past snapshots, not just the last one, so a
  single bad save can't wipe your history. Never persists a corrupted/empty
  snapshot over a good one.
- Optional size cap (MB) for the whole backup history on top of the snapshot
  count limit, with three ready-made presets (compact/balanced/archivist).
  Every time old snapshots actually get trimmed - or a snapshot gets skipped
  as empty/corrupted - it's recorded in a visible log in settings, so
  retention is never a silent surprise.
- Captures and restores native Firefox tab groups (name, color) where the
  browser supports the tabGroups API.
- One-click restore of any snapshot, plus manual "backup now".
- Restore into a new window (default) or straight into your current window,
  so you're not doubling up memory with duplicate windows.
- Export/import snapshots as JSON. Import also tolerates plain URL lists and
  a few common export shapes from other tab/session managers, skipping only
  the individual entries it can't understand instead of failing outright.
- Detects a likely crash/unclean shutdown on the next Firefox launch and
  proactively notifies you to restore the last backup.

Guardian: automatic memory relief
- Automatically discards (unloads) tabs that have been idle for a
  configurable number of minutes, freeing RAM and CPU without closing them.
- Never touches the active tab, pinned tabs, tabs playing audio, or (by
  default) a tab with an unsubmitted form - so you don't lose typed input.
- Domain whitelist: tell it to never discard specific sites (e.g. your email,
  a long-running dashboard).
- Smart tab activation: when the active tab is closed, immediately hands
  focus to the nearest already-loaded tab instead of leaving you staring at
  a discarded neighbor reloading itself.
- Marks discarded tabs right in Firefox's own tab strip/sidebar with a
  configurable title prefix (default "💤 ") - so you can tell at a glance
  without opening the popup.
- "Discard all except current" one-click button and keyboard shortcut.
- Popup shows every tab in the current window with a clear
  active/loaded/discarded indicator, plus a toolbar badge with the total
  discarded count.
- Every button (discard, backup, restore, save, reset, export/import,
  presets) gives instant visual confirmation - a press animation plus a
  brief "✓ done" flash and a text summary - so you always know an action
  actually went through.
- Localized UI: English, Russian, Kazakh, Ukrainian, Belarusian, and
  Serbian, following Firefox's language setting.

WHAT IT DOESN'T DO (known limitations)
- Firefox's extension APIs don't expose real per-tab RAM usage, so discarding
  decisions are based on idle time, not measured memory, and the popup shows
  discarded/loaded state rather than a byte count.
- Restoring a snapshot reopens tabs by URL; it doesn't restore in-page
  browsing history, scroll position, or unsaved form state from before the
  backup was taken.
- Firefox gives extensions no way to cancel the reload it starts when it
  auto-activates a discarded tab; "smart tab activation" moves your focus off
  it immediately afterwards, it can't prevent the reload from starting.

PERMISSIONS
- tabs / storage / alarms / idle / notifications / tabGroups - used strictly
  for the backup, guardian, and tab-group-restore features above.
- unlimitedStorage - lets the local backup history grow past the browser's
  default ~5-10MB local-storage quota when you raise the size limit above the
  default; still fully local, nothing is uploaded anywhere.
- Access to all sites - used for two on-device-only things: (1) a content
  script that detects whether a page has an unsubmitted form, so that tab
  can be skipped by the memory guardian (only a true/false flag is kept, the
  form's contents are never read, stored, or sent anywhere); (2) rewriting a
  tab's own title (e.g. adding "💤 ") right before discarding it, since
  Firefox has no dedicated API for that. Neither use ever transmits data off
  your machine.
- No browsing data ever leaves your machine.

Feedback and bug reports are welcome via the support site/homepage link on
this page - please leave a review if something doesn't work as expected
instead of just a low rating, so it can actually get fixed.
```

## Description (ru-RU)

The addon UI is localized (English default plus ru/kk/uk/be/sr). AMO also carries
a Russian product-page translation next to the English default locale. Keep both
in sync when either changes.

```
Artek Tab Vault закрывает две самые частые боли Firefox: потерю всех открытых
вкладок после падения или обновления браузера и постепенное «отжирание»
оперативной памяти десятками открытых вкладок.

ЧТО УМЕЕТ

Независимый бэкап сессий
- Делает регулярные снимки всех окон и вкладок с выбранным вами интервалом,
  полностью независимо от встроенного восстановления сессии Firefox (которое
  вполне может не сработать после краша или обновления).
- Хранит не последний снимок, а настраиваемое их количество, поэтому одна
  неудачная запись не уничтожит историю. Пустой/битый снимок никогда не
  запишется поверх хорошего.
- Отдельный лимит размера всей истории в МБ поверх лимита по количеству, плюс
  три готовых профиля (компактный / сбалансированный / архивариус). Каждое
  срабатывание лимита - и каждый пропущенный пустой снимок - видно в журнале в
  настройках, так что история никогда не пропадает молча.
- Сохраняет и восстанавливает нативные группы вкладок Firefox (имя, цвет) там,
  где браузер поддерживает API tabGroups.
- Восстановление любого снимка в один клик и кнопка «сделать бэкап сейчас».
- Восстановление в новое окно (по умолчанию) или прямо в текущее, чтобы не
  плодить дубли окон и не удваивать расход памяти.
- Экспорт/импорт снимков в JSON. Импорт понимает и простые списки ссылок, и
  несколько распространённых форматов других менеджеров вкладок, пропуская
  только те записи, которые не удалось разобрать, а не весь файл.
- Замечает вероятный краш или «грязное» завершение и при следующем запуске
  Firefox сам предлагает восстановить последний бэкап.

Guardian: автоматическая разгрузка памяти
- Автоматически выгружает вкладки, простаивающие заданное число минут:
  освобождает RAM и CPU, не закрывая их.
- Никогда не трогает активную вкладку, закреплённые вкладки, вкладки со звуком
  и (по умолчанию) вкладки с незаполненной формой - чтобы не потерять ввод.
- Белый список доменов: сайты, которые выгружать нельзя никогда (почта,
  дашборд и т.п.).
- Умная активация: при закрытии активной вкладки фокус сразу уходит на уже
  загруженную соседнюю, а не на выгруженную, которая тут же начнёт
  перезагружаться.
- Помечает выгруженные вкладки прямо в списке вкладок Firefox настраиваемым
  префиксом в заголовке (по умолчанию «💤 ») - видно, не открывая попап.
- Кнопка и горячая клавиша «выгрузить все, кроме текущей».
- В попапе видно каждую вкладку текущего окна с индикатором
  активна / загружена / выгружена и счётчик выгруженных на иконке.
- Каждая кнопка даёт мгновенное подтверждение - анимация нажатия, зелёная
  вспышка «✓ готово» и текстовая сводка, - чтобы было понятно, что действие
  сработало.

ЧЕГО РАСШИРЕНИЕ НЕ ДЕЛАЕТ (известные ограничения)
- API Firefox не отдаёт расширениям реальный расход памяти по вкладкам, поэтому
  решения о выгрузке принимаются по времени простоя, а не по замеренной памяти,
  и в попапе показывается состояние вкладки, а не мегабайты.
- Восстановление открывает вкладки по URL: история переходов внутри вкладки,
  позиция прокрутки и незасабмиченные формы на момент бэкапа не возвращаются.
- Firefox не даёт расширениям отменить перезагрузку, которую он запускает сам,
  переключаясь на выгруженную вкладку; «умная активация» лишь сразу уводит
  фокус, но не отменяет саму перезагрузку.

РАЗРЕШЕНИЯ
- tabs / storage / alarms / idle / notifications / tabGroups - строго для
  функций бэкапа, guardian и восстановления групп вкладок.
- unlimitedStorage - позволяет локальной истории бэкапов выйти за стандартную
  квоту локального хранилища (~5-10 МБ), если поднять лимит размера. Всё
  остаётся локально, никуда не выгружается.
- Доступ ко всем сайтам - нужен ровно для двух вещей, обе выполняются только на
  вашем устройстве: (1) контент-скрипт определяет, есть ли на странице
  незаполненная форма, чтобы guardian не выгрузил такую вкладку (хранится
  только флаг да/нет, содержимое формы не читается, не сохраняется и никуда не
  отправляется); (2) подмена заголовка самой вкладки (добавление «💤 ») перед
  выгрузкой, так как отдельного API для этого у Firefox нет.
- Никакие данные о вашем браузинге не покидают устройство.

Пожелания и баг-репорты - через ссылку на страницу поддержки на этой странице.
Если что-то работает не так, лучше оставить отзыв с описанием, чем просто
низкую оценку: так это можно будет починить.
```

## Release notes policy

Every listed version submitted to AMO must carry release notes describing **user-visible** changes only (skip internal refactors, CI changes, etc. unless they affect behavior). Source of truth is `CHANGELOG.md` — copy the entry for the version being released into `amo-metadata.json` → `version.release_notes.en-US` before signing.

## User feedback loop

- Reviews are **not** replied to automatically or right after a release. They're triaged in a dedicated manual pass: run the `review-triage` skill (`.cursor/skills/review-triage/SKILL.md`) whenever the user explicitly asks to check reviews.
- That skill fetches unresolved reviews, proposes a diagnosis/fix per review, waits for the user's decision (add to roadmap or not), and only then posts a reply reflecting that decision.
