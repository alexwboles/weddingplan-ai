/* WeddingPlan AI — core logic: timelines, budget math, RSVP/meal stats,
   vendor stats, nudges. Pure functions; browser-safe. Node tests require it. */
"use strict";

function parseISO(s) {
  const parts = String(s).split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
function toISO(dt) {
  const p = n => String(n).padStart(2, "0");
  return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate());
}
function todayISO() { return toISO(new Date()); }

/** Days from `fromISO` to `dateISO` (can be negative). */
function daysUntil(dateISO, fromISO) {
  const ms = parseISO(dateISO) - parseISO(fromISO || todayISO());
  return Math.round(ms / 86400000);
}

/**
 * Build the wedding timeline.
 * weddingISO: the wedding date. doneIdx: array of task indexes checked off.
 * today: ISO date used as "now" (defaults to real today).
 * Returns tasks with due dates, soonest-first, each with status:
 * done | overdue | today | due-soon (<=14 days) | upcoming
 */
function buildTimeline(weddingISO, doneIdx, today, BANK) {
  const now = today || todayISO();
  const done = new Set(doneIdx || []);
  return BANK.WED_TASKS.map((task, i) => {
    const due = toISO(new Date(parseISO(weddingISO).getTime() - task.d * 86400000));
    const left = daysUntil(due, now);
    let status = "upcoming";
    if (done.has(i)) status = "done";
    else if (left < 0) status = "overdue";
    else if (left === 0) status = "today";
    else if (left <= 14) status = "due-soon";
    return { index: i, title: task.t, category: task.c, tip: task.tip, due, daysLeft: left, status };
  }).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/** First not-done task (soonest due), or null when everything is done. */
function nextTask(timeline) {
  return timeline.find(t => t.status !== "done") || null;
}

/** Budget roll-up: { planned, spent, pct } from [{planned, spent}]. */
function budgetTotals(lines) {
  const planned = lines.reduce((s, l) => s + (Number(l.planned) || 0), 0);
  const spent = lines.reduce((s, l) => s + (Number(l.spent) || 0), 0);
  return { planned, spent, pct: planned > 0 ? Math.round((spent / planned) * 100) : 0 };
}

/** Auto-split a total budget across categories by weight. Sums back to total. */
function suggestedBudget(total, categories) {
  const wSum = categories.reduce((s, c) => s + c.weight, 0);
  let acc = 0;
  return categories.map((c, i) => {
    let planned = Math.round((total * c.weight) / wSum);
    if (i === categories.length - 1) planned = total - acc; // absorb rounding
    else acc += planned;
    return { category: c.key, label: c.label, planned, spent: 0 };
  });
}

/**
 * RSVP stats. guests: [{rsvp: invited|yes|no|maybe, plusOne: bool, meal}].
 * expected = yes + plus-ones + half of maybes (rounded).
 */
function rsvpStats(guests) {
  const yes = guests.filter(g => g.rsvp === "yes");
  const maybe = guests.filter(g => g.rsvp === "maybe").length;
  const plusOnes = yes.filter(g => g.plusOne).length;
  return {
    total: guests.length,
    yes: yes.length,
    expected: yes.length + plusOnes + Math.round(maybe / 2)
  };
}

/** Meal-choice counts among confirmed (yes) guests. */
function mealStats(guests) {
  const counts = {};
  guests.filter(g => g.rsvp === "yes").forEach(g => {
    const m = g.meal || "None";
    counts[m] = (counts[m] || 0) + 1;
  });
  return counts;
}

/** Vendor board stats: { booked, paid, cost } — cost counts booked+paid. */
function vendorStats(vendors) {
  const booked = vendors.filter(v => v.status === "booked" || v.status === "paid").length;
  const paid = vendors.filter(v => v.status === "paid").length;
  const cost = vendors
    .filter(v => v.status === "booked" || v.status === "paid")
    .reduce((s, v) => s + (Number(v.cost) || 0), 0);
  return { total: vendors.length, booked, paid, cost };
}

/** Plain-language nudge based on days left. Null when far out. */
function weddingNudge(daysLeft) {
  if (daysLeft < 0) return "The big day has passed — congratulations! Time to write thank-you notes.";
  if (daysLeft === 0) return "Today is the day! Breathe, smile, and enjoy every minute.";
  if (daysLeft <= 7) return "Only " + daysLeft + " days to go — confirm final details with every vendor this week.";
  if (daysLeft <= 30) return "One month out: lock the seating chart, finalize the headcount, and pick up your attire.";
  if (daysLeft <= 90) return "Three months to go — invitations should be out and major vendors confirmed.";
  if (daysLeft <= 180) return "Six months out: venue, caterer, and photographer should all be booked by now.";
  return null;
}

/** Filter a built timeline by free-text query and/or category. Keeps soonest-first order. */
function filterTimeline(timeline, query, category) {
  const q = String(query || "").trim().toLowerCase();
  return (timeline || []).filter(t => {
    if (category && t.category !== category) return false;
    if (!q) return true;
    return (t.title + " " + t.category + " " + (t.tip || "")).toLowerCase().includes(q);
  });
}

/** Distinct task categories present in the bank (for the filter dropdown). */
function timelineCategories(BANK) {
  const seen = [];
  (BANK.WED_TASKS || []).forEach(t => { if (seen.indexOf(t.c) === -1) seen.push(t.c); });
  return seen;
}

/** Minimal CSV row splitter honoring double-quoted fields. */
function splitCSVRow(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse pasted guest CSV into [{name, rsvp, meal, plusOne}].
 * Header row (name,rsvp,meal,plus_one) optional. meals: allowed meal list.
 * Returns { guests, errors }.
 */
function parseGuestCSV(text, meals) {
  const errors = [], guests = [];
  const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
  if (!lines.length) return { guests, errors: ["Nothing to import — paste CSV rows first."] };
  let start = 0;
  const head = lines[0].toLowerCase();
  if (head.includes("name") && (head.includes("rsvp") || head.includes("meal") || head.includes("plus"))) start = 1;
  const validRsvp = ["invited", "yes", "maybe", "no"];
  const mealList = meals || [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i]);
    const name = cols[0] || "";
    if (!name) { errors.push("Row " + (i + 1) + ": skipped (no name)."); continue; }
    let rsvp = (cols[1] || "invited").toLowerCase();
    if (validRsvp.indexOf(rsvp) === -1) {
      errors.push("Row " + (i + 1) + ": bad RSVP '" + cols[1] + "' — set to invited.");
      rsvp = "invited";
    }
    const meal = cols[2] || "";
    if (meal && mealList.length && mealList.indexOf(meal) === -1) {
      errors.push("Row " + (i + 1) + ": unknown meal '" + meal + "' — kept anyway.");
    }
    const plusOne = /^(yes|true|1|\+1|y)$/i.test(cols[3] || "");
    const diet = (cols[4] || "").trim();
    guests.push({ name, rsvp, meal, plusOne, diet });
  }
  return { guests, errors };
}

