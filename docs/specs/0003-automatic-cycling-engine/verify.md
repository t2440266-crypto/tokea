# Verify: automatic cycling engine · spec 0003 · updated 2026-10-01
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] In window: hero shows current activity, countdown, `until HH:MM · N min`; no Start, Done, or Skip anywhere → AC-1, AC-2, AC-7
- [x] Prompt opens 10 min before end (clamped): in-app banner visible on any view → AC-4
- [x] OS notification with tick/X actions visible on a real device or desktop Chrome with notifications enabled (engineer confirmed both prompts on a real device) → AC-3, AC-4
- [x] Tick in banner → occurrence records done, banner closes, verified count rises → AC-4, AC-6
- [x] Unanswered at end minus 5 (or app opened after prompt close) → auto books x, fine +1 → AC-5
- [x] Boot reconcile books every ended unverified activity exactly once; second boot books nothing → AC-9
- [x] Fine badge reads `1 fine to pay` or `fines n`, only on the next unpaid occurrence → AC-6
- [x] Tap a locked x row → confirm dialog → flips to done, one fine removed → AC-6
- [x] Chain wraps last activity → Pushups with `now · cycle 2` eyebrow and c2 rows → AC-1
- [x] `Food time` visible in the activity list, settings labels, and notification body template → AC-8
- [x] Permission requested once on first visit-day load; denied mode still fully works via banner → AC-3 (denied half)
- [x] Non visit day or outside window: no chain, no notifications → AC-10

## Commands
- [x] `npm run verify` → exit 0, 70 tests → AC-4, AC-6, AC-9 units
- [x] `npx vitest run src/cycle.test.ts` → 13 pass → AC-1, AC-2, AC-10 math

## Acceptance-criteria coverage
- AC-1 by UI steps 1, 9 + chain tests · AC-2 by UI step 1 · AC-3 by UI steps 3 (granted, device pending) and 11 (denied) · AC-4 by UI steps 2, 4 and 3 · AC-5 by UI steps 5, 6 · AC-6 by UI steps 4, 5, 6, 7, 8 · AC-7 by UI step 1 · AC-8 by UI step 10 · AC-9 by UI steps 5, 6 + reconcile tests · AC-10 by UI step 12 + cycle tests
