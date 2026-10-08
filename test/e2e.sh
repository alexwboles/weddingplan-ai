#!/usr/bin/env bash
# WeddingPlan AI e2e tests — 7 flows exercising real logic in Node. Exit non-zero on failure.
set -u
cd "$(dirname "$0")/.."
pass=0; fail=0
flow() { # $1 = description, $2 = node script
  if node -e "$2" >/dev/null 2>&1; then echo "PASS: $1"; pass=$((pass+1));
  else echo "FAIL: $1"; fail=$((fail+1)); fi
}

flow "venue task due 330 days before wedding" "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const tl=L.buildTimeline('2027-09-28',[],'2026-09-28',B);
  const v=tl.find(t=>t.title==='Book the venue');
  if(!v) throw new Error('venue task missing');
  if(v.due!=='2026-11-02') throw new Error('venue due: '+v.due);
  if(tl[0].due>v.due) throw new Error('not sorted soonest-first');
"

flow "overdue detection flags year-out tasks when wedding is near" "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const tl=L.buildTimeline('2026-10-28',[],'2026-09-28',B);
  const od=tl.filter(t=>t.status==='overdue');
  if(!od.length) throw new Error('no overdue found');
  if(!od.some(t=>t.title==='Book the venue')) throw new Error('venue not overdue');
"

flow "done tasks are skipped by nextTask" "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const all=B.WED_TASKS.map((_,i)=>i);
  const tl=L.buildTimeline('2027-09-28',all,'2026-09-28',B);
  if(L.nextTask(tl)!==null) throw new Error('expected null');
"

flow "rsvp headcount: yes + plus-ones + half maybes" "
  const L=require('./js/logic.js');
  const st=L.rsvpStats([
    {rsvp:'yes',plusOne:true},{rsvp:'yes'},{rsvp:'maybe'},{rsvp:'maybe'},{rsvp:'no'},{rsvp:'invited'}
  ]);
  if(st.expected!==4) throw new Error('expected 4, got '+st.expected);
  if(st.total!==6) throw new Error('total wrong');
"

flow "meal stats count only confirmed guests" "
  const L=require('./js/logic.js');
  const m=L.mealStats([
    {rsvp:'yes',meal:'Chicken'},{rsvp:'yes',meal:'Fish'},{rsvp:'maybe',meal:'Chicken'},{rsvp:'no',meal:'Beef'}
  ]);
  if(m.Chicken!==1||m.Fish!==1) throw new Error(JSON.stringify(m));
  if(m.Beef) throw new Error('no-guest meal counted');
"

flow "budget auto-split sums to total" "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const lines=L.suggestedBudget(30000,B.BUDGET_CATEGORIES);
  const sum=lines.reduce((s,l)=>s+l.planned,0);
  if(sum!==30000) throw new Error('sum='+sum);
  const venue=lines.find(l=>l.category==='venue');
  if(!venue||venue.planned!==9000) throw new Error('venue should be 9000, got '+(venue&&venue.planned));
"

flow "vendor stats: booked+paid counted, researching excluded from cost" "
  const L=require('./js/logic.js');
  const st=L.vendorStats([
    {cost:5000,status:'booked'},{cost:2000,status:'paid'},{cost:1500,status:'researching'}
  ]);
  if(st.booked!==2) throw new Error('booked='+st.booked);
  if(st.paid!==1) throw new Error('paid='+st.paid);
  if(st.cost!==7000) throw new Error('cost='+st.cost);
"

flow "timeline search + category filter narrow the plan" "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const tl=L.buildTimeline('2027-09-28',[],'2026-09-28',B);
  const venue=L.filterTimeline(tl,'venue','');
  if(!venue.length||!venue.every(t=>(t.title+t.tip).toLowerCase().includes('venue'))) throw new Error('search failed');
  const cat=L.filterTimeline(tl,'','vendors');
  if(!cat.length||!cat.every(t=>t.category==='vendors')) throw new Error('category filter failed');
  const combo=L.filterTimeline(tl,'cake','vendors');
  if(combo.length!==0) throw new Error('combo should be empty');
  if(L.filterTimeline(tl,'','').length!==26) throw new Error('empty filter should return all');
"

flow "guest CSV import parses rows, flags bad RSVPs, keeps unknown meals" "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const csv='name,rsvp,meal,plus_one\nJane Doe,yes,Chicken,yes\n\"Smith, Bob\",maybe,Fish,no\nNo RSVP,,Beef,\nBad Row,weird,Tofu,maybe';
  const r=L.parseGuestCSV(csv,B.MEAL_CHOICES);
  if(r.guests.length!==4) throw new Error('guests='+r.guests.length);
  if(r.guests[0].name!=='Jane Doe'||r.guests[0].rsvp!=='yes'||!r.guests[0].plusOne) throw new Error('row 1 wrong: '+JSON.stringify(r.guests[0]));
  if(r.guests[1].name!=='Smith, Bob') throw new Error('quoted name broken: '+r.guests[1].name);
  if(r.guests[2].rsvp!=='invited') throw new Error('blank rsvp should default to invited');
  if(r.guests[3].rsvp!=='invited') throw new Error('bad rsvp should reset to invited');
  if(!r.errors.some(e=>/bad RSVP/.test(e))) throw new Error('bad RSVP not flagged');
  if(!r.errors.some(e=>/unknown meal/.test(e))) throw new Error('unknown meal not flagged');
  const empty=L.parseGuestCSV('   ',B.MEAL_CHOICES);
  if(empty.guests.length!==0||!empty.errors.length) throw new Error('empty input mishandled');
"

flow "guest CSV export round-trips names with commas" "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const guests=[{name:'Smith, Bob',rsvp:'yes',meal:'Fish',plusOne:false},{name:'Jane',rsvp:'maybe',meal:'',plusOne:true}];
  const csv=L.guestsToCSV(guests);
  const lines=csv.split('\n');
  if(lines[0]!=='name,rsvp,meal,plus_one') throw new Error('bad header');
  if(lines.length!==3) throw new Error('line count '+lines.length);
  if(lines[1]!=='\"Smith, Bob\",yes,Fish,no') throw new Error('escape wrong: '+lines[1]);
  const back=L.parseGuestCSV(csv,B.MEAL_CHOICES);
  if(back.guests.length!==2||back.guests[0].name!=='Smith, Bob') throw new Error('round-trip failed');
"

flow "plan summary text covers timeline, budget, guests, vendors" "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const budget=L.suggestedBudget(30000,B.BUDGET_CATEGORIES);
  budget[0].spent=5000;
  const guests=[{name:'A',rsvp:'yes',meal:'Chicken',plusOne:true},{name:'B',rsvp:'maybe',meal:'Fish',plusOne:false}];
  const vendors=[{name:'V',type:'Venue',cost:8000,status:'booked',notes:'555-1234'}];
  const txt=L.planSummaryText('2027-09-28',budget,guests,vendors,B,'2026-09-28');
  for(const needle of ['WEDDING PLAN SUMMARY','2027-09-28','TIMELINE:','BUDGET:','GUESTS:','VENDORS:','3 expected','8,000']) {
    if(txt.indexOf(needle)===-1) throw new Error('missing: '+needle);
  }
  if(txt.indexOf('Chicken x1')===-1) throw new Error('meal counts missing');
"

echo "--- e2e: $pass passed, $fail failed ---"
exit $((fail>0))
