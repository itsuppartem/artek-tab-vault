# Artek Tab Vault — Development Roadmap

Backlog below is prioritized from real-world pain points found in Reddit threads, AMO reviews, and GitHub issues of competing tab-management/session-backup extensions (Tab Session Manager, Auto Tab Discard, The Tab Suspender), researched 2026-07-27.

All work happens on `develop` (see `.cursor/rules/release-policy.mdc`). Update the status column as items progress.

| # | Feature | Why (pain point observed) | Status |
|---|---------|---------------------------|--------|
| 1 | **Snapshot integrity guard** | Tab Session Manager silently wiped years of sessions on update; has a "self-defense" bug that deletes saves above 10 tabs. Never persist an empty/corrupted snapshot over a good one; keep rolling history, not a single last-known-good file. | Done (unreleased) |
| 2 | **Smart tab activation on close** | #1 complaint across all discard-based suspenders: closing a tab jumps focus to a discarded neighbor, forcing an unwanted reload. Activate the next *non-discarded* tab instead. | Done (unreleased) - mitigation only, see caveat below |
| 3 | **Native Tab Groups support** | Competing tools lose Firefox's built-in tab group name/color on restore. Capture and restore `tabGroups` metadata in snapshots. | Done (unreleased) |
| 4 | **Unsaved-form protection** | Auto Tab Discard's most-requested safety feature: don't discard a tab with an unsubmitted form. Needs a content-script check. | Done (unreleased) |
| 5 | **Proactive crash-restore prompt** | Users currently must remember to open the popup after a crash. Detect an unclean shutdown/restart and proactively offer to restore the last snapshot. | Done (unreleased) |
| 6 | **Restore-into-current-window option** | Restoring always opens new windows, doubling memory if old ones are still around. Add an option to restore into the current window or close existing tabs first. | Done (unreleased) |
| 7 | **Tolerant snapshot import** | Competitor import (e.g. Session Buddy JSON) frequently fails with cryptic errors. Accept at least one common external export format in our importer. | Done (unreleased) |
| 8 | **Visible discarded/loaded state per tab** | Users can't currently tell which tabs are unloaded vs active just by looking at the tab strip - the toolbar badge only shows a total count. Mark discarded tabs distinctly (dim favicon / icon overlay / title prefix) so it's visible at a glance, and show per-tab memory usage where the browser actually exposes it. Note: Firefox's WebExtension API has no per-tab RAM number - `browser.tabs` never reports memory, so exact "N MB" per tab isn't achievable without a native API that doesn't exist. Deliver via `about:unloads`-style breakdown in the popup instead (tab list with discarded/active state per row), and only show real byte counts if/when Mozilla ships such an API. | Done (unreleased) |
| 9 | **Configurable backup size/retention + prune transparency log** | Competing tools' silent history loss (see #1) isn't just about empty snapshots - a low-visibility count/size limit quietly evicting old backups is just as bad if the user can't see it happened. Add a size-based retention cap (MB, on top of the existing count cap) with sane presets ("Компактный/Сбалансированный/Архивариус"), and a visible, capped log of every time history actually got trimmed or a snapshot was rejected - so retention behavior is observable, not silent. | Done (unreleased) |
| 10 | **"zzzz" title marker on discarded tabs** | Requested directly: Auto Tab Discard prefixes a discarded tab's title (e.g. `zzzz Original Title`) so it's visible right in Firefox's own tab strip/sidebar, not just inside an extension popup. Firefox has no API to set a tab's title, so rewrite `document.title` via a one-off content script injected right before `tabs.discard()` - the browser keeps showing that cached title until the tab reloads for real. Configurable prefix text, can be turned off. | Done (unreleased) |

### Caveat on #2 (smart tab activation)

Firefox's WebExtension APIs give no way to intercept or cancel the tab-switch
Firefox performs internally when it auto-activates a neighbor after the
active tab closes - by the time our `tabs.onRemoved` listener runs, Firefox
has already started reloading whichever discarded tab it picked. What we
*can* do, and what's implemented, is immediately move focus away to the
nearest already-loaded tab so the user isn't stuck watching that reload. This
is a mitigation, not a fix — there is no known Firefox API for the fix.

## Process

- Every item above needs Jest coverage in `tests/` before being marked Done (see `.cursor/rules/testing-required.mdc`).
- Pure decision logic goes in `core.js` so it stays unit-testable without a browser.
- CI (`.github/workflows/ci.yml`) must be green on `develop` before merging to `prod`.
