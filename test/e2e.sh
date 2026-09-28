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

echo "--- e2e: $pass passed, $fail failed ---"
exit $((fail>0))
