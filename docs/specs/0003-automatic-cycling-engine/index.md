# 0003. Automatic cycling engine

**Date**: 2026-10-01
**Status**: In Progress

## Summary

The visit day currently stops at the end of a clock pinned plan and waits for taps on Start, Done, and Skip. This decision replaces that with an automatic loop: a chain of activities runs from the device clock, wraps from the last activity back to Pushups while inside the visit window, notifies you once when each activity starts, shows every activity's duration and finish time, and asks for a tick or X ten minutes before each activity ends (five minutes to answer, otherwise X is booked automatically). An X books a fine on that activity which a later tick pays off. Lunch out is renamed Food time everywhere you can see it.

## Context

Two people run the same handful of activities every visit day and want the app to drive the day by itself: no opening the app to press Start, no remembering what comes next. The old model pinned lunch to 13:00 and ended the day at a recap block; the new reality is a repeating loop of the same activities, so clock pinned anchors no longer fit, and verification has to come to the user (notifications) instead of the user coming to the app.

Forces: the MASTERPROMPT's zero dependency lock (notifications, vibration, and timers are platform native, no library), the existing per day storage under `daydriver:v1` (additive changes only), the plan order editor from spec 0002 (it becomes the chain order editor), and honesty about platform limits: a fully closed app cannot fire local notifications, so boot reconciliation must book anything the app slept through. Consequence of not deciding: the builder invents the occurrence schema, the fine rules, and the prompt timing mid build, and the cycle math drifts from the tests.

## Requirements

**User stories**:
- As a visitor, I want the day to run itself with a brief notification when each activity starts, so that I never have to open the app to begin the next thing.
- As someone doing the activities, I want a quick tick or X prompt before each one ends, so that what actually happened is recorded and missed activities show up as a fine to pay next cycle.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: On a visit day inside the visit window the chain runs from the device clock with no user action: TODAY shows the current activity and its countdown, no Start, Done, or Skip button exists anywhere, and when an activity's clock ends the next activity in `cycleOrder` starts immediately, wrapping from the last activity back to the first.
- **AC-2**: Every activity (chain rows, timeline segments, the NOW hero) displays its duration and scheduled finish time (`until HH:MM`).
- **AC-3**: When an activity starts, exactly one brief notification fires (`Name · N min · until HH:MM`) if permission is granted; permission is requested once on first visit day load with a plain reason, never re-asked after a denial; when denied the app remains fully functional in banner-only mode. Notifications dedupe by occurrence key so a clock or timezone change cannot re-fire one.
- **AC-4**: The verification prompt opens at `max(start, end−10)` and closes at `max(start, end−5)` (activities of 5 minutes or less get the whole `[start, end)` window and book at end); it appears both as an OS notification with tick and X actions where supported and as an in-app banner overlay above the tab bar, visible on any view.
- **AC-5**: If the prompt is unanswered five minutes before the end, it books X automatically, and the occurrence locks (it cannot re-run in this cycle).
- **AC-6**: A booked X adds one fine to that activity, shown as a neutral amber badge (`1 fine to pay` / `fines 2`); ticking a later occurrence of the same activity in any cycle pays off one owed fine, and a same day correction of an X to tick also removes that fine.
- **AC-7**: The manual Start, Done, and Skip controls are removed; outcomes are recorded only from the tick or X prompt (and its timeout), with `auto` marked on the occurrence.
- **AC-8**: Every user visible occurrence of the name `Lunch out` reads `Food time`; internal ids and log keys keep `lunch` unchanged.
- **AC-9**: On boot the app reconciles from the clock: any activity that ended while it was closed and was never verified books X and its fine (no replayed start notifications), and a sleeping laptop catches up on the next tick because the timeline is computed from timestamps, not timer counts.
- **AC-10**: Outside the visit window or on a non visit day nothing runs and nothing notifies; if the window ends mid activity that activity finishes naturally and the chain stops for the day.

## Decision

**Chosen option**: Chain driven by the device clock with persisted occurrences and per activity fines (see rationale for the options weighed).

`cycleOrder` (additive settings key) defines the loop; occurrences extend the existing append only log; fines are a small additive record keyed by activity kind.

## Feature design

