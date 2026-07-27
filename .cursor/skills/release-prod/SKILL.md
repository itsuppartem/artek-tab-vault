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
4. The push to `prod` triggers `.github/workflows/release.yml`, which runs tests + lint and signs/submits the listed AMO version automatically using the `WEB_EXT_API_KEY`/`WEB_EXT_API_SECRET` repository secrets and the committed `amo-metadata.json`. Watch the Actions run (`gh run watch` or the Actions tab) instead of signing locally.
5. Fallback (CI unavailable): sign manually with the same metadata file used by CI:
   ```bash
   source ~/.config/web-ext-keys/artek-tab-vault-amo.env
   npx web-ext sign --source-dir=. --channel=listed --amo-metadata=amo-metadata.json
   ```
6. Tell the user: listed submissions go through **manual AMO review** (hours to days), not instant — do not imply it's live yet.
7. Return to `develop` for further work.
