# Verify: drag to reorder the plan · spec 0002 · updated 2026-10-01
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Plain tap row → row tools toggle → AC-1
- [x] Long press 350ms without moving, release → lift visible, no tools toggle, no dirty write → AC-1, AC-4
- [x] Move more than 10px before 350ms → lift cancelled, list scrolls → AC-2
- [x] Lifted drag down one row → live gap reflows, page does not scroll → AC-2
- [x] Drop moved → hard reload → new order renders, dirty true (regenerate confirm available) → AC-3
- [x] Drop without moving → no edits entry, dirty stays false → AC-4
- [x] Drag a done row and a future row → outcomes stay attached to their blocks → AC-5
- [x] Earlier then Later → original sequence restored, `edits.order` written → AC-6
- [x] Regenerate confirm appears and clears order on confirm; `startedId` survives → AC-7

## Commands
- [x] `npm run verify` → exit 0, 48 tests → AC-3 … AC-7
- [x] `npx vitest run src/app.test.ts` → 20 pass → AC-3 … AC-7

## Acceptance-criteria coverage
- AC-1 by UI steps 1, 2 · AC-2 by UI steps 3, 4 · AC-3 by UI step 5 · AC-4 by UI steps 2, 6 · AC-5 by UI step 7 · AC-6 by UI step 8 + engine pin test · AC-7 by UI step 9 + isolation test
