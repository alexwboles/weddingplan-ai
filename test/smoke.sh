#!/usr/bin/env bash
# WeddingPlan AI smoke tests — 12 checks. Exit non-zero on first failure.
set -u
cd "$(dirname "$0")/.."
pass=0; fail=0
check() { # $1 = description, rest = command
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "PASS: $desc"; pass=$((pass+1));
  else echo "FAIL: $desc"; fail=$((fail+1)); fi
}

check "index.html exists" test -f index.html
check "css/style.css exists" test -f css/style.css
check "js/wedbank.js exists" test -f js/wedbank.js
check "js/logic.js exists" test -f js/logic.js
check "js/app.js exists" test -f js/app.js
check "wedbank.js syntax valid" node --check js/wedbank.js
check "logic.js syntax valid" node --check js/logic.js
check "app.js syntax valid" node --check js/app.js
check "26 tasks in bank" node -e "const b=require('./js/wedbank.js'); if(b.WED_TASKS.length!==26) throw new Error('got '+b.WED_TASKS.length)"
check "every task has title/days/category/tip" node -e "
  const b=require('./js/wedbank.js');
  for (const t of b.WED_TASKS) { if(!t.t||t.d==null||!t.c||!t.tip) throw new Error('bad task: '+t.t); }"
check "budget weights sum to 100" node -e "
  const b=require('./js/wedbank.js');
  const s=b.BUDGET_CATEGORIES.reduce((x,c)=>x+c.weight,0);
  if(s!==100) throw new Error('sum='+s);"
check "timeline: wedding 2027-09-28 from 2026-09-28 has 26 tasks" node -e "
  const L=require('./js/logic.js'); const B=require('./js/wedbank.js');
  const tl=L.buildTimeline('2027-09-28',[],'2026-09-28',B);
  if(tl.length!==26) throw new Error('got '+tl.length);"

echo "--- smoke: $pass passed, $fail failed ---"
exit $((fail>0))
