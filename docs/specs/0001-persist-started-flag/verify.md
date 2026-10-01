# Verify: persist the started flag · spec 0001 · updated 2026-10-01
_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Start current block → hard reload → hero shows Done, Skip, +5 → AC-1
- [x] Tap Done → reload → block logged, no started controls → AC-2
- [x] Start block A, reload with `?now=` past A → hero shows Start for B, A's row tools still offer Done/Skip → AC-3, AC-4
- [x] Storage entry under yesterday's date carrying `startedId` → hero unaffected → AC-4
- [x] `startedId: 'ghost'` in storage → app renders clean, no started controls, no crash → AC-5
- [x] After date change (midnight reload path) → no flag surfaces → value sourcing: `state.date` from device clock

## Commands
- [x] `npm run verify` → exit 0 → AC-6, AC-7
- [x] `npx vitest run src/app.test.ts` → 10 pass → AC-1 … AC-7

## Acceptance-criteria coverage
- AC-1 covered by UI step 1, command 2 · AC-2 by UI step 2 · AC-3 by UI step 3 · AC-4 by UI steps 3, 4, 6 · AC-5 by UI step 5 · AC-6 and AC-7 by command 1 (store tests)
