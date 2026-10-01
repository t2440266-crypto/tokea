# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Today driver screen: current block with live countdown ring, next block strip, horizontal day timeline, and progress through the plan, readable from arm's length on a shared table.
- Automatic day plans for the five configured visit days: pinned lunch and recap anchors, per day caps on smoke and parallel downtime, and an unscheduled list when blocks do not fit, never dropped silently.
- Started block state survives a page reload, clears only on Done or Skip, and is ignored for any other date (see spec 0001).
- Drag to reorder plan rows with a long press lift and live gap, unified with the Earlier and Later buttons on one order field; drops that change nothing write nothing (see spec 0002).
- Topic bank of 110 seeded topics across 11 categories, each with discussion prompts and a closer, a once a day draw with a 30 day no repeat window, custom topic creation, editing, and save for later.
- Routine screen for dumbbell day: set check off with a rest timer between sets, plus a pushups quick start set counter that logs the block when finished.
- Week view with planned versus done bars and warn only coverage reminders, recap with days done versus planned, minutes per interest, topic drawn, day note, and a score shown with its formula.
- Full settings: visit days, visit window, lunch target and window, block durations, daily caps, pushups sets and reps, no repeat window, completion sound, routine editor, topic bank editor, plan order editor, JSON export, and full reset.
- Installable PWA that opens and logs data offline after the first load, with self hosted fonts and a cached app shell.