**Data model sketch**:
- `Persisted` (key `daydriver:v1`), additive changes only:
  - `settings.cycleOrder: BlockKind[]` — default `['pushups','smoke','discussion','stories','dumbbell','lunch','parallel']` (Food time after DIY dumbbell); edited by the existing plan order editor
  - `fines: { [kind in BlockKind]?: number }` — owed count per activity; absent kind means zero
  - `logs[]` (`LogEntry`) gains `cycleIndex: number` (1 based cycle of that day), `auto?: true` (set only on timeout and reconcile rows, never on prompt answers), `corrected?: true` (same day x to tick flip); outcome values are `done` and `x` for new rows (`skipped` rows remain valid history)
  - `template.days[date].startedId` stays in storage but becomes dormant (no Start button); spec 0001 flagged stale at the next `/sync`

**State transitions** (one occurrence per activity per cycle):
- `scheduled` → (clock reaches chain start) → `running` + start notification (AC-3)
- `running` → (clock reaches end−10, clamped ≥ start) → `prompt open` + notification with actions and in-app banner (AC-4)
- `prompt open` → (tick) → `locked done` (+ pays one owed fine, AC-6)
- `prompt open` → (X) → `locked x` + `fines[kind] += 1` (AC-5, AC-6)
- `prompt open` → (clock reaches end−5 unanswered) → `locked x` + fine, prompt removed (AC-5)
- `locked x` → (same day tap on the occurrence, correction) → `locked done`, fine removed, `corrected: true` (AC-6)
- `running` → (clock reaches end) → `locked x` without prompt window ever opening (app closed; booked by boot reconcile, AC-9)
- `prompt open` at window end → prompt closes, ticker books x as unverified (AC-10)
- correction UX: tap the locked X row on TODAY, one confirm dialog, x→done only, same day; no reverse flip
- chain index advances on every lock; wrap allowed only while inside the window (AC-1, AC-10)

**Chain math**:
- Occurrence 1 starts at the visit window start; each occurrence is the half-open interval `[start, end)` and the next begins at the previous end; wrap continues from window start again while `now` stays inside the window.
- `cycleIndex` is 1 for the first occurrence of the day and increments only on wrap.
- All comparisons use epoch milliseconds; local `HH:MM` is display only. A window with `end ≤ start` crosses midnight and is treated as ending the next day.

**API surface** (client actions only; device local, no auth):
| Action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Tick the ticker | interval 1s in `main.ts` | none (reads device clock) | computes current activity, boundary events (start, prompt open, prompt close, chain wrap, window stop); within a tick, drains user input before timeout bookings; emits | none | tab throttled: next tick reconciles from timestamps (AC-9) |
| Verify occurrence | `ctx.markVerified(kind, 'tick' \| 'x', opts?: { correction?: true })` | kind, result | appends occurrence row keyed `(date, cycleIndex, kind)` (or flips same day x to done with confirm), adjusts `fines`, emits | none | duplicate verify for the same key, or a late tick after timeout: no-op (correction is the escape hatch) |
| Reconcile on boot | `ctx.reconcile()` called from `createApp` before the ticker starts | none | books x + fines for any occurrence whose scheduled end ≤ now with no locked row; no stored last-close key; never replays start notifications | none | corrupt storage: defaults path (existing) |
| Chain order | existing `ctx.updateSettings({ cycleOrder })` | `BlockKind[]` | persists loop order | none | duplicates in the list: first wins at compute time |
| Prompt banner | fixed overlay above the tab bar, any view | prompt-open state | tick and X buttons calling `markVerified`; hand built element, no library | none | hidden when no prompt is open |
| Notification actions | service worker `notificationclick` | `{action: 'tick' \| 'x', kind, cycleIndex}` | `postMessage` to open clients; no client → `clients.openWindow('/?view=today')`; neither works → drop (reconcile books X) | none | permission denied: banner-only mode |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Current activity, start/end, cycle index | chain math | device clock + `settings.cycleOrder` + configured durations + window; pure function |
| `until HH:MM` labels | end of occurrence | computed chain position (start + duration) |
| Start notification text | name, duration, end time | `TITLES[kind]` (Food time rename), `durations[kind]`, computed end |
| Prompt open/close times | end−10, end−5 | constants `PROMPT_LEAD_MIN = 10`, `PROMPT_TIMEOUT_MIN = 5` in the engine |
| Fine count badge | `fines[kind]` | persisted record, +1 on x, −1 on paying tick or correction (never below 0); display: 0 hidden, 1 → `1 fine to pay`, n≥2 → `fines n` |
| Boot reconciliation window | activities ended with no locked row | clock vs occurrence rows for today's chain (no last-close key stored) |
| Week and recap planned minutes | planned per day | sum of durations the same pure chain function schedules for that day's range; the old pinned plan is unused for new rows |

