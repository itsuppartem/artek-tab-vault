# AMO Listing Copy — Artek Tab Vault

Canonical text for the addon's product page on addons.mozilla.org. Paste the relevant section into the corresponding field in Developer Hub → Edit Product Page whenever it drifts from what's below. This file is the source of truth — the live AMO listing must always match it.

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
- "Discard all except current" one-click button and keyboard shortcut.
- Popup shows every tab in the current window with a clear
  active/loaded/discarded indicator, plus a toolbar badge with the total
  discarded count.

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
- Access to all sites (a content script running on every page) - used only
  to detect, on-device, whether a page has an unsubmitted form so that tab
  can be skipped by the memory guardian. It never reads, stores, or sends
  the form's contents anywhere - only a true/false "was something typed"
  flag stays in memory for that tab.
- No browsing data ever leaves your machine.

Feedback and bug reports are welcome via the support site/homepage link on
this page - please leave a review if something doesn't work as expected
instead of just a low rating, so it can actually get fixed.
```

## Release notes policy

Every listed version submitted to AMO must carry release notes describing **user-visible** changes only (skip internal refactors, CI changes, etc. unless they affect behavior). Source of truth is `CHANGELOG.md` — copy the entry for the version being released into `amo-metadata.json` → `version.release_notes.en-US` before signing.

## User feedback loop

- Reviews are **not** replied to automatically or right after a release. They're triaged in a dedicated manual pass: run the `review-triage` skill (`.cursor/skills/review-triage/SKILL.md`) whenever the user explicitly asks to check reviews.
- That skill fetches unresolved reviews, proposes a diagnosis/fix per review, waits for the user's decision (add to roadmap or not), and only then posts a reply reflecting that decision.
