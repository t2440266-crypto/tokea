# 0005. Engine ON/OFF toggle

**Date**: 2026-10-01
**Status**: Proposed

## Summary

A master ON/OFF switch on the TODAY screen controls the day engine. Every fresh day starts OFF: no chain, no prompts, no notifications, no fines. The first ON of the day starts the chain with Pushups at that exact moment and the day runs. OFF freezes the engine clock (an effective time that stops advancing, so no occurrence moves, no prompt fires, and no fine accrues) and the next ON resumes from the frozen spot. The state survives a reload both ways.

## Context

The automatic cycling engine (spec 0003) and fine payment mode (spec 0004) run off the wall clock: the moment an occurrence ends unverified, a fine is booked. The owner uses another app for long stretches and does not want the engine quietly piling up fines while away. Today the only way to stop it is to close the tab mid flow, and even then a later reopen reconciles every missed occurrence as an X. The owner needs one obvious switch: turn the day on when they are ready to be driven, turn it off when done, and walk away with nothing accruing. The switch must be visible on TODAY, must default off each day, and must survive a reload so closing the app never loses or invents state.

## Requirements

**User stories**:
- As the owner, I want a master ON/OFF switch so that the engine only runs while I choose to use it.
- As the owner, I want OFF to freeze everything so that stepping away never books fines against me.
- As the owner, I want ON to resume where I left off so that a paused day continues honestly.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: The toggle is prominent in the TODAY hero. Each fresh day (no engine entry for the date) defaults to OFF; the hero shows an OFF panel with the toggle and the hint line `Turn ON to start Pushups now`, and the chain timeline is empty until the first ON.
- **AC-2**: The first ON of the day starts the chain with Pushups beginning at the ON moment (not at the window start), and notification permission is requested at that moment rather than at app open.
- **AC-3**: While OFF, the effective clock freezes: no occurrence advances, no start or prompt notification fires, no tick/X prompt opens or auto-expires, no fine session can start, and a boot reconcile books nothing for time spent OFF. A fresh day with no engine entry builds no chain and books nothing at all.
- **AC-4**: Toggling OFF then ON resumes exactly where the chain stopped (same occurrence, remaining time intact), and both ON and OFF states survive a page reload.
- **AC-5**: A running fine time-count session blocks OFF (the toggle refuses until the session is answered), and no fine session can be started while OFF.
- **AC-6**: ON pressed after the loop window closed, or on a non visit day, turns the engine ON with an empty chain and a window closed note in the hero; no fake bookings.
- **AC-7**: While OFF, manual row corrections (Done, Skip, X via the existing tap flows) still work, and the header clock keeps showing real wall time. Toggling OFF closes any open engine banner (tick/X card, session card) and the pay confirm overlay.
- **AC-8**: ON pressed before visitStart starts Pushups immediately (the chain anchor is the ON moment, not clamped to the window start); the hero then shows the running Pushups occurrence, not a "loop starts in" countdown.

## Options considered

### Option 1: Per day engine map with an effective clock

Store an engine entry per date `{ on, anchorMs, baseEffMs, resumeWallMs }`. The engine reads an effective time `effNow` which advances with the wall clock only while `on` and holds still while OFF. All engine logic (chain lookup, prompts, session timers, reconcile) uses `effNow` instead of raw `Date.now()`.

**Pros**:
- One frozen value makes every downstream behavior (prompts, fines, reconcile) freeze together for free.
- Reload recovery is pure arithmetic: recompute `effNow` from the stored fields.

**Cons**:
- Every engine call site must route through `effNow`; a straggler reading `Date.now()` breaks the freeze.

### Option 2: In-memory pause flag only

A boolean in app state pauses the interval work; nothing is stored per day.

**Pros**:
- Tiny diff.

**Cons**:
- Fails reload (the flag resets), violating AC-4; boot reconcile would still book the gap as Xs.

### Option 3: Rebuild the chain on each ON

Keep no clock; on every ON, cut a new schedule starting at the resume point.

**Pros**:
- No effective time concept.

**Cons**:
- Invalidates occurrence keys and fine session windows already in flight; the +25 penalty cursor (spec 0004) would double count; resume would not be exact. High risk against a shipped engine.

## Decision

**Chosen option**: Option 1: Per day engine map with an effective clock.

The engine gains a per date entry and reads `effNow`; OFF holds `effNow` still, ON lets it advance from the stored base.

**Implementation skills**: none beyond project AGENTS.md conventions.

## Rationale

