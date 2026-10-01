# Tokea System

Mobile first PWA that runs your Tokea Days: an endless activity loop that starts itself with a notification, shows what you should be doing and until when, asks for a tick or X before each activity ends, and books a fair fine when something is missed. All data stays in the browser (`localStorage`, key `daydriver:v1`).

## Run

```sh
npm install
npm run dev
```

Open the printed local URL on a phone-width viewport.

## Verify

```sh
npm run verify
```

Runs `vite build`, `vitest` (schedule generation, topic rotation, storage migration), and `tsc --noEmit`. Exits 0 when everything passes.

## Notes

- Installable PWA: after first load it opens and logs data offline.
- Export JSON / reset live under More → Settings.
- No accounts, no server, no analytics.
