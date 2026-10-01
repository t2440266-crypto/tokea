# 0001. Persist the started flag — rationale

## Context

The TODAY screen is the product: the current block must be visible and actionable in one glance. The hero card already walks Start to Done, Skip, and +5, but that started state is a plain in memory map, so any reload mid block resets the hero to Start. The MASTERPROMPT requires that the recap and logs survive reload and that NOW and NEXT stay correct at a glance, and a started block is part of that truth: the user explicitly said the block is running.

The storage layer already keeps a per day entry (`template.days[date]`) holding plan edits, a dirty flag, and a day note. Local storage is single user, device local, with no server, no accounts, and no regulated data. Without this decision the builder would invent where the flag lives and when it clears, and two features (drag to reorder, regenerate) would each guess differently. The consequence of skipping the decision is inconsistent runtime state scattered across the store.

## Options considered

### Option 1: `template.days[date].startedId`

Add a nullable string beside the existing per day `edits`, `dirty`, and `note` fields. Single active fits a single string; the loader already validates `template.days`, so the change is an additive type extension.

**Pros**:
- Reuses the per day entry and its validation; no new top level key in the schema the brief named.
- One string enforces single active by construction.

**Cons**:
- Mixes run state (started) with plan state (edits, note) in one bucket.

### Option 2: New top level `started` map

A separate `started: { [date]: string }` key in the persisted object.

**Pros**:
- Clean separation of run state from plan state.

**Cons**:
- Adds a top level schema key the brief's schema list did not name; needs its own validation branch in `migrate`.

### Option 3: Store on generated plan blocks

Carry a `started` boolean on each block object.

**Pros**:
- No persistence plumbing.

**Cons**:
- Plans are recomputed from scratch on every render, so the flag would not survive a reload. Fatal for the requirement.

## Rationale

The per day entry is where every other date scoped fact already lives, so the loader, the migration path, and the regenerate confirm all sit in one place. A single string makes the "one active block" rule structural rather than a rule to enforce, and the brief's schema list already contains `template`, so no schema question is reopened. The bucket mixing noted in the cons is acceptable because both contents share the same lifetime: one visit date.

A cross check on a separate model surfaced twelve gaps (id stability, bootstrap defaults, state authority, visibility when the clock moves on, emit persistence, retention of stale ids, the AC-6 split, date key accumulation, absence of `startedAt`, merge write discipline, reset interaction, and existing vs new code); all twelve resolutions were applied to the build spec, and the multi tab last writer wins behavior is recorded there as a stated non goal.
