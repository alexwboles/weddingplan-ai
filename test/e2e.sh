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
  if(lines[0]!=='name,rsvp,meal,plus_one,diet') throw new Error('bad header: '+lines[0]);
  if(lines.length!==3) throw new Error('line count '+lines.length);
  if(lines[1]!=='\"Smith, Bob\",yes,Fish,no,') throw new Error('escape wrong: '+lines[1]);
  const back=L.parseGuestCSV(csv,B.MEAL_CHOICES);
  if(back.guests.length!==2||back.guests[0].name!=='Smith, Bob') throw new Error('round-trip failed');
  const wd=L.parseGuestCSV('name,rsvp,meal,plus_one,diet\\nJane,yes,Chicken,no,Gluten-free',B.MEAL_CHOICES);
  if(wd.guests[0].diet!=='Gluten-free') throw new Error('diet column not parsed');
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

flow "seating plan fills tables, counts +1 seats, lists unassigned" "
  const L=require('./js/logic.js');
  const tables=[{name:'T1',seats:4},{name:'T2',seats:2}];
  const guests=[
    {name:'A',rsvp:'yes',table:'T1'},
    {name:'B',rsvp:'yes',plusOne:true,table:'T1'},
    {name:'C',rsvp:'yes',table:'T2'},
    {name:'D',rsvp:'yes',table:'T2'},
    {name:'E',rsvp:'yes',table:'T2'},
    {name:'F',rsvp:'maybe',table:'T1'}
  ];
  const plan=L.seatingPlan(guests,tables);
  if(plan.tables[0].guests.length!==2) throw new Error('T1 should seat 2 entries');
  if(plan.tables[1].guests.length!==2) throw new Error('T2 holds 2 seats only');
  if(plan.unassigned.length!==1||plan.unassigned[0].name!=='E') throw new Error('E should be unassigned');
  if(plan.tables[0].guests[0].gi!==0) throw new Error('gi tracking broken');
"

flow "autoSeat fills tables greedily for confirmed guests" "
  const L=require('./js/logic.js');
  const tables=[{name:'T1',seats:2}];
  const guests=[{name:'A',rsvp:'yes'},{name:'B',rsvp:'yes',plusOne:true},{name:'C',rsvp:'yes'},{name:'D',rsvp:'no'}];
  const seated=L.autoSeat(guests,tables);
  if(seated[0].table!=='T1') throw new Error('A not seated');
  if(seated[1].table) throw new Error('B+1 needs 2 seats, T1 has 1 left');
  if(seated[2].table!=='T1') throw new Error('C should take the last seat');
  if(seated[3].table) throw new Error('declined guest seated');
  if(guests[0].table) throw new Error('autoSeat mutated input');
"

flow "vendor payments: deposits, balance, overdue detection" "
  const L=require('./js/logic.js');
  const vendors=[
    {name:'Venue',cost:8000,deposit:2000,depositDue:'2026-01-01',balanceDue:'2026-06-01',status:'booked'},
    {name:'Photo',cost:3000,deposit:3000,status:'paid'},
    {name:'Band',cost:2500,status:'researching'}
  ];
  const p=L.vendorPayments(vendors,'2026-10-12');
  if(p.committed!==11000) throw new Error('committed '+p.committed);
  if(p.depositsPaid!==5000) throw new Error('deposits '+p.depositsPaid);
  if(p.balance!==6000) throw new Error('balance '+p.balance);
  if(p.overdue.length!==1||p.overdue[0].name!=='Venue') throw new Error('overdue wrong');
"

