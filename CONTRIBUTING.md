# Contributing

Repo documentation and GitHub (issues, pull requests, commits, comments) are English. The addon UI stays localized in _locales/ (en, ru, kk, uk, be, sr). Do not remove those locales.

## Working rules

| Branch | Role |
| --- | --- |
| develop | Daily work. Open feature and fix pull requests here. |
| main | Released product only. |
| feature/... or fix/... | Topic branches. Delete them after merge. Never delete develop. |

- develop is daily work. Feature and fix PRs target develop.
- main is released product only. develop to main is the release, and it happens only via pull request.
- Never push commits directly to main.
- Issues first. Open or update an issue before starting work, then mention it from the PR.
- Ship tests and docs in the same PR as the code (README, CHANGELOG, CONTRIBUTING as needed).
- Jest job test is the merge gate. The firefox job is a canary not the merge gate (it may flake).
- Close issues only after reading CI logs and confirming the new Jest names appear there.

## Checks

Run the Jest suite before opening a PR.

CI runs two jobs on main, develop, and pull requests.
- test: Jest. This is the merge gate.
- firefox: live Firefox e2e canary.

Local web-ext lint is useful before a store upload, but it is not part of CI.

Live Firefox e2e needs firefox and geckodriver on PATH. Locally the script skips if either is missing unless CI is true.

## Tests

- New behavior and bug fixes need coverage under tests/.
- Keep the existing tests/core.test.js cases; extend them instead of weakening them.
- Pure decision logic belongs in core.js so it can be unit-tested without Firefox.
- tests/e2e/firefox.e2e.js is a live runner, not a Jest file.

## Releases

Tag v* on the released product, or run the Release workflow with workflow_dispatch, to run Jest, build the addon zip, and create a GitHub Release. The workflow does not sign for the store.

## Addon UI translations

The _locales/en, ru, kk, uk, be, and sr trees are shipped UI strings. Do not remove those locales. Repo documentation is English; the addon UI stays localized.
