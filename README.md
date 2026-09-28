# WeddingPlan AI

**Your wedding, planned — without the spreadsheet chaos.** Enter your wedding date → WeddingPlan AI generates a 12-month planning timeline, tracks your budget by category, manages the guest list with RSVPs and meal choices, and keeps every vendor organized — all running 100% locally in your browser.

## The problem

Wedding planning is a 12-month project with a hundred moving parts: venues book out a year ahead, the budget quietly doubles, RSVPs live in five text threads, and nobody remembers who ordered the cake. WeddingPlan AI puts the whole wedding in one place:

1. **12-month timeline** — 26 tasks auto-scheduled backwards from your date (book the venue, send invitations, get the license…), each with a plain-language tip and overdue / due-soon / today states
2. **Budget tracker** — planned vs. spent by category with a progress bar, plus a one-click auto-split that divides a total budget sensibly (venue 30%, catering 25%, …)
3. **Guest list + RSVPs** — expected headcount math (yes + plus-ones + half of maybes) and meal-choice counts for the caterer
4. **Vendor board** — researching → contacted → booked → paid pipeline with committed-spend totals
5. **Countdown + nudges** — days-to-go counter with plain-language guidance that escalates as the day nears
6. **Optional AI polish** — paste your own OpenAI API key for rewritten wording (never required)

## How to run

No build step, no server, no account. Just open `index.html` in any browser — or serve it statically:

```bash
npx serve .        # or: python3 -m http.server 8080
```

Your data lives in `localStorage` under `weddingplan.v1`. Nothing ever leaves your device.

## How the timeline works

Tasks live in `js/wedbank.js` as "days before the wedding". `buildTimeline()` converts them to concrete due dates from your wedding date, sorts soonest-first, and marks each task overdue / due-soon (≤14 days) / today / upcoming / done. Checking a task off removes it from the "next up" nudge.

Budget auto-split uses fixed category weights (summing to 100) scaled to your total, with rounding absorbed by the last category so the split always sums exactly.

## Tests

```bash
bash test/smoke.sh   # 12 checks: files, syntax, data bank integrity, core math
bash test/e2e.sh     # 7 flows: timeline generation, overdue detection, RSVP/meal math, budget split, vendor stats
```

## Pricing vision (future)

Free for one wedding. A paid tier could add multi-event planning, shareable guest links, and printable day-of schedules — but the core stays free and local-first, always.

## License

MIT — do whatever you want with it.
