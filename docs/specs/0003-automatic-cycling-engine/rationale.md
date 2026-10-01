# 0003. Automatic cycling engine — rationale

## Context

Two people run the same handful of activities every visit day and want the app to drive the day by itself: no opening the app to press Start, no remembering what comes next. The old model pinned lunch to 13:00 and ended the day at a recap block; the new reality is a repeating loop of the same activities, so clock pinned anchors no longer fit, and verification has to come to the user (notifications) instead of the user coming to the app.

Forces: the MASTERPROMPT's zero dependency lock (notifications, vibration, and timers are platform native, no library), the existing per day storage under `daydriver:v1` (additive changes only), the plan order editor from spec 0002 (it becomes the chain order editor), and honesty about platform limits: a fully closed app cannot fire local notifications, so boot reconciliation must book anything the app slept through. Consequence of not deciding: the builder invents the occurrence schema, the fine rules, and the prompt timing mid build, and the cycle math drifts from the tests.

## Options considered

### Option 1: Clock derived chain with persisted occurrences and per activity fines (chosen)

A pure function turns the device clock plus `cycleOrder` plus durations into the running timeline; every boundary (start, prompt, timeout, wrap) falls out of that math. Outcomes append to the existing log; fines are one small record.

**Pros**:
- One source of truth (the clock), trivially testable, survives sleep and reload without catch up logic beyond one reconcile pass.
- Reuses the log, the order editor, and the storage shape already in the repo.

**Cons**:
- Week and recap views need adapting from the old pinned plan to occurrence based numbers.

### Option 2: Persisted timer state machine (store next transition timestamp, fire timers)

Keep explicit `nextEventAt` fields and setTimeout between transitions.

**Pros**:
- Straightforward event style code.

**Cons**:
- Timers drift, pause in background tabs, and duplicate after reload; every sleep needs compensating code. Strictly worse than recomputing from the clock.

### Option 3: Keep the clock pinned day plan and just add notifications

Leave lunch at 13:00 and the day end at recap; notify on the existing boundaries.

**Pros**:
- Smallest diff.

**Cons**:
- Contradicts the core ask: the day must loop endlessly from Pushups, with no fixed anchor and no manual controls. Not this feature.

## Rationale

Recomputing the timeline from the clock every tick is the only model that behaves when a laptop sleeps, a tab throttles, or the app opens halfway through a cycle; the persisted occurrence log then only records what verification resolved, which keeps reconciliation to one small boot pass. Fines as a simple per activity count with tick pays oldest match the user's description (booked on X, settled on a later successful round, visible as a badge) without inventing a currency. The chain reuses the order editor from spec 0002, so the loop stays reshuffleable with no new surface.

The engineer answered staged panels on loop bounds (wrap inside the visit window), chain contents (template plus Food time, recap leaves the loop), Food time position (after DIY dumbbell), prompt channel (notification plus in app banner), fine pay rules (tick pays the oldest fine), display (count badge), same day correction (allowed), permission timing (first visit day load), and edge handling (boot reconcile, clock derived catch up, natural finish at window end). References were declined; no new tool entered the stack, so no tool discovery ran.

A cross check on a separate model surfaced fifteen completeness gaps (chain anchor, cycle index on mid window entry, epoch versus local time math, reconcile and ticker race, banner surface, service worker action path, reconcile input, week and recap planned minutes, correction UX, permission shape, badge wording, short activity prompt clamping, auto flag scope, late tick after timeout, window end during a prompt) plus three soundness notes (booking race ordering, notification dedupe by occurrence key, and a proposal to drop notification actions). All resolutions were folded into the build spec; notification actions were kept because picking tick or X straight from the notification is the requirement the engineer stated, with the in app banner as the universal fallback.
