# Visit Day Driver

Mobile-first PWA that drives a friend's weekly visit days: shows what two people are supposed to be doing right now, what is next, and keeps a plain record of the day. Six interests, a deterministic day engine, and a discussion-topic bank — all data stays in the browser (`localStorage`, key `daydriver:v1`).

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
