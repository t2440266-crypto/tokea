# 0005. Engine ON/OFF toggle

**Date**: 2026-10-01
**Status**: In Progress

## Context

The automatic cycling engine (spec 0003) and fine payment mode (spec 0004) run off the wall clock: the moment an occurrence ends unverified, a fine is booked. The owner uses another app for long stretches and does not want the engine quietly piling up fines while away. Today the only way to stop it is to close the tab mid flow, and even then a later reopen reconciles every missed occurrence as an X. The owner needs one obvious switch: turn the day on when they are ready to be driven, turn it off when done, and walk away with nothing accruing. The switch must be visible on TODAY, must default off each day, and must survive a reload so closing the app never loses or invents state.

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

## Rationale

The freeze requirement is the whole feature: every accruing behavior must stop as one. A single effective clock freezes them together with one guard, instead of chasing each timer. The engineer's reload requirement forces the state to be persisted (Option 2 is out), and rewriting the schedule per ON (Option 3) would break the fine session keys and penalty cursor already shipped. `max(storedEff, baseEffMs + (wallMs − resumeWallMs))` is the smallest formula that freezes, resumes exactly, and never rewinds.
