# 0002. Drag to reorder the plan — rationale

## Context

Plan rows are the structure of the visit day, and the phone sits flat on a table under two readers. The engine already supports an explicit id order (`applyEdits` handles `order`, tested), and the current Earlier and Later buttons write start time swaps instead. Adding a second mechanism would mean two writers that fight: after the first drag the order branch wins and the buttons stop moving rows visually. The gesture must also coexist with normal list scrolling on a touch screen, and with the regenerate confirm that guards manual edits.

Forces: one thumb at 375px, no drag libraries allowed by the brief, existing tap to expand row tools must keep working, and dirty flag semantics drive the regenerate confirmation. Consequence of not deciding: the builder picks a persistence shape per call site and the two reorder paths silently diverge.

## Options considered

### Option 1: Unify on `edits.order`

Drag drop writes the full id sequence; Earlier and Later are refactored to reorder the same array. The engine's `order` branch becomes the only reorder writer.

**Pros**:
- One source of truth; the tested engine branch does the rendering work; times never shift when position changes.

**Cons**:
- Touches the existing button path (small refactor) instead of leaving it alone.

### Option 2: Start time swaps for both

Drag computes the same start time swaps the buttons already write.

**Pros**:
- No new field; one mechanism without touching the buttons.

**Cons**:
- A position move becomes a time change, which drifts displayed clock times away from generation times and makes order harder to reason about.

### Option 3: Keep both writers

Drag writes `order`, buttons keep start swaps.

**Pros**:
- Least code churn on day one.

**Cons**:
- After the first drag the order branch wins rendering and the buttons silently stop moving rows. A known broken state.

## Rationale

The engine branch for `order` already exists and is tested, so the decision costs one action and one button refactor instead of a new persistence shape. Times stay facts about generation, positions stay facts about user preference, and the dirty flag (which drives the regenerate confirm) flips only when the user actually moved something, which is exactly the no-op rule the engineer chose.

A cross check on a separate model surfaced twelve gesture and completeness gaps (tap after lift, slop value, gap hit test, pointer capture, scroll mechanism, axis lock, pointer types, control exclusion, normalized no-op compare, lift snapshot, moveBlock materialization, edge auto scroll) plus three soundness notes (legacy starts precedence, test expectations, re-entrancy); all fifteen resolutions were folded into the build spec before acceptance.
