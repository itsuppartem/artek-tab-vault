# Artek Tab Vault — Development Roadmap

Backlog below is prioritized from real-world pain points found in Reddit threads, AMO reviews, and GitHub issues of competing tab-management/session-backup extensions (Tab Session Manager, Auto Tab Discard, The Tab Suspender), researched 2026-07-27.

All work happens on `develop` (see `.cursor/rules/release-policy.mdc`). Update the status column as items progress.

| # | Feature | Why (pain point observed) | Status |
|---|---------|---------------------------|--------|
| 1 | **Snapshot integrity guard** | Tab Session Manager silently wiped years of sessions on update; has a "self-defense" bug that deletes saves above 10 tabs. Never persist an empty/corrupted snapshot over a good one; keep rolling history, not a single last-known-good file. | Done (unreleased) |
| 2 | **Smart tab activation on close** | #1 complaint across all discard-based suspenders: closing a tab jumps focus to a discarded neighbor, forcing an unwanted reload. Activate the next *non-discarded* tab instead. | Planned |
| 3 | **Native Tab Groups support** | Competing tools lose Firefox's built-in tab group name/color on restore. Capture and restore `tabGroups` metadata in snapshots. | Planned |
| 4 | **Unsaved-form protection** | Auto Tab Discard's most-requested safety feature: don't discard a tab with an unsubmitted form. Needs a content-script check. | Planned |
| 5 | **Proactive crash-restore prompt** | Users currently must remember to open the popup after a crash. Detect an unclean shutdown/restart and proactively offer to restore the last snapshot. | Planned |
| 6 | **Restore-into-current-window option** | Restoring always opens new windows, doubling memory if old ones are still around. Add an option to restore into the current window or close existing tabs first. | Planned |
| 7 | **Tolerant snapshot import** | Competitor import (e.g. Session Buddy JSON) frequently fails with cryptic errors. Accept at least one common external export format in our importer. | Planned |
| 8 | **Visible discarded/loaded state per tab** | Users can't currently tell which tabs are unloaded vs active just by looking at the tab strip - the toolbar badge only shows a total count. Mark discarded tabs distinctly (dim favicon / icon overlay / title prefix) so it's visible at a glance, and show per-tab memory usage where the browser actually exposes it. Note: Firefox's WebExtension API has no per-tab RAM number - `browser.tabs` never reports memory, so exact "N MB" per tab isn't achievable without a native API that doesn't exist. Deliver via `about:unloads`-style breakdown in the popup instead (tab list with discarded/active state per row), and only show real byte counts if/when Mozilla ships such an API. | Planned |

## Process

- Every item above needs Jest coverage in `tests/` before being marked Done (see `.cursor/rules/testing-required.mdc`).
- Pure decision logic goes in `core.js` so it stays unit-testable without a browser.
- CI (`.github/workflows/ci.yml`) must be green on `develop` before merging to `prod`.