/** Guests as CSV (name,rsvp,meal,plus_one,diet) — hand it to the caterer. */
function guestsToCSV(guests) {
  const esc = v => {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = ["name,rsvp,meal,plus_one,diet"];
  (guests || []).forEach(g => lines.push(
    [esc(g.name), esc(g.rsvp || "invited"), esc(g.meal || ""), g.plusOne ? "yes" : "no", esc(g.diet || "")].join(",")
  ));
  return lines.join("\n");
}

/**
 * Plain-text whole-plan summary for printing.
 * BANK: { WED_TASKS, ... } as passed to buildTimeline.
 */
function planSummaryText(weddingISO, budget, guests, vendors, BANK, today) {
  const now = today || todayISO();
  const dl = daysUntil(weddingISO, now);
  const tl = buildTimeline(weddingISO, [], now, BANK);
  const open = tl.filter(t => t.status !== "done");
  const bt = budgetTotals(budget || []);
  const rs = rsvpStats(guests || []);
  const meals = mealStats(guests || []);
  const vs = vendorStats(vendors || []);
  const n = weddingNudge(dl);
  const lines = [];
  lines.push("WEDDING PLAN SUMMARY — " + weddingISO + " (" + dl + " days to go)");
  if (n) lines.push(n);
  lines.push("");
  lines.push("TIMELINE: " + open.length + " of " + tl.length + " tasks remaining");
  open.slice(0, 12).forEach(t => lines.push("  [ ] " + t.due + " — " + t.title + " (" + t.status.replace("-", " ") + ")"));
  if (open.length > 12) lines.push("  …and " + (open.length - 12) + " more");
  lines.push("");
  lines.push("BUDGET: $" + bt.spent.toLocaleString("en-US") + " spent of $" + bt.planned.toLocaleString("en-US") +
    " planned (" + bt.pct + "%)");
  lines.push("");
  lines.push("GUESTS: " + rs.expected + " expected (" + rs.yes + " yes / " + rs.total + " invited)");
  const mealKeys = Object.keys(meals);
  if (mealKeys.length) lines.push("MEALS: " + mealKeys.map(k => k + " x" + meals[k]).join(", "));
  lines.push("");
  lines.push("VENDORS: " + vs.booked + " booked/paid, $" + vs.cost.toLocaleString("en-US") +
    " committed (" + vs.total + " total)");
  return lines.join("\n");
}

/* ---------------------------------------------------------------------------
 * Day-of schedule — timed events for the wedding day with conflict detection.
 * events: [{time: "HH:MM", title, minutes}]. Pure functions; UI persists state.
 * --------------------------------------------------------------------------- */

/** Validate + normalize a schedule event. Throws on bad input. */
function makeScheduleEvent(data) {
  const time = String((data && data.time) || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("time must be HH:MM (24h)");
  const title = String((data && data.title) || "").trim();
  if (!title) throw new Error("event needs a title");
  if (title.length > 80) throw new Error("title too long (max 80)");
  let minutes = Number(data && data.minutes);
  if (!isFinite(minutes) || minutes < 5) minutes = 30;
  if (minutes > 720) minutes = 720;
  return { time, title, minutes: Math.round(minutes) };
}

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Events sorted by start time (returns a new array). */
function sortSchedule(events) {
  return (events || []).slice().sort((a, b) => timeToMin(a.time) - timeToMin(b.time) || a.title.localeCompare(b.title));
}

/**
 * Overlapping event pairs: [{a, b}] where a starts before b ends.
 * Expects sorted or unsorted events; indexes refer to the sorted order.
 */
function scheduleConflicts(events) {
  const s = sortSchedule(events);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const endI = timeToMin(s[i].time) + s[i].minutes;
    for (let j = i + 1; j < s.length; j++) {
      if (timeToMin(s[j].time) < endI) out.push({ a: s[i], b: s[j] });
      else break;
    }
  }
  return out;
}

/** Total scheduled minutes (sum of durations). */
function scheduleTotal(events) {
  return (events || []).reduce((s, e) => s + (Number(e.minutes) || 0), 0);
}

/* ---------------------------------------------------------------------------
 * Dietary restrictions — per-guest diet notes, counted for the caterer.
 * --------------------------------------------------------------------------- */

/** Counts of diet notes among confirmed (rsvp "yes") guests. */
function dietaryStats(guests) {
  const counts = {};
  (guests || []).filter(g => g.rsvp === "yes" && (g.diet || "").trim()).forEach(g => {
    const d = g.diet.trim();
    counts[d] = (counts[d] || 0) + 1;
  });
  return counts;
}

/* ---------------------------------------------------------------------------
 * Budget over-run alerts — categories where spending passed the plan.
 * --------------------------------------------------------------------------- */

/** Lines where spent > planned: [{category, planned, spent, over}]. */
function budgetAlerts(lines) {
  return (lines || [])
    .filter(l => (Number(l.spent) || 0) > (Number(l.planned) || 0))
    .map(l => ({
      category: l.category, planned: Number(l.planned) || 0,
      spent: Number(l.spent) || 0, over: (Number(l.spent) || 0) - (Number(l.planned) || 0)
    }))
    .sort((a, b) => b.over - a.over);
}

/** End of an event in minutes since midnight. Pure. */
function eventEndMin(ev) { return timeToMin(ev.time) + Math.max(0, Number(ev.minutes) || 0); }

/** Day span of a schedule: first start to last end. Pure.
    Returns {startMin, endMin, start, end, label} or null when empty. */
function scheduleSpan(events) {
  const evs = (events || []).filter(e => e && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(e.time || "")));
  if (!evs.length) return null;
  const starts = evs.map(e => timeToMin(e.time));
  const ends = evs.map(e => eventEndMin(e));
  const startMin = Math.min.apply(null, starts);
  const endMin = Math.max.apply(null, ends);
  const p2 = n => String(n).padStart(2, "0");
  const fmt = m => p2(Math.floor(m / 60) % 24) + ":" + p2(m % 60);
  const hrs = Math.floor((endMin - startMin) / 60), mins = (endMin - startMin) % 60;
  return {
    startMin, endMin, start: fmt(startMin), end: fmt(endMin),
    label: fmt(startMin) + "–" + fmt(endMin) + " · " + hrs + "h " + mins + "m day"
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseISO, toISO, todayISO, daysUntil,
    buildTimeline, nextTask, budgetTotals, suggestedBudget,
    rsvpStats, mealStats, vendorStats, weddingNudge,
    filterTimeline, timelineCategories, parseGuestCSV, guestsToCSV, planSummaryText,
    seatingPlan, autoSeat, vendorPayments, rsvpDeadlineISO, rsvpNudges,
    makeScheduleEvent, sortSchedule, scheduleConflicts, scheduleTotal, eventEndMin, scheduleSpan,
    dietaryStats, budgetAlerts
  };
}

