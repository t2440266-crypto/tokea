# 0004. Fine payment mode — rationale

## Context

The cycling engine (spec 0003) books fines for unverified activities, but the only way out was a free same day correction, which made the fine cosmetic. Paying must cost something: your own time on the missed activity, plus a +25 minute surcharge on whatever daily activities ran while you were paying instead of following the loop. The plain confirm dialog cannot carry a custom button label, so the confirmation becomes an in app card; the fine session is wall clock truth (timestamps, not timers), matching the clock derived design the rest of the engine already uses.

Forces: additive storage only under `daydriver:v1`, zero runtime dependencies, one source of truth (device clock), and copy dictated verbatim by the engineer for their private app. Consequence of not deciding: the builder invents session lifetime, timeout behavior, and how +25 reshapes the timeline mid build.

## Options considered

### Option 1: Wall clock sessions with derived penalty windows (chosen)

Persist `{startedAt, endsAt, status}` per session; at schedule time add +25 minutes to every occurrence overlapping any session window.

**Pros**:
- One timestamp record powers countdown, prompt, reload, expiry, and the +25 surcharge; pure and testable.
- Penalties stack naturally when sessions overlap.

**Cons**:
- Every consumer of `chainSchedule` must pass sessions (week, recap, today, reconcile) or show stale times.

### Option 2: Store adjusted durations on each occurrence row

Write +25 directly into occurrence durations when a session starts.

**Pros**:
- Readers need no session knowledge.

**Cons**:
- Session start happens mid day; rewriting future occurrence rows on every session fights the derived, clock recomputed design and leaves stale writes if a session expires unpaid.

### Option 3: Pause the chain during payment

Freeze the daily loop while a session runs, resume after.

**Pros**:
- Simpler timeline (no +25 shifts).

**Cons**:
- Contradicts the engineer's explicit rule that daily activities keep running and are charged +25 each. Rejected on requirements, not taste.

## Rationale

The engineer's rule set is the spec: chain runs, payment costs wall clock time, overlaps are charged +25 each, copy is verbatim. Derived windows keep that honest under reload and sleep without mutation storms, reusing the prompt clamp and correction paths already proven in spec 0003. The in app confirm card exists because a native dialog cannot be relabeled to `Pay fine and start the time-count`.

Staged panels settled: session length (full activity duration), which rows route to payment (any X while a fine is owed, free correction only when nothing is owed), failure handling (expire unpaid, no double fine), prompt buttons (`The activity done and Fine Paid` plus `Not done`), the data model above, and edge rules (one session at a time, stacking +25 per overlap, boot expiry keeps windows). References declined; no new tool entered the stack.

A cross check on a separate model surfaced fourteen completeness gaps (live ledger routing, confirm card mount, stacked prompts, session start notification, session exclusion from progress, every `chainSchedule` caller, notification tag separation, sequential stacking algorithm, session id generation, paid with an empty ledger, idempotent paid tick, ticker expiry, running versus locked extension, frozen `endsAt`) plus three soundness notes (simpler cursor algorithm, the paid-late race closed by in-tick expiry, and past window finishes allowed per spec 0003 AC-10). All seventeen resolutions were folded into the build spec before acceptance.
