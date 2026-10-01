# Verify: engine on off toggle · spec 0005 · updated 2026-10-01
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Fresh day open TODAY → hero shows Engine OFF, hint Turn ON to start Pushups now, empty timeline → AC-1
- [ ] Tap Turn ON → Pushups starts at the ON moment, not at 09:00; permission prompt appears → AC-2, AC-8
- [ ] Press OFF → ring and prompts freeze, header clock keeps ticking, open banners close → AC-3, AC-7
- [ ] OFF for a while, ON again → same occurrence with remaining time intact; reload keeps the state → AC-4
- [ ] While a fine session runs, Turn OFF does nothing (stays ON); while OFF, starting a pay session yields nothing → AC-5
- [ ] ON pressed after the loop window closed → empty chain with window closed note → AC-6
- [ ] Non visit day hero still shows the toggle; ON creates an entry with an empty chain → AC-6
- [ ] Row taps (Done/Skip/X correction) still work while OFF → AC-7

## Commands
- [ ] `npm run verify` → exit 0, suite includes engine tests → all
- [ ] CDP probe: boot OFF, reload, assert zero auto X logs booked for off time → AC-3
- [ ] `?now=10:00` probe: ON, advance clock, OFF, advance again → `state.nowMs` unchanged while OFF → AC-3
- [ ] Storage probe: `daydriver:v1.engine` roundtrips; entries older than 30 days dropped on write → value sourcing

## Acceptance-criteria coverage
- AC-1 fresh OFF hero · AC-2 anchor at ON + permission · AC-3 freeze + no bookings · AC-4 resume + reload · AC-5 session guards · AC-6 late/non visit ON · AC-7 manual edits + real clock · AC-8 start before window