/* ---------------------------------------------------------------------------
 * Seating planner — tables: [{name, seats}]; guests seat via g.table.
 * Only confirmed (rsvp "yes") guests are seated; a +1 takes a second seat.
 * seatingPlan reports per-table occupancy + an unassigned list.
 * autoSeat greedily assigns confirmed guests to open seats, returns new guests.
 * --------------------------------------------------------------------------- */
function seatingPlan(guests, tables) {
  const ts = (tables || []).map(t => ({
    name: t.name, seats: Math.max(0, Number(t.seats) || 0), guests: []
  }));
  const unassigned = [];
  (guests || []).forEach((g, gi) => {
    if (g.rsvp !== "yes") return;
    const need = 1 + (g.plusOne ? 1 : 0);
    const t = ts.find(x => x.name === g.table);
    const entry = { name: g.name, seats: need, gi };
    if (t && t.guests.reduce((s, x) => s + x.seats, 0) + need <= t.seats) {
      t.guests.push(entry);
    } else {
      unassigned.push(entry);
    }
  });
  return { tables: ts, unassigned };
}

function autoSeat(guests, tables) {
  const open = (tables || []).map(t => ({ name: t.name, open: Math.max(0, Number(t.seats) || 0) }));
  return (guests || []).map(g => {
    if (g.rsvp !== "yes") return g;
    const need = 1 + (g.plusOne ? 1 : 0);
    const t = open.find(x => x.open >= need);
    if (!t) return g;
    t.open -= need;
    return Object.assign({}, g, { table: t.name });
  });
}

