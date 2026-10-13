# WeddingPlan AI — Redesign Audit (2026-10-13)

Competitors researched: **Zola**, **The Knot** (day-of timeline, wedding-day run-of-events, budget breakdown, guest/RSVP tracking).

## Visual gaps vs competitors
1. The day-of schedule was a flat list of time rows — Zola renders the run of events as a **timeline**: you see the day flow, how long each block runs, and where the gaps/overlaps are.
2. No **day span** ("the day runs 09:00–23:00") or per-event end times.

## Functional gaps vs competitors
1. Duration was invisible in the list — proportional **duration bars** make the day's shape readable at a glance.
2. (Kept as-is, already strong: 12-month timeline bank, budget tracker + alerts, RSVP/meal/dietary stats, vendor board + payments, seating planner, conflict detection, plan summary, print.)

## Redesign plan
- **Day-of timeline**: events render on a vertical timeline with duration bars proportional to their share of the day span, start→end times, and the day's run ("09:00–23:00 · 14h") — grounded in new pure, tested `scheduleSpan(events)` + `eventEndMin(ev)` in logic.js.
- Conflict flagging preserved; all other tabs untouched.

## Concept (1 paragraph)
Keep "The wedding folio" identity (invitation-style hero, countdown) but draw the Day of tab the way Zola draws a run of events: a vertical timeline where each block's bar shows its share of the day — so the couple sees the day's shape, not just its times.
