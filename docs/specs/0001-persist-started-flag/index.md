# 0001. Persist the started flag

**Date**: 2026-10-01
**Status**: Accepted

## Summary

Today a started block lives only in page memory, so a reload sends the user back to the Start button even though the block is still running. This decision stores one started block id per visit date inside the existing per day entry of local storage (the browser's own key value store, under the key `daydriver:v1`), and clears it only when the block is logged or skipped. The build stays additive: old saves load unchanged, no new top level schema key appears, and a stale id never crashes the screen.

## Requirements

**User stories**:
- As a visitor mid block, I want my started block to survive a reload so that I return to the same controls without re-tapping Start.
- As a user starting a new day, I want yesterday's leftover flags ignored so that stale state never controls today's hero.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Tapping Start on the current block persists `startedId` for today's date in `daydriver:v1`; after a full page reload the same block renders with Done, Skip, and +5, without tapping Start again.
- **AC-2**: Done or Skip clears today's `startedId`; after either action and a reload the block shows as logged, never as started.
- **AC-3**: Single active: starting a second block overwrites today's `startedId`, so only the latest started block ever shows started controls.
- **AC-4**: Current date only: a `startedId` stored under any other date is never surfaced in the UI; started controls render only when the stored date equals device local today.
- **AC-5**: A `startedId` that no longer matches a block in the plan (after edits or regeneration) is ignored at render: no crash, no started controls for a missing block.
- **AC-6**: A legacy save with no `startedId` field loads through `migrate` with the field defaulting to absent (not started), no crash.
- **AC-7**: Corrupt JSON loads through `loadState` to full whole-state defaults, no crash, and never produces a half-parsed day entry (the existing fallback path, kept).

## Decision

**Chosen option**: Option 1: `template.days[date].startedId`

Store the single active started block id as a nullable string on today's `DayEntry`, written by Start, cleared only by Done or Skip, read only when the stored date equals today.

## Feature design

**Data model sketch**:
- `Persisted` (storage key `daydriver:v1`)
  - `template.days: Record<dateString, DayEntry>`
    - `DayEntry.edits: DayEdits` (existing, required)
    - `DayEntry.dirty: boolean` (existing, required)
    - `DayEntry.note?: string` (existing, optional)
    - `DayEntry.startedId?: string` (**new**, optional; absent means not started; soft reference to `plan.blocks[].id`, validated at render, no database level constraint, local storage only)

**State transitions** (block started flag, per date):
- `not started` → (tap Start on current block) → `started(blockId)`
- `started(A)` → (tap Start on block B) → `started(B)` (overwrite, AC-3)
- `started(x)` → (tap Done or Skip) → `not started` (AC-2)
- `started(x)` → (page reload) → `started(x)` restored for today only (AC-1, AC-4)
- `started(x)` where the clock moves to block y → flag for x retained, hero shows y's Start; x keeps row tools (AC-4, visibility rule)
- `started(x)` where x not in plan → treated as `not started` at render, flag retained (AC-5)

**API surface** (client actions only, no HTTP; single user local app, no auth anywhere):
| Action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Start block | `ctx.startBlock(blockId)` | blockId: string (req) | creates today's `DayEntry` via the existing `ensureDay()` helper when absent (defaults `edits:{}`, `dirty:false`), writes `startedId`, emits | none (device local) | unknown blockId: no-op |
| Log outcome | `ctx.logOutcome(blockId, outcome, note?)` | blockId: string, outcome: done\|skipped | appends log entry, clears `startedId` when it names the logged block, emits | none | block not in plan: no-op |
| Hydrate | `createApp(storage)` | none (reads storage) | seeds in-memory started state from today's `startedId` | none | corrupt storage: defaults (AC-6, AC-7) |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `startBlock` | date key of the entry | `state.date` ← device local clock via `todayISO()` (rechecked each minute, full reload on date change) |
| `startBlock` | `startedId` value | id of the tapped block, from the current `plan.blocks[].id` |
| Hero renders started controls | boolean started | today's `DayEntry.startedId`, read after `loadState`, and only when `state.date` equals that entry's key (AC-4) |
| `logOutcome` | cleared field | writes today's `DayEntry` with `startedId` absent |
| Render guard | block existence | `plan.blocks[].id` membership (AC-5) |

State authority: the in-memory `state.started` map is authoritative during the session; storage is the mirror, rewritten by every `emit` (every mutation emits, every emit runs `saveState`). Hydrate copies storage into the map once at boot. There is no `startedAt`: the countdown derives from the plan clock (block start plus duration), never from tap time, so no start timestamp is stored. The minute recheck and midnight full reload named above are existing app behavior: zero code in this spec.

**Key invariants**:
- Block ids are derived deterministically from settings and template order by `generatePlan` (the per kind counter), independent of date; the same settings remint the same ids (precondition for AC-1 and AC-5).
- At most one `startedId` per date; writing one overwrites (AC-3).
- `startedId` is honored only for the device local today (AC-4); old date keys are never pruned (the app has one TODAY screen and no per date navigation for started controls, one tiny string per day, retention by design).
- `startedId` is cleared exactly on Done or Skip, never on clock rollover or regenerate (engineer decision, round 1).
- Started controls render only when the hero block id equals `startedId`. A retained flag for a block that is no longer the hero stays inert on the hero; any unlogged block still exposes Done and Skip through its expanded row tools (AC-4, AC-5 visibility rule).
- A `startedId` not present in the current plan is inert at render (AC-5); it is retained, not purged, so if a later regeneration remints the same id the flag becomes active again (accepted, rare: requires a template order change between start and regeneration).
- Every mutation calls `emit`, and every `emit` runs `saveState`; persistence is not optional for any writer (AC-1 depends on this).
- `DayEntry` updates always merge (`{...entry, field}`), never rebuild the entry from scratch, so no writer can silently drop `startedId`.
- Reset (`resetData`) writes full defaults and therefore clears the flag; export serializes it as stored; import does not exist in this app (export only).

**Security model**:
Single user, device local storage, no authentication, no multi user scoping, no regulated data (no payments, no health, no third party PII). Nothing to authorize: the only writer is the device owner's own taps. Not applicable beyond that.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: `saveState` with `startedId` set, `loadState` roundtrip, hydrated state shows started for today, verifies **AC-1**
- Failure case: `startedId` naming a block absent from the plan is ignored by the render guard with no crash, flag retained, verifies **AC-5**
- Failure case: legacy persisted object without `startedId` loads with the field absent (not started), verifies **AC-6**
- Failure case: corrupt JSON falls back to whole-state defaults through `loadState`, no crash, verifies **AC-7**
- Access rule: a `startedId` under a different date key never seeds today's started state, verifies **AC-4**

## Build plan

Ordered as a thin end to end thread (Tracer Bullet): first the read path lights up, then the write path, then the guard, then proof.

1. [x] Extend the `DayEntry` type with `startedId?: string` and hydrate `state.started` from `template.days[state.date].startedId` in `createApp`, satisfies **AC-1**, **AC-4**
2. [x] Persist in `startBlock` (single active overwrite of today's entry) and clear in `logOutcome`, satisfies **AC-1**, **AC-2**, **AC-3**
3. [x] Stale id guard: hero and row controls treat a `startedId` with no matching plan block as not started, satisfies **AC-5**
4. [x] Storage tests: roundtrip with `startedId`, legacy object without the field, corrupt JSON fallback, satisfies **AC-1**, **AC-2**, **AC-6**, **AC-7**

## Consequences

**Positive**:
- Reload mid block keeps the hero honest; NOW and its controls match the user's last action.
- The regenerate confirm and drag to reorder features inherit one clear place for date scoped run state.

**Negative / tradeoffs**:
- Run state and plan edits share one bucket, so a reader must know `DayEntry` holds both.
- Started state now survives only because `saveState` runs on every emit; any future write path that skips `emit` silently drops the flag.

**Neutral**:
- No migration function change: `migrate` already passes `template.days` entries through, legacy saves simply lack the field.
- Midnight rollover reloads the app (existing behavior), which naturally starts each day with no flag.
- Multi tab concurrency: whole object save is last writer wins, a second tab can clobber the flag or day edits. Stated non goal: the brief excludes multi device and multi user use; single tab assumed.
- Old date keys accumulate without pruning (one small string per day, never read once the date passes). Accepted by design.

## Follow-up

- [ ] Root `AGENTS.md` is still missing; `/sync` after this feature should capture the storage conventions this spec establishes (per day entry owns date scoped state).

Rationale: reasoning and options live in [rationale.md](rationale.md).
