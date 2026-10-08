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
    return { weddingDate: "", done: [], budget: [], guests: [], vendors: [], settings: {} };
  }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

  let state = load();
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
    ["timeline", "budget", "guests", "vendors"].forEach(t => {
      $("tab-" + t).style.display = t === tab ? "" : "none";
    });
    if (tab === "timeline") renderTimeline();
    if (tab === "budget") renderBudget();
    if (tab === "guests") renderGuests();
    if (tab === "vendors") renderVendors();
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

  function renderGuests() {
    const box = $("guests-body");
    const st = rsvpStats(state.guests);
    const meals = mealStats(state.guests);
    const mealOpts = MEAL_CHOICES.map(m => "<option>" + m + "</option>").join("");
    box.innerHTML =
      "<div class='bignum'>" + st.expected + " <span class='muted'>expected (" + st.yes + " yes / " + st.total + " invited)</span></div>" +
      (Object.keys(meals).length ? "<p class='muted'>Meal choices: " +
        Object.entries(meals).map(([m, c]) => esc(m) + " × " + c).join(" · ") + "</p>" : "") +
      "<div class='row'><input id='gname' placeholder='Guest name'>" +
      "<select id='grsvp'><option value='invited'>invited</option><option value='yes'>yes</option>" +
      "<option value='maybe'>maybe</option><option value='no'>no</option></select>" +
      "<select id='gmeal'>" + mealOpts + "</select>" +
      "<label class='inline'><input id='gplus' type='checkbox'> +1</label>" +
      "<button id='gadd'>Add guest</button>" +
      "<button id='gexport' class='ghostbtn'>Export CSV</button></div>" +
      "<details class='csvimport'><summary>Import guests from CSV</summary>" +
      "<p class='muted small'>Paste rows as <code>name,rsvp,meal,plus_one</code> — e.g. <code>Jane Doe,yes,Chicken,yes</code>. Header row optional.</p>" +
      "<textarea id='gcsv' rows='4' placeholder='name,rsvp,meal,plus_one'></textarea>" +
      "<div class='row'><button id='gimport'>Import</button></div>" +
      "<div id='gimportMsg'></div></details>" +
      "<div id='glist'>" + state.guests.map((g, i) =>
        "<div class='gline'><span>" + esc(g.name) + "</span>" +
        "<select data-i='" + i + "' class='gr'>" +
        ["invited", "yes", "maybe", "no"].map(r =>
          "<option value='" + r + "'" + (g.rsvp === r ? " selected" : "") + ">" + r + "</option>").join("") +
        "</select><span class='muted small'>" + esc(g.meal || "") + (g.plusOne ? " · +1" : "") + "</span>" +
        "<button data-i='" + i + "' class='gdel'>✕</button></div>"
      ).join("") + "</div>";
    $("gadd").addEventListener("click", () => {
      const name = $("gname").value.trim();
      if (!name) return;
      state.guests.push({
        name, rsvp: $("grsvp").value, meal: $("gmeal").value, plusOne: $("gplus").checked
      });
      save(state); render();
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
    const typeOpts = VENDOR_TYPES.map(t => "<option>" + t + "</option>").join("");
    box.innerHTML =
      "<div class='bignum'>" + st.booked + " <span class='muted'>booked / paid · " + money(st.cost) + " committed</span></div>" +
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
        "<input data-i='" + i + "' class='vnote' placeholder='Notes — contact name, phone, contract #' value='" + esc(v.notes || "") + "' aria-label='Vendor notes'></div>"
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
    box.querySelectorAll(".vdel").forEach(btn => {
      btn.addEventListener("click", () => {
        state.vendors.splice(Number(btn.dataset.i), 1);
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
