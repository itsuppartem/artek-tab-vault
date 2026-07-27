---
name: release-prod
description: >-
  Merge develop into prod and publish a listed AMO release for Artek Tab
  Vault. Use ONLY when the user has explicitly approved a production
  release/deploy in the current message. Never trigger from a generic
  "deploy", "release", or "ship it" request without confirming first.
---

# Release to prod (Artek Tab Vault)

## Gate — check this first

Requires explicit, unambiguous approval in the current message, e.g. "го в прод", "пушь в прод", "подтверждаю релиз в прод". If the message doesn't clearly grant this, use `AskQuestion` to confirm before touching anything below. A generic "deploy this" is not enough.

## Workflow (only after approval)

1. Verify `develop` is green:
   ```bash
   git checkout develop
   npm test
   npm run lint
   ```
2. Bump `version` in `manifest.json` and `package.json` (semver).
3. Merge into `prod` and keep `master` in sync:
   ```bash
   git checkout prod
   git merge develop --no-ff -m "Release vX.Y.Z"
   git push
   git checkout master && git merge prod && git push
   git checkout develop
   ```
4. Sign and submit as **listed** (requires full metadata — license, categories, summary):
   ```bash
   source ~/.config/web-ext-keys/artek-tab-vault-amo.env
   npx web-ext sign --source-dir=. --channel=listed \
     --amo-metadata=$HOME/.config/web-ext-keys/artek-tab-vault-amo-metadata.json
   ```
5. Tell the user: listed submissions go through **manual AMO review** (hours to days), not instant — do not imply it's live yet.
6. Return to `develop` for further work.