The freeze requirement is the whole feature: every accruing behavior must stop as one. A single effective clock freezes them together with one guard, instead of chasing each timer. The engineer's reload requirement forces the state to be persisted (Option 2 is out), and rewriting the schedule per ON (Option 3) would break the fine session keys and penalty cursor already shipped. `max(storedEff, baseEffMs + (wallMs − resumeWallMs))` is the smallest formula that freezes, resumes exactly, and never rewinds.

## Feature design

**Data model sketch**:

New top level key in `daydriver:v1`, additive migration (missing key or missing date = fresh OFF day):

| Field | Type | Required | Meaning |
|---|---|---|---|
| `engine` | `{ [date: string]: EngineDay }` | yes (default `{}`) | engine state per local date |
| `EngineDay.on` | boolean | yes | false = frozen, true = running |
| `EngineDay.anchorMs` | number | yes | wall time of the first ON of that day; chain schedule starts here |
| `EngineDay.baseEffMs` | number | yes | effective time at last transition (set to `effNow` on OFF, to wall on first ON) |
| `EngineDay.resumeWallMs` | number | yes | wall time of the last ON; valid while `on` |

Two distinct clock reads (never conflate them):
- `wallMs` = raw wall time (`Date.now()`, or `currentNowMs()` under the `?now=` override). Used only to write `anchorMs`, `resumeWallMs`, and the `baseEffMs` captured at an OFF.
- `effNow` = engine clock, the only clock the engine reads: `effNow = on ? max(storedEff, baseEffMs + (wallMs − resumeWallMs)) : baseEffMs`. The `max` clamp enforces monotonicity against clock skew. `effNow` feeds `state.nowMs` from the interval.

Under the `?now=` test override `wallMs` does not advance, so the engine is deliberately frozen; a reload with a different `?now=` value jumps `effNow`, which is accepted test harness behavior.

Before the first ON of a date there is no entry: no chain is built, the hero shows OFF, and reconcile gates on `engineDay() !== null` so a fresh day builds nothing and books nothing.

**State transitions** (per date):

```
(no entry) --first ON--> ON (entry created: anchor=base=resume=wall)
ON --OFF--> OFF (baseEffMs := effNow)
OFF --ON--> ON (resumeWallMs := wall)
any --date rollover--> (no entry for the new date = OFF)
```

**API surface** (AppCtx additions; no HTTP, local only):

| Action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| engine state read | `engineDay()` | none | `EngineDay \| null` for today | local device | none |
| toggle | `setEngine(on: boolean)` | `on: boolean` | updated `EngineDay` or `null` | local device | returns unchanged when OFF requested with an active session (AC-5); ON past window creates entry with empty chain (AC-6) |
| start fine session | `startFineSession(kind, cycleIndex)` | existing signature | `FineSession \| null` | local device | returns `null` while engine is OFF (AC-5) |

`chainSchedule` gains an optional `anchorMs` parameter: when provided, the cursor starts at `anchorMs` instead of `bounds.start` (AC-2, AC-8), still stopping at `bounds.end` (empty result when `anchorMs >= bounds.end` or non visit day, AC-6).

The anchor is threaded into all three in app space call sites: `schedule()`, `reconcile()`, and `markVerified`'s `plannedStart` lookup. Week and Recap keep the unanchored call (forecasts, decided above).

**Fine session time base**: `startedAt` / `endsAt` stay in wall time. A session can never span OFF (OFF is refused while one runs, and none can start while OFF), so wall time and `effNow` are equal for its whole life; `localDateKey` day attribution stays correct. A session still running at midnight expires at boot on wall clock (the new date has no entry, so the session cannot continue).

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| first ON | `anchorMs`, `baseEffMs`, `resumeWallMs` | `wallMs` at the toggle click |
| OFF | `baseEffMs` | current `effNow` |
| resume ON | `resumeWallMs` | `wallMs` at the toggle click |
| `effNow` | engine time | derived: `max(storedEff, baseEffMs + (wallMs − resumeWallMs))` while `on`, else `baseEffMs`; feeds `state.nowMs` |
| chain schedule (today) | occurrence start cursor | `EngineDay.anchorMs` via `schedule()`, `reconcile()`, and `markVerified` plannedStart; `bounds.start` for week/recap |
| hero panel state | on or off | `engineDay()` for `state.date`; no entry = OFF |
| hero countdown / "loop starts in" branch | remaining time | compares `effNow` against occurrence bounds; the "loop starts in" branch only renders when no occurrence exists (no entry, or ON past window) |
| hint line / window note | copy | constants in `ui/today.ts` |
| header clock | real time | `wallMs` / `fmtHMS`, independent of `effNow` (AC-7) |

