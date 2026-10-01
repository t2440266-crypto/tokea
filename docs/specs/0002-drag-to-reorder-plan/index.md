# 0002. Drag to reorder the plan

**Date**: 2026-10-01
**Status**: Accepted

## Summary

The MASTERPROMPT asks for drag reordering on the TODAY plan; today only the Earlier and Later buttons move rows. This decision adds a long press lift gesture with a live gap, and unifies every reorder (drag and buttons) on the existing `edits.order` array so there is one source of truth. A drop that does not change the position writes nothing.

## Requirements

**User stories**:
- As a visitor, I want to drag a plan row into a new place so that the day order matches how we actually want it, without losing normal scrolling.
- As a user of the tap controls, I want Earlier and Later and drag to write the same field so that every reorder path behaves the same.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Long press a plan row for 350ms to lift it; a plain tap still toggles the row tools exactly as today, and a lift released without moving does not toggle them either, so no gesture steals the tap.
- **AC-2**: While a row is lifted, pointer movement reorders rows live with a gap opening at the candidate position (midpoint hit test against row rectangles, re-measured every pointermove), and the page does not scroll during the lifted gesture; before the lift, scrolling works normally.
- **AC-3**: A drop that changes the position writes the complete new block id sequence to today's `edits.order` (reading only rows that carry a block id), marks the day dirty, and after a full reload the plan renders in that order.
- **AC-4**: A drop whose normalized sequence equals the current effective order writes nothing: the comparison happens after the apply branch normalization (stale ids dropped, unknown appended), dirty stays false (when it was false), no edits entry is created, and reload shows the unchanged plan.
- **AC-5**: Every row is draggable (done, skipped, current, future); outcomes logged against block ids stay attached to their blocks after a reorder.
- **AC-6**: Earlier and Later keep working and write the same `order` array, so the two reorder mechanisms cannot fight; swapping twice returns the original order.
- **AC-7**: Regenerate (behind the existing confirm) clears the order edits as part of `edits`, and the started flag of spec 0001 is not affected by any reorder.

## Decision

**Chosen option**: Option 1: Unify on `edits.order`

Every reorder, gesture or button, writes `edits.order`; drop with unchanged position writes nothing.

## Feature design

**Data model sketch**:
- `Persisted` (key `daydriver:v1`) unchanged in shape; the field in play:
  - `template.days[date].edits.order?: string[]` (optional; complete sequence of current plan block ids; existing `applyEdits` renders it, drops stale ids, appends unknown ones)
  - `template.days[date].dirty: boolean` (existing; set true only when an order actually changes)

**State transitions** (row gesture):
- `idle` → (pointer down on row body, held 350ms, movement within 10px slop, vertical axis) → `lifted(row)` with `setPointerCapture` taken
- `lifted(row)` → (pointer move across row boundaries) → `lifted(row)` with candidate gap updated live (midpoint hit test, row rects re-measured each move)
- `lifted(row)` → (pointer up, normalized position changed) → `idle` + release capture + write `order` + `dirty=true`
- `lifted(row)` → (pointer up, normalized position unchanged) → `idle` + release capture + no write
- `lifted(row)` → (pointercancel, or an `emit` re-render mid lift) → `idle` + no write (re-entrancy cancels the gesture)
- `idle` → (pointer down on row body, released within 350ms or moved beyond 10px before threshold) → plain tap behavior, toggle row tools as today; horizontal drift before lift cancels the lift
- While `lifted`: `touch-action: none` plus preventDefault, page scroll suppressed, horizontal drift ignored, all pointer types (touch, pen, mouse) share the 350ms rule; before lift: `touch-action: pan-y`, normal scroll
- Lift never starts from interactive controls inside the row (row tool buttons, note input): pointerdown on those targets stays `idle`
- Edge auto scroll while lifted is out of scope for v1 (scroll the list before lifting)

