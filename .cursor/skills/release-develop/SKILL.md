---
name: release-develop
description: >-
  Ship changes to the develop branch and optionally test them via an AMO
  unlisted build for Artek Tab Vault. Use for hypotheses, experiments, new
  features, bug fixes, or any request to push/commit/test changes in this
  project that isn't an explicit production release.
---

# Release to develop (Artek Tab Vault)

No approval gate here — always fine to push, experiment, and iterate.

## Workflow

1. Make sure you're on `develop`:
   ```bash
   git branch --show-current
   git checkout develop   # if not already there
   ```
2. Before every commit, run:
   ```bash
   npm test
   npm run lint
   ```
3. Commit and push freely:
   ```bash
   git add -A && git commit -m "..." && git push
   ```
4. To test on real Firefox without touching prod, sign as **unlisted** (self-distributed, no review gate, no approval needed):
   ```bash
   source ~/.config/web-ext-keys/artek-tab-vault-amo.env
   npx web-ext sign --source-dir=. --channel=unlisted
   ```
   Bump `version` in `manifest.json` + `package.json` first if a previous version was already signed.

## Hard limits

- Never merge `develop` into `prod`.
- Never run `--channel=listed`.
- Both of those belong to the `release-prod` skill and require explicit user approval first (see `.cursor/rules/release-policy.mdc`).