**Key invariants**:
- All engine logic (occurrence lookup, prompt windows, session lifecycle, reconcile, notification decisions) reads `effNow`, never raw wall time.
- `effNow` is monotonically non-decreasing: computed via `max(storedEff, …)`; it advances only while `on`.
- At most one engine entry per date; a new date always starts with no entry; reconcile does nothing when there is no entry for `state.date`.
- OFF is refused while `activeSession()` is non null; `startFineSession` returns null while OFF (the pay confirm button guards on this).
- Toggling OFF clears the chain banner, session banner, and pay confirm overlay.
- Manual log writes (`markVerified`, `logOutcome`) never consult `on`.
- The `engine` map is pruned on write: entries older than 30 days are dropped (one entry per day, additive schema).

**Security model**: single local user, device only, no auth (MASTERPROMPT lock). No new compliance scope.

**Configuration required**: none.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: fresh day OFF, first ON creates entry with anchor at ON moment, chain shows Pushups starting then, verifies **AC-1**, **AC-2**, **AC-8**
- Freeze: ON, advance past a prompt window, toggle OFF, advance wall time, assert no auto-X booked, `effNow` unchanged, verifies **AC-3**
- Fresh day boot: no engine entry, call reconcile, assert zero logs and zero fines, verifies **AC-3**
- Resume: OFF then ON, assert occurrence and remaining time identical to pre OFF, reload hydrates `on` state, verifies **AC-4**
- Session guard: running session makes OFF a no-op; OFF state rejects `startFineSession`; OFF closes open banners, verifies **AC-5**, **AC-7**
- Late ON: `anchorMs >= bounds.end` yields empty schedule, verifies **AC-6**
- Manual edits while OFF still write logs, header clock path reads `wallMs`, verifies **AC-7**
- Anchor threading: boot reconcile and `markVerified` plannedStart use `anchorMs` (no pre-anchor X booked), verifies **AC-2**

## Build plan

Tracer Bullet: one thin thread through storage, engine, runtime, and hero first, then guards and copy.

1. Store: `engine` map type, additive migrate (default `{}`), 30 day prune on write, `engineDay()` / `setEngine()` in app with unit tests for first ON, OFF freeze arithmetic, resume, refusal with active session, satisfies **AC-1** (state), **AC-4**, **AC-5**
2. Engine: `chainSchedule` optional `anchorMs`; `effNow` helper with `max` clamp feeding `state.nowMs`; `wallMs` kept as the separate raw read; anchor threaded through `schedule()`, `reconcile()`, `markVerified`; unit tests for anchor start, late ON empty chain, before visitStart start, no-entry reconcile books nothing, satisfies **AC-2**, **AC-3**, **AC-6**, **AC-8**
3. Runtime: gate `runtimeTick` (prompts, auto-X, session lifecycle, notifications) on engine ON; OFF clears banners and pay confirm; boot reconcile gated on entry presence and using `effNow`; move `requestNotifyPermission` from boot to first ON, satisfies **AC-3**, **AC-7**, **AC-2**
4. UI: OFF hero panel with toggle and hint line, ON hero note for empty chain (no "loop starts in" branch when an occurrence runs), toggle placement in hero, manual row taps untouched, satisfies **AC-1**, **AC-6**, **AC-7**, **AC-8**
5. AC tagged suite green across app/cycle/store tests, satisfies all

## Consequences

**Positive**:
- The owner can leave the app open all day with zero fines.
- One switch makes the engine's lifecycle obvious on the screen that already owns the day.

**Negative / tradeoffs**:
- Every engine read now depends on `effNow`; a future call site reading `Date.now()` silently breaks the freeze. Mitigated by routing `state.nowMs` as the single engine clock (already the pattern from spec 0004).
- Reload while ON counts the closed gap as running time (resume arithmetic spans wall time). The owner is expected to press OFF before leaving; pausing on tab close would add visibility hacks with no request behind them.

**Neutral**:
- Week and Recap keep computing from `bounds.start` (they are forecasts, not the live chain).
- Under `?now=` the engine deliberately freezes (wall does not advance); reload jumps are test harness behavior.
- The `engine` map holds at most one entry per day and prunes entries older than 30 days on write.

## Follow-up

- [ ] None identified.