/* ---------------------------------------------------------------------------
 * Vendor payments — vendors may carry deposit (paid), depositDue, balanceDue.
 * vendorPayments reports committed/deposits-paid/balance + overdue vendors.
 * --------------------------------------------------------------------------- */
function vendorPayments(vendors, today) {
  const now = today || todayISO();
  let committed = 0, depositsPaid = 0, balance = 0;
  const overdue = [];
  (vendors || []).forEach(v => {
    if (v.status !== "booked" && v.status !== "paid") return;
    const cost = Number(v.cost) || 0;
    const dep = Math.min(Math.max(0, Number(v.deposit) || 0), cost);
    committed += cost;
    depositsPaid += dep;
    balance += cost - dep;
    const balLeft = cost - dep;
    if ((v.depositDue && v.depositDue < now && dep <= 0) ||
        (v.balanceDue && v.balanceDue < now && balLeft > 0)) {
      overdue.push(v);
    }
  });
  return { committed, depositsPaid, balance, overdue };
}

/* ---------------------------------------------------------------------------
 * RSVP deadline — 28 days before the wedding by default.
 * rsvpNudges lists invited/maybe guests who still owe an answer.
 * --------------------------------------------------------------------------- */
function rsvpDeadlineISO(weddingISO) {
  return toISO(new Date(parseISO(weddingISO).getTime() - 28 * 86400000));
}

function rsvpNudges(guests, weddingISO, today) {
  if (!weddingISO) return null;
  const deadline = rsvpDeadlineISO(weddingISO);
  const daysLeft = daysUntil(deadline, today || todayISO());
  const pending = (guests || [])
    .filter(g => g.rsvp === "invited" || g.rsvp === "maybe")
    .map(g => g.name);
  return { deadline, daysLeft, pending };
}
