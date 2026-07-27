---
name: review-triage
description: >-
  Fetch AMO ratings/reviews for Artek Tab Vault, present the unresolved ones
  with a diagnosis and suggested fix per review, and only reply to AMO after
  the user decides what to do with each one. Manual only - invoke by name
  when the user explicitly asks to check, triage, or handle reviews. Never
  run automatically after a release or any other trigger.
disable-model-invocation: true
---

# Review Triage (Artek Tab Vault)

Manual-only. Do not run this on your own initiative (not after a release, not on a schedule) - only when the user explicitly asks to check/handle reviews.

## Step 1 — Fetch unresolved reviews

```bash
source ~/.config/web-ext-keys/artek-tab-vault-amo.env
node scripts/review-triage.js list
```

Returns AMO ratings not yet recorded in `reviews-state.json`. If `unresolved` is empty, tell the user there's nothing new and stop here. A 401 error here means the add-on has no approved public version yet (status "nominated") — ratings aren't fetchable until AMO approves the first listed version; tell the user that instead of treating it as a script bug.

## Step 2 — Present the list, do not reply yet

For each unresolved review, show the user:
- Score + review text
- Your diagnosis of the actual complaint
- A suggested resolution: **add to roadmap** (new or existing `ROADMAP.md` item), **already fixed** (name the version), **won't fix** (API/platform limitation - see `LISTING.md` known limitations), or **needs clarification**

Do not post anything to AMO in this step. Wait for the user's decision on each item.

## Step 3 — Act on the user's decisions

Per review, depending on what the user decided:
- **Add to roadmap** → update `ROADMAP.md` first, then draft a reply such as "Thanks for the feedback - we've added this to our roadmap and will work on it."
- **Won't fix** → draft a short, honest explanation of the constraint.
- **Already fixed** → draft a reply pointing to the version that fixed it, asking them to update.
- **Skip without replying** → `node scripts/review-triage.js mark-handled <id> "<why skipped>"` so it doesn't resurface next time.

Show the drafted reply text to the user before posting it — it's public and can't be unsent.

## Step 4 — Post the reply

```bash
source ~/.config/web-ext-keys/artek-tab-vault-amo.env
node scripts/review-triage.js reply <rating_id> "<reply text>"
```

This posts to AMO and records the review as handled in `reviews-state.json` automatically.

## Step 5 — Commit

Commit `reviews-state.json` (and `ROADMAP.md` if changed) to `develop`.
