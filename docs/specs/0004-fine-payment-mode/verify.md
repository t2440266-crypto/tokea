# Verify: fine payment mode · spec 0004 · updated 2026-10-01
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Tap an X row with a fine owed → overlay shows the exact confirm copy and a button labeled `Pay fine and start the time-count`; cancel returns without starting anything → AC-1
- [x] Press pay → hero becomes `paying fine` with countdown to `endsAt`, taunt line visible, session persisted `running` → AC-2
- [x] Session prompt appears at `max(startedAt, endsAt−10)`: banner card with `The activity done and Fine Paid` and `Not done` → AC-3
- [x] +25 live: Stories shifted 10:15 → 10:40 on rows and next strip, later starts shifted → AC-5
- [x] While a session runs, tapping another owed X and pressing pay leaves exactly one session → AC-7
- [x] Paid tap → session `paid`, original row flips to done with `corrected`, exactly one fine removed, banner clears, hero returns to the chain → AC-3
- [x] Reload past `endsAt` → session `expired`, fine kept, no extra fine → AC-4, AC-7
- [x] X row with no fine owed still opens the free same-day correction (native confirm, no pay overlay) → AC-8
- [x] Session card shows the taunt copy verbatim → AC-6
- [ ] OS notifications on a real device: start notification tag `fine-session:{id}` and prompt notification tag `fine-prompt:{id}` with tick/X actions (this environment stores zero notifications; same blocker as spec 0003 verify step) → AC-2, AC-3 notifications

## Commands
- [x] `npm run verify` → exit 0, 88 tests → AC-3, AC-5 units
- [x] `npx vitest run src/cycle.test.ts` → 19 pass → AC-5 math

## Acceptance-criteria coverage
- AC-1 by UI step 1 · AC-2 by UI step 2 (device notification pending in step 10) · AC-3 by UI steps 3, 6 · AC-4 by UI step 7 · AC-5 by UI step 4 + cycle tests · AC-6 by UI step 9 · AC-7 by UI steps 5, 7 · AC-8 by UI step 8
