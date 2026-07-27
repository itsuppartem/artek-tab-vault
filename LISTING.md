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
  single bad save can't wipe your history.
- One-click restore of any snapshot, plus manual "backup now".
- Export/import snapshots as JSON for manual backup or moving machines.

Guardian: automatic memory relief
- Automatically discards (unloads) tabs that have been idle for a
  configurable number of minutes, freeing RAM and CPU without closing them.
- Never touches the active tab, pinned tabs, or tabs playing audio.
- Domain whitelist: tell it to never discard specific sites (e.g. your email,
  a long-running dashboard).
- "Discard all except current" one-click button and keyboard shortcut.
- Badge on the toolbar icon shows how many tabs are currently discarded.

WHAT IT DOESN'T DO (known limitations)
- Firefox's extension APIs don't expose real per-tab RAM usage, so discarding
  decisions are based on idle time, not measured memory.
- Restoring a snapshot reopens tabs by URL; it doesn't restore in-page
  browsing history or unsaved form state.

PERMISSIONS
- tabs / storage / alarms / idle / notifications - all used strictly for the
  features above. No browsing data ever leaves your machine.

Feedback and bug reports are welcome via the support site/homepage link on
this page - please leave a review if something doesn't work as expected
instead of just a low rating, so it can actually get fixed.
```

## Release notes policy

Every listed version submitted to AMO must carry release notes describing **user-visible** changes only (skip internal refactors, CI changes, etc. unless they affect behavior). Source of truth is `CHANGELOG.md` — copy the entry for the version being released into `amo-metadata.json` → `version.release_notes.en-US` before signing.

## User feedback loop

- Check AMO reviews after every release (Developer Hub → Ratings & Reviews) and reply to at least critical/1-3 star reviews — most are fixable misunderstandings (permissions, expected behavior) and a reply closes the loop publicly.
- If a review reports a real bug, add it to `ROADMAP.md` before replying so the fix is tracked, not just promised.