**API surface** (client actions only; device local, no auth):
| Action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Apply reorder | `ctx.applyOrder(idList)` | idList: string[] (complete new sequence) | writes `edits.order`, sets `dirty`, emits; no write when the sequence equals the current effective order | none | ids not in plan ignored by existing apply branch |
| Move row | `ctx.moveBlock(id, dir)` (refactored) | id, direction | rewrites `order` by swapping neighbours, `dirty=true` | none | edge row: no-op |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Drop write | new id sequence | current DOM rows carrying a block id attribute, in DOM order at pointerup |
| Lift timer | 350ms threshold | local constant in the gesture code |
| Movement slop | 10px cancel distance | local constant (pre lift only) |
| Candidate gap index | row midpoint under pointer | pointer clientY against row rectangles, re-measured every pointermove |
| "Changed?" check | baseline sequence | snapshot of the effective order taken at lift, compared after apply branch normalization |
| Capture and scroll | `setPointerCapture`, `touch-action` switch | standard pointer event APIs at lift, released at drop or cancel |
| Clock references (row labels) | block start times | unchanged, from `plan.blocks[].start` |

**Key invariants**:
- Exactly one reorder writer shape: `edits.order`; no new writer of `edits.starts` remains in the UI. Writing `order` also clears any legacy `edits.starts` left by the old button path, so the two never combine.
- Engine precedence is pinned: `applyEdits` applies start time shifts first, then `order` decides the sequence; a test pins this so the refactor cannot flip it silently.
- `moveBlock` with no `order` yet materializes the full effective plan id sequence first, then swaps neighbours; edge rows (already first or last) write nothing.
- `dirty` flips only on a real position change, judged after apply branch normalization (AC-4).
- Order arrays always describe the full current plan; stale ids are dropped by the existing apply branch.
- Logged outcomes key off block ids, never positions, so reorder never rewrites logs (AC-5).
- The started flag (spec 0001) lives beside `edits` and is untouched by reorder writes (AC-7).
- An `emit` (and the re-render it causes) during a lift cancels the gesture with no write; the captured DOM node is never trusted across a re-render.

**Security model**: single user, device local, no authentication, no regulated data. Not applicable beyond that.

**Configuration required**: none. No new environment variables, no dependencies (pointer events are platform native, required by the brief's dependency lock).

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: `applyOrder` writes sequence, clears legacy `starts`, `loadState` roundtrip, reloaded plan renders new order, verifies **AC-3**
- No-op: applying the current (normalized) sequence leaves the day entry without edits and dirty false, verifies **AC-4**
- State transition: `moveBlock` materializes then swaps; swap twice restores the original sequence, verifies **AC-6**
- Isolation: reorder leaves `startedId` and log entries untouched, verifies **AC-5**, **AC-7**
- Pin: `applyEdits` with both `starts` and `order` present keeps order as the sequence authority (engine regression pin), verifies **AC-6**

## Build plan

1. [x] Add `applyOrder` (clears legacy `starts`) and refactor `moveBlock` to materialize then write `edits.order`, satisfies **AC-3**, **AC-6**, **AC-7**
2. [x] Long press lift (350ms, 10px slop, vertical lock, pointer capture, row body only), live gap, scroll suppression, re-entrancy cancel, satisfies **AC-1**, **AC-2**, **AC-5**
3. [x] Drop no op guard (normalized comparison against the lift snapshot), satisfies **AC-4**
4. [x] Unit tests: apply roundtrip with `starts` cleared, no op, double swap restores, engine precedence pin, isolation from started flag and logs, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**

## Consequences

**Positive**:
- One reorder mechanism; buttons and drag cannot diverge.
- Times on screen stay generation facts; user preference lives in one array.

**Negative / tradeoffs**:
- The button path changes behavior slightly: Earlier and Later no longer swap times, so rows move without their displayed start times shuffling (start times stay as generated unless the plan regenerates).
- Gesture code is hand rolled pointer event logic (no library allowed), the most fiddly UI code in the app so far.

**Neutral**:
- No schema change, no migration: `order` already exists in the engine and storage types.
- First drag also needs no CSS beyond `touch-action` handling during lift.

## Follow-up

- None.

Rationale: reasoning and options live in [rationale.md](rationale.md).
