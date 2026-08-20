# Contributing

## Branch policy

- Do feature and fix work on a topic branch (`feature/...`, `fix/...`).
- Open pull requests **into develop**.
- develop to main happens **only via pull request**.
- Never push commits directly to main.

## Checks

Run the Jest suite before opening a PR. CI runs the same command on main and develop.

Local web-ext lint is useful before a store upload, but it is not part of CI.

## Tests

- New behavior and bug fixes need coverage under tests/.
- Keep the existing tests/core.test.js cases; extend them instead of weakening them.
- Pure decision logic belongs in core.js so it can be unit-tested without Firefox.

## Addon UI translations

The _locales/en, ru, kk, uk, be, and sr trees are shipped UI strings. Do not remove those locales. Repo documentation is English; the addon UI stays localized.
