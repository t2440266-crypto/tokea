# Verify: fine payment mode · spec 0004 · updated 2026-10-01
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Tap an X row with a fine owed → overlay shows the exact confirm copy and a button labeled `Pay fine and start the time-count`; cancel returns without starting anything → AC-1
- [ ] Press pay → hero becomes `paying fine` with countdown to `endsAt`, taunt line visible, session persisted `running`, one start notification (`fine-session:{id}`) on a real device → AC-2
- [ ] Session prompt appears at `max(startedAt, endsAt−10)`: banner card with `The activity done and Fine Paid` and `Not done`, notification tag `fine-prompt:{id}` with the same actions → AC-3
- [ ] +25 live: an occurrence overlapping the session shows the extended time (rows and next strip), later starts shifted → AC-5
- [ ] While a session runs, tapping another owed X and pressing pay leaves exactly one session → AC-7
- [ ] Paid tap → session `paid`, original row flips to done with `corrected`, exactly one fine removed, banner clears, hero returns to the chain → AC-3
- [ ] `Not done` or unanswered at `endsAt` → session `expired`, fine kept, no extra fine; boot reload past `endsAt` expires the same way → AC-4, AC-7
- [ ] X row with no fine owed still opens the free same-day correction → AC-8
- [ ] Session card shows the taunt copy verbatim → AC-6

## Commands
- [ ] `npm run verify` → exit 0, 88 tests → AC-3, AC-5 units
- [ ] `npx vitest run src/cycle.test.ts` → 19 pass → AC-5 math

## Acceptance-criteria coverage
- AC-1 by UI step 1 · AC-2 by UI step 2 · AC-3 by UI steps 3, 6 · AC-4 by UI step 7 · AC-5 by UI step 4 + cycle tests · AC-6 by UI step 9 · AC-7 by UI steps 5, 7 · AC-8 by UI step 8
