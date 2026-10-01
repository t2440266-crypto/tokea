# Scope: Visit Day Driver

A mobile first PWA that owns the clock on a friend's weekly visit days: it shows what two people are supposed to be doing right now, what is next, and keeps a plain record of the day. All data stays on the device.

**Build approach:** Tracer Bullet (each gap built end to end, UI plus persistence plus tests, working before the next starts).
**Workflow:** Beta (after /develop runs /check verify, then /test). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Day engine and tests | Existing | existing |
| B | Topic bank and rotation | Existing | existing |
| C | Storage and migration | Existing | existing |
| D | TODAY driver screen | Existing | existing |
| E | Topics screen | Existing | existing |
| F | Routine screen | Existing | existing |
| G | Week, Recap, Settings, More | Existing | existing |
| H | PWA shell and offline | Existing | existing |
| 1 | Persist the started flag | Slice 1 | done |
| 2 | Drag to reorder the plan | Slice 1 | done |
| 3 | Template order editor | Slice 1 | done |
| 4 | Lighthouse audit pass | Slice 1 | done |
| 5 | Automatic cycling engine | Slice 2 | in-progress |
| 6 | Every day of the week | Slice 2 | done |
| 7 | Fine payment mode | Slice 3 | in-progress |

## Existing

### A. Day engine and tests · existing
Pure schedule generation: anchor pinning, caps, overflow surfacing, manual edit preservation, faked clock lookup. code in `src/schedule.ts`, tests in `src/schedule.test.ts`

### B. Topic bank and rotation · existing
110 seed topics across 11 categories, no repeat window draws, category filter, history dedupe, auto draw of the day. code in `src/topics.ts`, `src/seedTopics.ts`, `src/seedTopics2.ts`

### C. Storage and migration · existing
Versioned localStorage under `daydriver:v1` with corrupt and unknown version fallback to defaults, additive field migration. code in `src/store.ts`, tests in `src/store.test.ts`

### D. TODAY driver screen · existing
Now hero with countdown ring, next strip, timeline, plan list with tap edits (Earlier, Later, +5, Done, Skip), regenerate guard, unscheduled list. code in `src/ui/today.ts`

### E. Topics screen · existing
Category chips, draw button, topic card with Discuss now / Done / Save for later, history list, custom topic form. code in `src/ui/topics.ts`

### F. Routine screen · existing
Dumbbell set check off, rest timer between sets, pushups quick start counter with auto logging. code in `src/ui/routine.ts`

### G. Week, Recap, Settings, More · existing
Week grid with coverage warnings, recap with score formula and notes, full settings editors including caps, durations, routine and topic bank. code in `src/ui/week.ts`, `src/ui/recap.ts`, `src/ui/settings.ts`, `src/ui/more.ts`

### H. PWA shell and offline · existing
Manifest, icons, service worker shell cache, proven offline reload, self hosted fonts. code in `public/`, `src/styles.css`

## Slice 1: v1 completion

### 1. Persist the started flag · done
Remember that a block was started, so a reload mid block does not push the user back to the Start button. Today the started map lives in memory only.
**Done when:** starting a block, reloading the page, and returning to TODAY still shows Done, Skip, +5 for that block, and the flag clears once the block is logged or skipped.
- [x] Design it (spec): `/architect persist the started flag`
- [x] Build it: /develop persist the started flag
   - [x] Type extension and hydrate from storage (AC-1, AC-4)
   - [x] Persist on start, clear on log, single active, ensureDay bootstrap (AC-1, AC-2, AC-3)
   - [x] Stale id guard plus merge and emit invariants (AC-5)
   - [x] Storage tests: roundtrip, legacy field, corrupt fallback (AC-6, AC-7)
- [x] Verify it: /check verify persist the started flag
- [x] Test it: /test persist the started flag
Spec [0001](../specs/0001-persist-started-flag/index.md) · code in `src/app.ts`, `src/store.ts`

### 2. Drag to reorder the plan · done
Reorder plan blocks by dragging a row on TODAY, as the MASTERPROMPT asked, next to the existing tap edits. Touch scrolling on the timeline must keep working.
**Done when:** a user can drag a plan row to a new position, the new order persists for that day, regenerate still confirms before discarding edits, and the engine tests for edit preservation still pass.
- [x] Design it (spec): `/architect drag to reorder the plan`
- [x] Build it: /develop drag to reorder the plan
   - [x] `applyOrder` action plus `moveBlock` refactor on `edits.order`, legacy `starts` cleared (AC-3, AC-6, AC-7)
   - [x] Long press lift, live gap, scroll suppression, re-entrancy cancel (AC-1, AC-2, AC-5)
   - [x] Normalized no-op drop guard (AC-4)
   - [x] Unit tests: roundtrip, no-op, double swap, precedence pin, isolation (AC-3…AC-7)
- [x] Verify it: /check verify drag to reorder the plan
- [x] Test it: /test drag to reorder the plan
Spec [0002](../specs/0002-drag-to-reorder-plan/index.md) · code in `src/app.ts`, `src/ui/today.ts`, `src/styles.css`

### 3. Template order editor · done
Let the owner reshape the default flexible block order in Settings, feeding `settings.template` which the engine already consumes.
**Done when:** Settings shows the flexible blocks with move controls, a changed order flows into newly generated plans, caps and anchors still hold, and the value survives reload.
- [x] Build it: `/develop template order editor`
- [x] Verify it: CDP probe — swap persisted across reload, engine pin for placement (`ORDER_EDITOR: PASS`)
- [x] Test it: placement pin in `schedule.test.ts`, template roundtrip assert in `store.test.ts`, 50/50 green
Code in `src/ui/settings.ts`, `src/schedule.test.ts`, `src/store.test.ts`