**Key invariants**:
- Exactly one occurrence per `(date, cycleIndex, kind)`; verify twice is a no-op.
- Timeline derives from timestamps every tick; timers never own state.
- Fines never go negative; one tick pays at most one fine.
- New outcome rows are `done` or `x`; `auto: true` only on timeout and reconcile rows; `skipped` only exists as legacy history.
- Rename touches display strings only; kind `lunch` is frozen (AC-8).
- Chain wraps only while `now` is inside the visit window on a visit day (AC-1, AC-10).
- One tick processes in order: user input, prompt opens, then timeout bookings, each guarded by the occurrence key (single flight per key), so a user tick and the timeout can never both book.
- Start and prompt notifications dedupe by occurrence key, never by clock edge, so a timezone or clock change cannot double fire.
- Zero new dependencies: Notification, vibration, Service Worker messaging only.

**Security model**: single user, device local, no auth, no regulated data. Notification permission is requested with a plain purpose statement and degrades gracefully. Not applicable beyond that.

**Configuration required**: none (no new environment variables).

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Chain math: windows across wrap, cycle index increments, window stop mid activity, verifies **AC-1**, **AC-10**
- Prompt window: clamped lead for a 10 minute activity, whole-window prompt for a 5 minute activity, timeout books x at the close edge, verifies **AC-4**, **AC-5**
- Fines: x books, paying tick clears exactly one, correction clears, floor at zero, verifies **AC-6**
- Reconcile: ended unverified occurrence while closed books x once, no duplicate on second boot, verifies **AC-9**
- Rename: display title reads Food time, id stays `lunch` in logs, verifies **AC-8**

## Build plan

Ordered Tracer Bullet: the pure timeline thread first, then persistence, then the screen, then the notification layer on top.

1. [x] Pure chain engine: `cycleOrder` timeline, occurrence windows, prompt window, wrap and window stop rules + tests, satisfies **AC-1**, **AC-2**, **AC-4** (math), **AC-10**
2. [x] Persistence: `cycleOrder`, `fines`, extended `LogEntry`, `markVerified`, boot `reconcile` + tests, satisfies **AC-5**, **AC-6**, **AC-7** (data side), **AC-9**
3. [x] TODAY auto run: remove Start/Done/Skip, ticker from clock, duration and `until` displays, Food time rename, fine badges, satisfies **AC-1**, **AC-2**, **AC-7**, **AC-8**
4. [x] Notification layer: permission ask, start notification, prompt notification with actions, in-app banner, timeout trigger, SW action messages, satisfies **AC-3**, **AC-4**, **AC-5**
5. [x] Full suite: chain, fines, reconcile, prompt window tests tagged with their ACs, satisfies **AC-4**, **AC-6**, **AC-9**

## Consequences

**Positive**:
- The app drives the day; verification comes to the user; misses become a visible, fair ledger.
- Spec 0002's order editor becomes the loop editor with no new UI needed.

**Negative / tradeoffs**:
- Platform limit: with the app fully closed (tab killed, browser closed) no local notification can fire; boot reconciliation books the missed X instead. Honest gap, stated not hidden.
- Clock pinned lunch anchoring and the recap end block leave the live day flow; week and recap views must read occurrences instead of the old plan (adaptation work in build task 3).
- The old started flag (spec 0001) goes dormant; its Start flow is removed.

**Neutral**:
- No schema break: all storage changes are additive keys and additive fields.
- Vibration stays a light single pulse on verification; sound follows the existing off by default setting.

## Follow-up

- [ ] `/sync` should flag spec 0001 as stale once this ships (its Start based acceptance criteria are removed by AC-7).

Rationale: reasoning and options live in [rationale.md](rationale.md).
