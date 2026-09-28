/* WeddingPlan AI — task bank: 12-month wedding planning template.
   Tasks are expressed as days before the wedding; buildTimeline() in
   logic.js converts them to concrete due dates. Browser + Node (UMD). */
"use strict";

/* t = title, d = days before wedding, c = category, tip = plain-language tip */
const WED_TASKS = [
  { t: "Set your total budget", d: 365, c: "budget", tip: "Decide the number first — every other decision gets easier." },
  { t: "Draft the guest list", d: 365, c: "guests", tip: "Start big, then trim. The list drives venue size and catering cost." },
  { t: "Book the venue", d: 330, c: "venue", tip: "Popular venues book 12+ months out. Ask what's included before signing." },
  { t: "Hire the photographer / videographer", d: 300, c: "vendors", tip: "Review full galleries, not just highlights. Confirm backup equipment." },
  { t: "Book the caterer", d: 300, c: "vendors", tip: "Schedule the tasting before you sign. Ask about service staff ratios." },
  { t: "Shop for wedding attire", d: 270, c: "attire", tip: "Order 8–9 months out — alterations alone take 6–8 weeks." },
  { t: "Book the band or DJ", d: 270, c: "vendors", tip: "Watch them perform live or get recent video. Confirm the MC duties." },
  { t: "Book the florist", d: 240, c: "vendors", tip: "Bring photos of what you love. Ask which flowers are in season — cheaper and fresher." },
  { t: "Create the gift registry", d: 240, c: "guests", tip: "Register before invitations go out so guests can find it." },
  { t: "Order invitations", d: 210, c: "paper", tip: "Order 10% extra for mistakes and keepsakes." },
  { t: "Book the officiant", d: 180, c: "ceremony", tip: "Discuss the ceremony script early — no surprises on the day." },
  { t: "Arrange guest transportation", d: 180, c: "vendors", tip: "Shuttles between hotel, ceremony, and reception keep everyone safe and on time." },
  { t: "Book the honeymoon", d: 150, c: "travel", tip: "Check passport expiry dates now — renewals can take months." },
  { t: "Finalize the menu (tasting)", d: 120, c: "food", tip: "Taste the actual dishes, and confirm how dietary needs are handled." },
  { t: "Buy the wedding bands", d: 120, c: "attire", tip: "Allow 6–8 weeks if engraving or custom sizing is needed." },
  { t: "Send the invitations", d: 90, c: "paper", tip: "Mail 8–10 weeks before the wedding; set the RSVP deadline 3–4 weeks out." },
  { t: "Plan the ceremony details", d: 90, c: "ceremony", tip: "Readings, music cues, processional order — write it all down." },
  { t: "Final attire fitting", d: 60, c: "attire", tip: "Bring the actual shoes and undergarments to the fitting." },
  { t: "Create the seating chart", d: 60, c: "guests", tip: "Do it after RSVPs close. Keep a few buffer seats for surprises." },
  { t: "Confirm all vendors", d: 45, c: "vendors", tip: "Reconfirm date, time, location, and final payments in writing." },
  { t: "Get the marriage license", d: 30, c: "legal", tip: "Check your county's rules — many licenses expire 30–60 days after issue." },
  { t: "Give final headcount to caterer", d: 21, c: "food", tip: "This number usually locks — confirm the deadline in your contract." },
  { t: "Pick up attire and rings", d: 14, c: "attire", tip: "Try everything on once more. Pack an emergency kit (stain remover, sewing kit)." },
  { t: "Pack for the honeymoon", d: 7, c: "travel", tip: "Pack now, not the night before the wedding." },
  { t: "Rehearsal and rehearsal dinner", d: 2, c: "ceremony", tip: "Walk the processional at the actual venue if possible." },
  { t: "Rest up — wedding eve", d: 1, c: "ceremony", tip: "Early night. Everything is planned; tomorrow you just enjoy it." }
];

/* Budget categories with auto-split weights (sum = 100). */
const BUDGET_CATEGORIES = [
  { key: "venue",       label: "Venue",            weight: 30 },
  { key: "catering",    label: "Catering & bar",   weight: 25 },
  { key: "photo",       label: "Photo & video",    weight: 10 },
  { key: "attire",      label: "Attire & beauty",  weight: 8 },
  { key: "music",       label: "Music & DJ",       weight: 6 },
  { key: "flowers",     label: "Flowers",          weight: 5 },
  { key: "decor",       label: "Decor & rentals",  weight: 5 },
  { key: "rings",       label: "Rings",            weight: 3 },
  { key: "invites",     label: "Invitations",      weight: 3 },
  { key: "cake",        label: "Cake & desserts",  weight: 2 },
  { key: "transport",   label: "Transportation",   weight: 2 },
  { key: "misc",        label: "Misc & buffer",    weight: 1 }
];

const VENDOR_STAGES = ["researching", "contacted", "booked", "paid"];

const VENDOR_TYPES = [
  "Venue", "Photographer", "Videographer", "Caterer", "Florist",
  "Band / DJ", "Officiant", "Baker", "Transportation", "Planner", "Other"
];

const MEAL_CHOICES = ["Chicken", "Beef", "Fish", "Vegetarian", "Vegan", "Kids", "None"];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { WED_TASKS, BUDGET_CATEGORIES, VENDOR_STAGES, VENDOR_TYPES, MEAL_CHOICES };
}