### 4. Lighthouse audit pass · Alpha · done
Prove the premium floor with a real audit: npx one off run against the local preview (no package.json change, agreed at planning).
**Done when:** installable and offline criteria pass, no console errors, first paint within budget, scores recorded in the report, and any blockers fixed before closing.
- [x] Build it: `/develop lighthouse audit pass`
- [x] Verify it: lighthouse@11 run on local preview — performance 97, accessibility 100, best practices 100, PWA 100, FCP 988ms, installable 1, maskable 1, console errors 0; blockers fixed (maskable purpose, static shell, inlined CSS)
Code in `public/manifest.webmanifest`, `index.html`

## Slice 2: Automatic cycling engine

### 5. Automatic cycling engine · in-progress
Endless activity loop on visit days: each activity auto-starts on its own clock with a one-time notification, shows its duration and finish time, and closes with a tick or X verification prompt (5 minute timeout auto marks X) that locks the activity and books a fine to pay when the cycle reaches that activity again. Lunch out is renamed Food time everywhere. Manual Start, Done, and Skip controls are removed; the app runs itself.

**Done when:** the cycle wraps from the last activity back to Pushups with no app input; every activity shows its duration and finish time; a brief one-time notification fires when each activity starts; a tick/X prompt appears 10 minutes before the activity ends, disappears after 5 minutes unconfirmed and marks X; X locks the activity, books a fine visible on that activity when the next cycle reaches it, and a tick locks it clean; rename to Food time is visible across the app.

- [x] Design it (spec): `/architect automatic cycling engine`
- [x] Build it: /develop automatic cycling engine
   - [x] Pure chain engine: timeline, prompt window, wrap, window stop + tests (AC-1, AC-2, AC-10)
   - [x] Persistence: cycleOrder, fines, extended LogEntry, markVerified, boot reconcile + tests (AC-5, AC-6, AC-9)
   - [x] TODAY auto run: remove Start/Done/Skip, clock ticker, duration/until displays, Food time rename, fine badges (AC-1, AC-7, AC-8)
   - [x] Notification layer: permission, start and prompt notifications, in-app banner, SW actions, timeout (AC-3, AC-4, AC-5)
   - [x] Full AC-tagged suite green (AC-4, AC-6, AC-9)
- [ ] Verify it: /check verify automatic cycling engine
- [x] Test it: /test automatic cycling engine
Spec [0003](../specs/0003-automatic-cycling-engine/index.md) · code in `src/cycle.ts`, `src/main.ts`, `src/ui/today.ts`, `src/notify.ts`, `public/sw.js`

### 6. Every day of the week · done
Run the loop on all seven days, not just five, because the app is used personally even when no friend visits. Existing saves that still hold the old five day default upgrade to seven; anything the owner customized is left alone.

**Done when:** fresh installs default to visit days 0 through 6; a save carrying the untouched old default `[1,2,3,4,5]` migrates to all seven; a customized day set survives unchanged; Settings shows all seven selected by default.
- [x] Build it: `/develop every day of the week`
- [x] Verify it: CDP probe on Settings — 7 chips selected, `visitDays=0,1,2,3,4,5,6` (PASS); migration units cover upgrade and custom-set cases
- [x] Test it: default + migration tests in `schedule.test.ts` and `store.test.ts`; suite 77/77
Code in `src/schedule.ts`, `src/store.ts`

## Slice 3: Fine payment mode

### 7. Fine payment mode · in-progress
Tapping a missed activity from an earlier cycle opens a pay-fine flow instead of the plain correction: a custom confirmation with the exact copy and a `Pay fine and start the time-count` button starts a time-count session for that one activity; 10 minutes before it ends the verification prompt appears with a `The activity done and Fine Paid` button, and ticking it clears the fine. The daily chain keeps running during the session and every daily activity overlapping it is charged +25 minutes; the session card shows the no-sympathy taunt copy while you pay.

**Done when:** tapping a previous cycle miss shows the custom confirm with `Pay fine and start the time-count`; pressing it starts a countdown for that activity only; the prompt at end minus 10 offers `The activity done and Fine Paid` and ticking clears the fine; the chain keeps advancing during the session, every overlapping activity carries +25 minutes on the timeline; the taunt line is visible while paying.
- [x] Design it (spec): `/architect fine payment mode`
- [x] Build it: /develop fine payment mode
   - [x] Pure engine: session windows, sequential +25 cursor, live running extension + tests (AC-5)
   - [x] Persistence: fineSessions, start/answer/expire (ticker + boot), idempotent paid, endsAt guard + tests (AC-2, AC-3, AC-4, AC-7)
   - [x] UI: confirm card exact copy, session hero with taunt, prompt copy switch, live-ledger row routing, stacked overlay (AC-1, AC-6, AC-8)
   - [x] All `chainSchedule` callers pass sessions; AC-tagged suite green (AC-3, AC-5)
- [ ] Verify it: /check verify fine payment mode
- [x] Test it: /test fine payment mode
Spec [0004](../specs/0004-fine-payment-mode/index.md) · code in `src/cycle.ts`, `src/app.ts`, `src/main.ts`, `src/ui/today.ts`, `src/notify.ts`

## Deferred
Out of scope for this build pass, kept so the plan stays honest. These are MASTERPROMPT non goals.
- **Server, accounts, cloud sync** · none in v1
- **Push and scheduled notifications** · none in v1
- **Social features and gamified streaks** · none in v1
- **Analytics and AI calls** · none in v1
- **Deployment and hosting** · none in v1

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it`, `Test it`); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; Beta closes after `/test` |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop`. The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre workflow) and `dropped` (kept for history).
- **Workflow tier tag** beside a heading (e.g. `· Alpha`) sets that one feature's rigor above or below the project default Beta.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
