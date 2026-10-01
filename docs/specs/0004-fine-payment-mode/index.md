# 0004. Fine payment mode

**Date**: 2026-10-01
**Status**: Accepted

## Summary

Missing an activity books a fine, and this decision turns settling it into a real payment: tapping a missed row whose activity still owes a fine opens a custom confirmation with the exact copy you gave, and the `Pay fine and start the time-count` button starts a countdown for that one activity. Ten minutes before that countdown ends the verification prompt appears with `The activity done and Fine Paid`; ticking it flips the miss to done and clears exactly one fine. The daily chain never stops while you pay, and every daily activity running across your payment window is charged +25 minutes, with the no sympathy taunt shown on the session card.

## Context

The cycling engine (spec 0003) books fines for unverified activities, but the only way out was a free same day correction, which made the fine cosmetic. Paying must cost something: your own time on the missed activity, plus a +25 minute surcharge on whatever daily activities ran while you were paying instead of following the loop. The plain confirm dialog cannot carry a custom button label, so the confirmation becomes an in app card; the fine session is wall clock truth (timestamps, not timers), matching the clock derived design the rest of the engine already uses.

Forces: additive storage only under `daydriver:v1`, zero runtime dependencies, one source of truth (device clock), and copy dictated verbatim by the engineer for their private app. Consequence of not deciding: the builder inventes session lifetime, timeout behavior, and how +25 reshapes the timeline mid build.

## Requirements

**User stories**:
- As the owner, I want tapping a missed activity to demand real payment (my time on that activity plus a surcharge on the loop), so that fines mean something instead of being tapped away.
- As someone paying, I want the countdown, the prompt, and the taunt in my face until I finish, so that the cost is impossible to ignore.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Tapping a locked X row whose activity still owes a fine shows an in app confirmation card with the copy: "It looks like you want to pay the fine you penalized for missing this previous activity from the previous cycle, press 'Pay fine and start the time-count to pay this specific exact activity only" and a button labeled exactly `Pay fine and start the time-count` (plus a cancel); an X row with no fine owed keeps the free same day correction.
- **AC-2**: Pressing the button starts one session for that activity only: the hero swaps to a session card with a countdown that ends at press time plus that activity's duration, one start notification fires with tag `fine-session:{id}` (no actions, deduped by id), `endsAt` is frozen at press (later settings changes never recompute it), and the session survives a reload (timestamps, not timers).
- **AC-3**: Ten minutes before the session ends (same clamp rules as chain prompts) the verification appears as banner and notification (tag `fine-prompt:{id}`) with buttons `The activity done and Fine Paid` and `Not done`; ticking flips the original X to done with `corrected: true`, removes exactly one fine (floors at 0; still marks `paid` if the ledger was already cleared; idempotent if the row is missing or already done), and marks the session `paid`.
- **AC-4**: An unanswered prompt at the session end, or `Not done`, expires the session `unpaid`: the fine stays, no additional fine is booked, and the +25 windows already burned still count. Expiry runs both in the 1s ticker at `endsAt` and on boot reconcile, and `answerSession` rejects any answer at `now ≥ endsAt` (closes the paid-late race).
- **AC-5**: The daily chain keeps running during a session; the schedule builder walks occurrences with a sequential cursor, adding +25 minutes per overlapping session window to each occurrence's current (post-shift) interval, so later starts shift naturally; the running occurrence extends live while locked rows stay put; an extended occurrence may finish past the visit window (spec 0003 AC-10, no clamp). Timeline and `until` labels show adjusted times.
- **AC-6**: The session card shows: "That is your dumb foolish fault and I will not have sympathy or mercy on you while paying the fines. Finish paying the fines while the daily activities run — they add +25 minutes for every daily activity running while you pay."
- **AC-7**: Only one session runs at a time (a second tap on another miss is ignored while running); boot reconcile marks sessions whose `endsAt` passed as `expired` (penalty windows persist); reload mid session resumes the same countdown from timestamps.
- **AC-8**: An X row whose activity owes no fine still opens the free same day correction (existing AC-6 of spec 0003 unchanged).

## Decision

**Chosen option**: Wall clock fine sessions with derived penalty windows (see rationale for the options weighed).

Sessions are persisted timestamp records; the +25 surcharge is derived at schedule time from session windows, never stored per occurrence.

## Feature design

**Data model sketch**:
- `Persisted` (key `daydriver:v1`), additive:
  - `fineSessions: FineSession[]` with `FineSession = { id: string; kind: BlockKind; cycleIndex: number; startedAt: number; endsAt: number; status: 'running' | 'paid' | 'expired' }`
  - `endsAt = startedAt + durations[kind] * 60000`
  - original miss row (existing log) is flipped by the paid tick, as in spec 0003 correction
- Engine constant `PENALTY_MIN = 25` (no settings surface; the amount is fixed by the engineer)

**State transitions** (one session):
- `idle` → (tap X row; routing reads the live ledger: `fines[kind] > 0` → pay flow, else free correction) → `confirm card` (AC-1)
- `confirm card` → (cancel) → `idle`
- `confirm card` → (`Pay fine and start the time-count`) → `running(startedAt=now, endsAt=now+duration)` (AC-2)
- `running` → (now ≥ endsAt − 10 min, clamped ≥ startedAt) → `prompt open` (banner + notification, AC-3)
- `prompt open` → (`The activity done and Fine Paid`) → `paid`: row x→done + `corrected`, one fine removed (AC-3)
- `prompt open` → (`Not done`) → `expired`, fine kept (AC-4)
- `running` → (now ≥ endsAt, unanswered — checked in the 1s ticker, not only at boot) → `expired`, fine kept (AC-4)
- `running` → (reload / boot) → resume from timestamps; if `endsAt` already passed → `expired` on reconcile (AC-7)
- second tap while `running` or `confirm card` → ignored (AC-7)