flow "rsvp nudges: 28-day deadline, pending list" "
  const L=require('./js/logic.js');
  if(L.rsvpDeadlineISO('2027-09-28')!=='2027-08-31') throw new Error('deadline wrong: '+L.rsvpDeadlineISO('2027-09-28'));
  const n=L.rsvpNudges([{name:'A',rsvp:'yes'},{name:'B',rsvp:'invited'},{name:'C',rsvp:'maybe'},{name:'D',rsvp:'no'}],'2027-09-28','2026-09-28');
  if(n.pending.length!==2||n.pending[0]!=='B') throw new Error('pending wrong');
  if(n.daysLeft!==337) throw new Error('daysLeft '+n.daysLeft);
  if(L.rsvpNudges([],'')!==null) throw new Error('should be null without date');
"

flow "day-of schedule: validation, sorting, conflict detection" "
  const L=require('./js/logic.js');
  const e1=L.makeScheduleEvent({time:'14:00',title:'Ceremony',minutes:45});
  if(e1.time!=='14:00'||e1.minutes!==45) throw new Error('event wrong');
  let threw=0;
  try{L.makeScheduleEvent({time:'2pm',title:'x'})}catch(e){threw++}
  try{L.makeScheduleEvent({time:'14:00',title:'  '})}catch(e){threw++}
  if(threw!==2) throw new Error('expected 2 rejections');
  const srt=L.sortSchedule([{time:'16:00',title:'B'},{time:'14:00',title:'A'}]);
  if(srt[0].title!=='A') throw new Error('not sorted');
  const conf=L.scheduleConflicts([
    {time:'14:00',title:'Ceremony',minutes:60},
    {time:'14:30',title:'Photos',minutes:30},
    {time:'16:00',title:'Reception',minutes:120}
  ]);
  if(conf.length!==1||conf[0].a.title!=='Ceremony'||conf[0].b.title!=='Photos') throw new Error('conflict wrong: '+JSON.stringify(conf));
  const clean=L.scheduleConflicts([{time:'14:00',title:'A',minutes:30},{time:'14:30',title:'B',minutes:30}]);
  if(clean.length) throw new Error('back-to-back is not a conflict');
  if(L.scheduleTotal([{minutes:45},{minutes:15}])!==60) throw new Error('total wrong');
"

flow "dietaryStats counts confirmed guests with diet notes" "
  const L=require('./js/logic.js');
  const d=L.dietaryStats([
    {name:'A',rsvp:'yes',diet:'Gluten-free'},
    {name:'B',rsvp:'yes',diet:'gluten-free'},
    {name:'C',rsvp:'invited',diet:'Vegan'},
    {name:'D',rsvp:'yes',diet:''},
    {name:'E',rsvp:'no',diet:'Nut allergy'}
  ]);
  if(d['Gluten-free']!==1||d['gluten-free']!==1) throw new Error('case kept distinct: '+JSON.stringify(d));
  if(Object.keys(d).length!==2) throw new Error('only confirmed with notes: '+JSON.stringify(d));
"

flow "budgetAlerts flags over-plan categories, biggest overage first" "
  const L=require('./js/logic.js');
  const a=L.budgetAlerts([
    {category:'venue',planned:9000,spent:9500},
    {category:'catering',planned:7500,spent:7000},
    {category:'music',planned:1800,spent:2400}
  ]);
  if(a.length!==2) throw new Error('want 2, got '+a.length);
  if(a[0].category!=='music'||a[0].over!==600) throw new Error('sort wrong: '+JSON.stringify(a));
  if(a[1].category!=='venue'||a[1].over!==500) throw new Error('venue wrong');
  if(L.budgetAlerts([]).length) throw new Error('empty -> none');
"

flow "day-of timeline: span covers the full run of events" "
  const L=require('./js/logic.js');
  const evs=[L.makeScheduleEvent({time:'09:00',title:'Hair',minutes:180}),L.makeScheduleEvent({time:'18:00',title:'Reception',minutes:240})];
  const sp=L.scheduleSpan(evs);
  if(sp.startMin!==540||sp.endMin!==1320) throw new Error(JSON.stringify(sp));
  if(L.scheduleTotal(evs)!==420) throw new Error('total');"

echo "--- e2e: $pass passed, $fail failed ---"
exit $((fail>0))
