# ⚠️ DEPRECATED — Expo mobile app

**Status:** Deprecated as of 2026-07-06. No longer maintained.

**Replaced by:** the AlertOps PWA served at **`/m`** in the web app
([`web/src/app/m`](../web/src/app/m)). The PWA delivers the same
never-miss alert experience (Web Push / VAPID, MCQ replies, offline-capable
service worker) and runs on cheap Android phones without an app-store install or
an EAS build pipeline — which is why it superseded this Expo client.

## Why this is deprecated

Maintaining a second, native alert client (Expo Router + `expo-notifications` +
EAS builds + store credentials) doubled the surface area for every alert-flow
change with no user benefit the PWA doesn't already cover. The PWA is now the
single supported mobile client.

## What this means

- **Do not** add features here. Ship mobile changes in the PWA (`web/src/app/m`).
- This directory is kept for reference/history only; it is **not built by CI**
  and is not part of any deployment.
- `npm`/`expo` scripts here print a deprecation warning before running.

## Planned removal

This directory is slated for deletion once we're confident nothing references it.
If you have a reason to keep it, note it here. Otherwise it can be removed with:

```bash
git rm -r mobile
```

For anything mobile, start from the PWA: [`web/src/app/m`](../web/src/app/m).