**API surface** (client actions only; device local, no auth):
| Action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Open payment confirm | derived in `today.ts` row tap | live `fines[kind] > 0` at click time | confirm card mounts in the fixed overlay (same family as the banner, any view) | none | no fine → free correction (AC-8) |
| Start session | `ctx.startFineSession(kind, cycleIndex)` | kind, missed cycleIndex | id via `crypto.randomUUID()`, appends `FineSession` running, one start notification `fine-session:{id}`, emits | none | one at a time: second call no-op (AC-7) |
| Answer prompt | `ctx.answerSession(id, 'paid' \| 'notdone')` | session id, result | paid: flips row if present (floors fine at 0, idempotent on missing/done row) + status paid; notdone: status expired | none | unknown, already closed, or `now ≥ endsAt`: no-op |
| Session expiry | inside the 1s ticker + `ctx.reconcile()` | none | running and `endsAt ≤ now` → `expired` (boot reconcile also) | none | paid sessions untouched |
| Adjusted schedule | `chainSchedule(settings, date, fineSessions?)` | sessions list | sequential cursor: each occurrence gets +25 per overlapping session window; callers updated everywhere: `today.ts`, `week.ts`, `recap.ts`, `app.reconcile`, `main.ts` runtime | none | no sessions → identical to spec 0003 output; session prompts tag `fine-prompt:{id}` |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Confirm card copy + button label | exact strings | constants in `today.ts`, verbatim from the engineer's request |
| Session countdown end | `endsAt` | `startedAt + durations[kind] * 60000` (press time, persisted) |
| Prompt window | `endsAt − 10 min`, clamped ≥ `startedAt` | same clamp helper as chain prompts |
| +25 per occurrence | overlap count | sequential cursor while building the chain: `duration = base + PENALTY_MIN × overlaps(currentStart, currentEnd)`; each occurrence tested against session windows in order, so later starts shift naturally |
| Session id | unique key | `crypto.randomUUID()` (native, zero deps) |
| Prompt tags | `fine-session:{id}`, `fine-prompt:{id}` | distinct from spec 0003 occurrence tags so they never dedupe each other away |
| Taunt line | exact string | constant in `today.ts` (AC-6) |
| Fine countdown label / badge | `fines[kind]` | existing ledger, decremented only by paid tick |

**Key invariants**:
- At most one session with `status: 'running'`; start is a no-op otherwise.
- Session windows are immutable wall clock facts; expiry never rewrites `startedAt`/`endsAt`.
- Penalty stacking: each overlapping session adds exactly +25 minutes once per occurrence.
- Paid tick reuses the spec 0003 correction path (one row flip, one fine removed, idempotent).
- The free correction path stays available exactly when `fines[kind] === 0`.
- Sessions are never occurrences: they never count in verified progress, week bars, or recap rows; only the paid row flip does.
- `endsAt` is frozen at press; settings edits mid session never recompute it.
- Paid answers after `endsAt` are rejected; expiry is enforced in the ticker every second, not just at boot.
- Zero new dependencies; copy strings live in the UI layer, engine stays pure.

**Security model**: single user, device local, no auth, no regulated data. Taunt copy is engineer dictated content for a private app. Not applicable beyond that.

**Configuration required**: none.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Penalty schedule: occurrence overlapping one session +25, two sessions +50, non overlapping untouched, later starts shift, verifies **AC-5**
- Session lifecycle: start sets `endsAt` from duration, reload resumes, boot expire past `endsAt`, verifies **AC-2**, **AC-7**
- Paid tick: flips row, clears exactly one fine, status paid, second answer no-op, paid after `endsAt` rejected, ledger-already-zero still marks paid, verifies **AC-3**, **AC-4**
- Expired path: notdone, ticker expiry at `endsAt`, and boot reconcile all keep the fine and book no extra, verifies **AC-4**, **AC-7**
- Routing: fine owed → pay flow; no fine owed → free correction unchanged, verifies **AC-1**, **AC-8**

## Build plan

Tracer Bullet: pure window math first, then persistence, then the screens, then proof.

1. [x] Pure engine: session window helpers, sequential cursor penalty adjustment in `chainSchedule` (+25 stacking, live running extension, past window allowed) + tests, satisfies **AC-5**
2. [x] Persistence: `fineSessions`, `startFineSession` (uuid + start notification), `answerSession` (floors, idempotence, `endsAt` guard), ticker and boot expiry + tests, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-7**
3. [x] UI: confirm card in the shared overlay with exact copy, session hero with taunt and countdown, prompt copy switch (`fine-prompt` tags), row tap routing on the live ledger, session card stacked above the chain banner, satisfies **AC-1**, **AC-6**, **AC-8**
4. [x] Wire `fineSessions` into every `chainSchedule` caller (today, week, recap, reconcile, runtime) and prove with the full AC-tagged suite, satisfies **AC-3**, **AC-5**

## Consequences

**Positive**:
- Fines become a real cost: your time plus a visible +25 surcharge on the loop you neglected.
- Session state is timestamps only, so sleep, reload, and the clock derived design all keep working.

**Negative / tradeoffs**:
- Timeline times become penalty dependent: the same chain produces different `until` labels on days with sessions, which week and recap planned minutes must account for (same adjusted schedule function everywhere).
- The taunt is deliberately harsh copy; it is engineer dictated content, not a pattern to reuse elsewhere in the app.
- In app confirm card replaces the native dialog for this flow, adding one modal surface to style.

**Neutral**:
- `PENALTY_MIN = 25` is a code constant; changing it later touches one line in the engine.
- Additive storage only; no migration.

## Follow-up

- None.

Rationale: reasoning and options live in [rationale.md](rationale.md).
