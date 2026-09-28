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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseISO, toISO, todayISO, daysUntil,
    buildTimeline, nextTask, budgetTotals, suggestedBudget,
    rsvpStats, mealStats, vendorStats, weddingNudge
  };
}
