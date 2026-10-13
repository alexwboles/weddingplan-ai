/* WeddingPlan AI — UI glue. State in localStorage under `weddingplan.v1`. */
"use strict";
(function () {
  const KEY = "weddingplan.v1";
  const $ = id => document.getElementById(id);
  const BANK = { WED_TASKS, BUDGET_CATEGORIES, VENDOR_STAGES, VENDOR_TYPES, MEAL_CHOICES };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || blank(); }
    catch (e) { return blank(); }
  }
  function blank() {
    return { weddingDate: "", done: [], budget: [], guests: [], vendors: [], tables: [], schedule: [], settings: {} };
  }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

  let state = load();
  if (!Array.isArray(state.schedule)) state.schedule = []; // pre-schedule saves
  let tab = "timeline";
  let tlQuery = "", tlCat = "";

  function money(n) {
    return "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function daysLeft() {
    if (!state.weddingDate) return null;
    return daysUntil(state.weddingDate);
  }

  /* ---------- render ---------- */
  function render() {
    renderHeader();
    document.querySelectorAll(".tabbtn").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    ["timeline", "budget", "guests", "vendors", "seating", "dayof"].forEach(t => {
      $("tab-" + t).style.display = t === tab ? "" : "none";
    });
    if (tab === "timeline") renderTimeline();
    if (tab === "budget") renderBudget();
    if (tab === "guests") renderGuests();
    if (tab === "vendors") renderVendors();
    if (tab === "seating") renderSeating();
    if (tab === "dayof") renderSchedule();
  }

  function renderHeader() {
    const dl = daysLeft();
    $("weddate").value = state.weddingDate || "";
    if (dl == null) {
      $("countdown").textContent = "Set your wedding date to start the countdown.";
      $("nudge").textContent = "";
    } else {
      $("countdown").textContent = dl < 0
        ? "Married! Congratulations!"
        : dl === 0 ? "Today is the wedding day!" : dl + " days to go";
      const n = weddingNudge(dl);
      $("nudge").textContent = n || "";
    }
  }

  function renderTimeline() {
    const box = $("timeline-list");
    if (!state.weddingDate) {
      box.innerHTML = '<p class="muted">Enter your wedding date above and your 12-month plan appears here.</p>';
      return;
    }
    const tl = buildTimeline(state.weddingDate, state.done, undefined, BANK);
    const open = tl.filter(t => t.status !== "done").length;
    const cats = timelineCategories(BANK);
    const shown = filterTimeline(tl, tlQuery, tlCat);
    box.innerHTML =
      "<div class='ttools'><input id='tlSearch' type='search' placeholder='Search tasks…' value='" + esc(tlQuery) + "' aria-label='Search tasks'>" +
      "<select id='tlCat' aria-label='Filter by category'><option value=''>All categories</option>" +
      cats.map(c => "<option value='" + c + "'" + (tlCat === c ? " selected" : "") + ">" + esc(c) + "</option>").join("") +
      "</select></div>" +
      "<p class='muted'>" + open + " of " + tl.length + " tasks remaining" +
      ((tlQuery || tlCat) ? " · showing " + shown.length + " matching" : "") + "</p>" +
      (shown.length ? "" : "<p class='muted'>No tasks match this filter.</p>") +
      shown.map(t => {
        const checked = t.status === "done" ? "checked" : "";
        return "<label class='task " + t.status + "'>" +
          "<input type='checkbox' data-i='" + t.index + "' " + checked + ">" +
          "<span class='tt'>" + esc(t.title) + "</span>" +
          "<span class='meta'>" + esc(t.due) + " · " + esc(t.category) + " · " + t.status.replace("-", " ") + "</span>" +
          "<span class='tip'>" + esc(t.tip) + "</span></label>";
      }).join("");
    $("tlSearch").addEventListener("input", e => {
      tlQuery = e.target.value;
      const pos = e.target.selectionStart;
      renderTimeline();
      const s = $("tlSearch");
      s.focus();
      try { s.setSelectionRange(pos, pos); } catch (err) { /* noop */ }
    });
    $("tlCat").addEventListener("change", e => { tlCat = e.target.value; renderTimeline(); });
    box.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => {
        const i = Number(cb.dataset.i);
        const at = state.done.indexOf(i);
        if (cb.checked && at < 0) state.done.push(i);
        if (!cb.checked && at >= 0) state.done.splice(at, 1);
        save(state); render();
      });
    });
  }

  /* The Budget tab was wired in the nav but never implemented — clicking it
     threw. It now exists: total-budget auto-split across categories,
     per-category planned/spent editing, roll-up, and over-run alerts. */
  function renderBudget() {
    const box = $("budget-body");
    const bt = budgetTotals(state.budget);
    const alerts = budgetAlerts(state.budget);
    box.innerHTML =
      "<div class='bignum'>" + money(bt.spent) + " <span class='muted'>spent of " + money(bt.planned) + " planned (" + bt.pct + "%)</span></div>" +
      (alerts.length ? "<div class='budgetalerts'>" + alerts.map(a =>
        "<p class='error small'>⚠ " + esc(a.category) + " is over plan by " + money(a.over) +
        " (" + money(a.spent) + " spent / " + money(a.planned) + " planned)</p>").join("") + "</div>" : "") +
      "<div class='row'><input id='btotal' type='number' min='0' placeholder='Total budget — e.g. 30000'>" +
      "<button id='bsplit'>Auto-split by category</button></div>" +
      "<div id='blines'>" + state.budget.map((l, i) => {
        const pct = l.planned > 0 ? Math.min(100, Math.round((l.spent / l.planned) * 100)) : 0;
        const over = (l.spent || 0) > (l.planned || 0);
        return "<div class='bline" + (over ? " over" : "") + "'>" +
          "<span class='bcat'>" + esc(l.label || l.category) + "</span>" +
          "<label class='small'>Planned <input type='number' min='0' data-i='" + i + "' data-f='planned' value='" + (l.planned || 0) + "'></label>" +
          "<label class='small'>Spent <input type='number' min='0' data-i='" + i + "' data-f='spent' value='" + (l.spent || 0) + "'></label>" +
          "<span class='bar'><span class='fill' style='width:" + pct + "%" + (over ? ";background:#b91c1c" : "") + "'></span></span></div>";
      }).join("") + "</div>" +
      (state.budget.length ? "" : "<p class='muted'>No budget yet — enter a total above and auto-split it, or add the timeline's first task: “Set your total budget”.</p>");
    $("bsplit").addEventListener("click", () => {
      const total = Number($("btotal").value);
      if (!(total > 0)) { alert("Enter a total budget first."); return; }
      state.budget = suggestedBudget(total, BANK.BUDGET_CATEGORIES);
      save(state); render();
    });
    box.querySelectorAll("#blines input").forEach(inp => {
      inp.addEventListener("change", () => {
        const line = state.budget[Number(inp.dataset.i)];
        if (!line) return;
        line[inp.dataset.f] = Math.max(0, Number(inp.value) || 0);
        save(state); render();
      });
    });
  }

  /* Day-of schedule: timed run-of-events with overlap detection. */
  function renderSchedule() {
    const box = $("tab-dayof");
    const sorted = sortSchedule(state.schedule);
    const conflicts = scheduleConflicts(state.schedule);
    const total = scheduleTotal(state.schedule);
    const flagged = new Set();
    conflicts.forEach(c => { flagged.add(c.a.id); flagged.add(c.b.id); });
    const hrs = Math.floor(total / 60), mins = total % 60;
    const span = scheduleSpan(sorted);
    const dayMin = span ? (span.endMin - span.startMin) : 0;
    const fmtT = (m) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    box.innerHTML =
      "<p class='muted'>The wedding-day run of events, in order. Overlaps are flagged so the day flows.</p>" +
      (conflicts.length ? "<p class='error small'>⚠ " + conflicts.length + " overlap" + (conflicts.length === 1 ? "" : "s") + ": " +
        conflicts.slice(0, 3).map(c => esc(c.a.title) + " × " + esc(c.b.title)).join("; ") + "</p>" : "") +
      (sorted.length ? "<p class='muted'>" + sorted.length + " event" + (sorted.length === 1 ? "" : "s") + " · " + hrs + "h " + mins + "m scheduled" +
        (span ? " · day runs <strong>" + span.label + "</strong>" : "") + "</p>" : "") +
      "<div class='row'><input id='stime' type='time' value='14:00' aria-label='Start time'>" +
      "<input id='stitle' placeholder='Event — e.g. Ceremony' maxlength='80'>" +
      "<input id='smin' type='number' min='5' max='720' value='30' style='width:90px' aria-label='Duration in minutes'>" +
      "<button id='sadd'>Add event</button></div>" +
      "<div id='slist' class='dline'>" + (sorted.length ? sorted.map(e => {
        const end = eventEndMin(e);
        const w = dayMin > 0 ? Math.max(4, Math.round(e.minutes / dayMin * 100)) : 4;
        return "<div class='sline drow" + (flagged.has(e.id) ? " conflict" : "") + "'>" +
          "<span class='stime'>" + esc(e.time) + "</span>" +
          "<div class='sbody'><div class='stitle'>" + esc(e.title) +
          "<button data-id='" + esc(e.id) + "' class='sdel' title='Remove event'>✕</button></div>" +
          "<div class='sbar'><i style='width:" + w + "%'></i></div>" +
          "<span class='muted small'>" + e.minutes + " min · ends " + fmtT(end) + "</span></div></div>";
      }).join("") : "<p class='muted'>No events yet — add the ceremony, photos, reception, and everything between.</p>") + "</div>";
    $("sadd").addEventListener("click", () => {
      try {
        const ev = makeScheduleEvent({ time: $("stime").value, title: $("stitle").value, minutes: $("smin").value });
        ev.id = "s" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        state.schedule.push(ev);
        save(state); render();
      } catch (err) { alert("⚠ " + err.message); }
    });
    box.querySelectorAll(".sdel").forEach(btn => {
      btn.addEventListener("click", () => {
        state.schedule = state.schedule.filter(e => e.id !== btn.dataset.id);
        save(state); render();
      });
    });
  }

  function renderGuests() {
    const box = $("guests-body");
    const st = rsvpStats(state.guests);
    const meals = mealStats(state.guests);
    const diets = dietaryStats(state.guests);
    const mealOpts = MEAL_CHOICES.map(m => "<option>" + m + "</option>").join("");
    const rn = rsvpNudges(state.guests, state.weddingDate);
    const rsvpBanner = rn
      ? "<div class='rsvpbanner" + (rn.pending.length && rn.daysLeft <= 14 ? " hot" : "") + "'>" +
        "RSVP deadline: <strong>" + esc(rn.deadline) + "</strong> (" +
        (rn.daysLeft < 0 ? Math.abs(rn.daysLeft) + " days ago" : rn.daysLeft + " days left") + ") — " +
        (rn.pending.length
          ? "<strong>" + rn.pending.length + "</strong> still owe an answer: " + esc(rn.pending.slice(0, 8).join(", ")) +
            (rn.pending.length > 8 ? " …+" + (rn.pending.length - 8) + " more" : "") +
            " <button id='copyNudge' class='ghostbtn small'>Copy nudge list</button>"
          : "everyone has answered ✓") +
        "</div>"
      : "";
    box.innerHTML =
      "<div class='bignum'>" + st.expected + " <span class='muted'>expected (" + st.yes + " yes / " + st.total + " invited)</span></div>" +
      rsvpBanner +
      (Object.keys(meals).length ? "<p class='muted'>Meal choices: " +
        Object.entries(meals).map(([m, c]) => esc(m) + " × " + c).join(" · ") + "</p>" : "") +
      (Object.keys(diets).length ? "<p class='muted'>Dietary needs (confirmed guests): " +
        Object.entries(diets).map(([d, c]) => esc(d) + " × " + c).join(" · ") + "</p>" : "") +
      "<div class='row'><input id='gname' placeholder='Guest name'>" +
      "<select id='grsvp'><option value='invited'>invited</option><option value='yes'>yes</option>" +
      "<option value='maybe'>maybe</option><option value='no'>no</option></select>" +
      "<select id='gmeal'>" + mealOpts + "</select>" +
      "<input id='gdiet' placeholder='Dietary needs (optional)' maxlength='60'>" +
      "<label class='inline'><input id='gplus' type='checkbox'> +1</label>" +
      "<button id='gadd'>Add guest</button>" +
      "<button id='gexport' class='ghostbtn'>Export CSV</button></div>" +
      "<details class='csvimport'><summary>Import guests from CSV</summary>" +
      "<p class='muted small'>Paste rows as <code>name,rsvp,meal,plus_one,diet</code> — e.g. <code>Jane Doe,yes,Chicken,yes,Gluten-free</code>. Header row optional; diet may be left blank.</p>" +
      "<textarea id='gcsv' rows='4' placeholder='name,rsvp,meal,plus_one'></textarea>" +
      "<div class='row'><button id='gimport'>Import</button></div>" +
      "<div id='gimportMsg'></div></details>" +
      "<div id='glist'>" + state.guests.map((g, i) =>
        "<div class='gline'><span>" + esc(g.name) + "</span>" +
        "<select data-i='" + i + "' class='gr'>" +
        ["invited", "yes", "maybe", "no"].map(r =>
          "<option value='" + r + "'" + (g.rsvp === r ? " selected" : "") + ">" + r + "</option>").join("") +
        "</select><span class='muted small'>" + esc(g.meal || "") + (g.plusOne ? " · +1" : "") + (g.diet ? " · " + esc(g.diet) : "") + "</span>" +
        "<button data-i='" + i + "' class='gdel'>✕</button></div>"
      ).join("") + "</div>";
    $("gadd").addEventListener("click", () => {
      const name = $("gname").value.trim();
      if (!name) return;
      state.guests.push({
        name, rsvp: $("grsvp").value, meal: $("gmeal").value, plusOne: $("gplus").checked,
        diet: $("gdiet").value.trim()
      });
      save(state); render();
    });
    const cp = $("copyNudge");
    if (cp) cp.addEventListener("click", () => {
      const n = rsvpNudges(state.guests, state.weddingDate);
      const text = "RSVP reminders (deadline " + n.deadline + "):\n" +
        n.pending.map(x => "- " + x).join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      cp.textContent = "Copied";
      setTimeout(() => { cp.textContent = "Copy nudge list"; }, 1500);
    });
    $("gexport").addEventListener("click", () => {
      const blob = new Blob([guestsToCSV(state.guests)], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "wedding-guests.csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
    $("gimport").addEventListener("click", () => {
      const res = parseGuestCSV($("gcsv").value, MEAL_CHOICES);
      const msg = $("gimportMsg");
      if (res.guests.length) {
        state.guests = state.guests.concat(res.guests);
        save(state); render();
      } else {
        msg.innerHTML = res.errors.map(e => "<p class='error small'>" + esc(e) + "</p>").join("");
      }
      if (res.errors.length && res.guests.length) {
        alert(res.guests.length + " imported with " + res.errors.length + " warning(s):\n" + res.errors.slice(0, 5).join("\n"));
      }
    });
    box.querySelectorAll(".gr").forEach(sel => {
      sel.addEventListener("change", () => {
        state.guests[Number(sel.dataset.i)].rsvp = sel.value;
        save(state); render();
      });
    });
    box.querySelectorAll(".gdel").forEach(btn => {
      btn.addEventListener("click", () => {
        state.guests.splice(Number(btn.dataset.i), 1);
        save(state); render();
      });
    });
  }

  function renderVendors() {
    const box = $("vendors-body");
    const st = vendorStats(state.vendors);
    const pay = vendorPayments(state.vendors);
    const typeOpts = VENDOR_TYPES.map(t => "<option>" + t + "</option>").join("");
    const payLine = "<div class='payline'>" +
      "Deposits paid <strong>" + money(pay.depositsPaid) + "</strong> · " +
      "balance still owed <strong>" + money(pay.balance) + "</strong>" +
      (pay.overdue.length
        ? " · <span class='overdue'>" + pay.overdue.length + " payment" +
          (pay.overdue.length === 1 ? "" : "s") + " overdue: " +
          esc(pay.overdue.map(v => v.name).slice(0, 4).join(", ")) +
          (pay.overdue.length > 4 ? " …" : "") + "</span>"
        : "") +
      "</div>";
    box.innerHTML =
      "<div class='bignum'>" + st.booked + " <span class='muted'>booked / paid · " + money(st.cost) + " committed</span></div>" +
      payLine +
      "<div class='row'><input id='vname' placeholder='Vendor name'>" +
      "<select id='vtype'>" + typeOpts + "</select>" +
      "<input id='vcost' type='number' min='0' placeholder='Cost'>" +
      "<button id='vadd'>Add vendor</button></div>" +
      "<div id='vlist'>" + state.vendors.map((v, i) =>
        "<div class='vline'><span><strong>" + esc(v.name) + "</strong> <span class='muted small'>" + esc(v.type) + " · " + money(v.cost) + "</span></span>" +
        "<select data-i='" + i + "' class='vs'>" +
        VENDOR_STAGES.map(s =>
          "<option value='" + s + "'" + (v.status === s ? " selected" : "") + ">" + s + "</option>").join("") +
        "</select><button data-i='" + i + "' class='vdel'>✕</button>" +
        "<input data-i='" + i + "' class='vnote' placeholder='Notes — contact name, phone, contract #' value='" + esc(v.notes || "") + "' aria-label='Vendor notes'>" +
        "<div class='vpay'><label>Deposit paid $<input data-i='" + i + "' class='vdep' type='number' min='0' value='" + esc(v.deposit || "") + "' aria-label='Deposit paid'></label>" +
        "<label>Deposit due <input data-i='" + i + "' class='vdepdue' type='date' value='" + esc(v.depositDue || "") + "' aria-label='Deposit due date'></label>" +
        "<label>Balance due <input data-i='" + i + "' class='vbal' type='date' value='" + esc(v.balanceDue || "") + "' aria-label='Balance due date'></label></div></div>"
      ).join("") + "</div>";
    $("vadd").addEventListener("click", () => {
      const name = $("vname").value.trim();
      if (!name) return;
      state.vendors.push({ name, type: $("vtype").value, cost: Number($("vcost").value) || 0, status: "researching" });
      save(state); render();
    });
    box.querySelectorAll(".vs").forEach(sel => {
      sel.addEventListener("change", () => {
        state.vendors[Number(sel.dataset.i)].status = sel.value;
        save(state); render();
      });
    });
    box.querySelectorAll(".vnote").forEach(inp => {
      inp.addEventListener("change", () => {
        state.vendors[Number(inp.dataset.i)].notes = inp.value.trim();
        save(state); render();
      });
    });
    box.querySelectorAll(".vdep").forEach(inp => {
      inp.addEventListener("change", () => {
        state.vendors[Number(inp.dataset.i)].deposit = Math.max(0, Number(inp.value) || 0);
        save(state); render();
      });
    });
    box.querySelectorAll(".vdepdue").forEach(inp => {
      inp.addEventListener("change", () => {
        state.vendors[Number(inp.dataset.i)].depositDue = inp.value;
        save(state); render();
      });
    });
    box.querySelectorAll(".vbal").forEach(inp => {
      inp.addEventListener("change", () => {
        state.vendors[Number(inp.dataset.i)].balanceDue = inp.value;
        save(state); render();
      });
    });
    box.querySelectorAll(".vdel").forEach(btn => {
      btn.addEventListener("click", () => {
        state.vendors.splice(Number(btn.dataset.i), 1);
        save(state); render();
      });
    });
  }

  /* ---------- seating planner ---------- */
  function renderSeating() {
    const box = $("seating-body");
    const plan = seatingPlan(state.guests, state.tables);
    const confirmed = state.guests.filter(g => g.rsvp === "yes");
    const tableOpts = sel => state.tables.map(t =>
      "<option value='" + esc(t.name) + "'" + (sel === t.name ? " selected" : "") + ">" +
      esc(t.name) + "</option>").join("");
    box.innerHTML =
      "<div class='row'><input id='tname' placeholder='Table name — e.g. Table 1'>" +
      "<input id='tseats' type='number' min='1' max='50' placeholder='Seats'>" +
      "<button id='tadd'>Add table</button>" +
      (confirmed.length && state.tables.length ? "<button id='autoseat' class='ghostbtn'>Auto-seat confirmed guests</button>" : "") + "</div>" +
      "<div id='tlist'>" + state.tables.map((t, i) => {
        const tp = plan.tables[i];
        const used = tp.guests.reduce((s, x) => s + x.seats, 0);
        const pct = tp.seats ? Math.round(used / tp.seats * 100) : 0;
        return "<div class='tcard'><div class='thead'><strong>" + esc(t.name) + "</strong> " +
          "<span class='muted small'>" + used + "/" + tp.seats + " seats" +
          (used > tp.seats ? " — OVERFULL" : "") + "</span>" +
          "<button data-i='" + i + "' class='tdel' title='Remove table'>✕</button></div>" +
          "<div class='tbar'><i style='width:" + Math.min(100, pct) + "%'></i></div>" +
          "<div class='tguests'>" + (tp.guests.length
            ? tp.guests.map(x => "<span class='tguest'>" + esc(x.name) + (x.seats > 1 ? " +1" : "") +
              " <button data-gi='" + x.gi + "' class='gunseat' title='Unseat'>✕</button></span>").join("")
            : "<span class='muted small'>empty</span>") + "</div></div>";
      }).join("") + "</div>" +
      (plan.unassigned.length
        ? "<h3>Unassigned (" + plan.unassigned.length + ")</h3><div id='unlist'>" +
          plan.unassigned.map(u =>
            "<div class='gline'><span>" + esc(u.name) + (u.seats > 1 ? " <span class='muted small'>+1</span>" : "") + "</span>" +
            "<select data-gi='" + u.gi + "' class='gtable'><option value=''>— pick a table —</option>" +
            tableOpts("") + "</select></div>").join("") + "</div>"
        : (confirmed.length
          ? "<p class='muted'>Everyone confirmed has a seat ✓</p>"
          : "<p class='muted'>No confirmed guests yet — mark RSVPs 'yes' in the Guests tab, then seat them here.</p>"));
    $("tadd").addEventListener("click", () => {
      const name = $("tname").value.trim();
      const seats = Math.max(1, Math.min(50, Number($("tseats").value) || 0));
      if (!name || !seats) { alert("Give the table a name and a seat count."); return; }
      if (state.tables.some(t => t.name === name)) { alert("A table with that name already exists."); return; }
      state.tables.push({ name, seats });
      save(state); render();
    });
    const as = $("autoseat");
    if (as) as.addEventListener("click", () => {
      state.guests = autoSeat(state.guests, state.tables);
      save(state); render();
    });
    box.querySelectorAll(".tdel").forEach(btn => {
      btn.addEventListener("click", () => {
        const gone = state.tables[Number(btn.dataset.i)].name;
        state.tables.splice(Number(btn.dataset.i), 1);
        state.guests.forEach(g => { if (g.table === gone) delete g.table; });
        save(state); render();
      });
    });
    box.querySelectorAll(".gtable").forEach(sel => {
      sel.addEventListener("change", () => {
        const g = state.guests[Number(sel.dataset.gi)];
        if (sel.value) g.table = sel.value; else delete g.table;
        save(state); render();
      });
    });
    box.querySelectorAll(".gunseat").forEach(btn => {
      btn.addEventListener("click", () => {
        delete state.guests[Number(btn.dataset.gi)].table;
        save(state); render();
      });
    });
  }

  /* ---------- settings: optional OpenAI key (never required) ---------- */
  function renderSettings() {
    $("apikey").value = (state.settings && state.settings.key) || "";
  }

  function printPlan() {
    if (!state.weddingDate) { alert("Set your wedding date first."); return; }
    const w = window.open("", "_blank");
    if (!w) return;
    const txt = planSummaryText(state.weddingDate, state.budget, state.guests, state.vendors, BANK);
    w.document.write("<html><head><title>WeddingPlan summary</title></head><body>" +
      "<pre style='font-family:monospace;white-space:pre-wrap'>" + esc(txt) + "</pre></body></html>");
    w.document.close();
    w.focus();
    w.print();
  }

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".tabbtn").forEach(b =>
      b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));
    $("weddate").addEventListener("change", e => {
      state.weddingDate = e.target.value; save(state); render();
    });
    $("printPlan").addEventListener("click", printPlan);
    $("apikey").addEventListener("change", e => {
      state.settings = state.settings || {};
      state.settings.key = e.target.value.trim(); save(state);
    });
    $("reset").addEventListener("click", () => {
      if (confirm("Start over? This clears your wedding plan on this device.")) {
        state = blank(); save(state); renderSettings(); render();
      }
    });
    renderSettings();
    render();
  });
})();
