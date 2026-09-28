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
    box.innerHTML = "<p class='muted'>" + open + " of " + tl.length + " tasks remaining</p>" +
      tl.map(t => {
        const checked = t.status === "done" ? "checked" : "";
        return "<label class='task " + t.status + "'>" +
          "<input type='checkbox' data-i='" + t.index + "' " + checked + ">" +
          "<span class='tt'>" + esc(t.title) + "</span>" +
          "<span class='meta'>" + esc(t.due) + " · " + esc(t.category) + " · " + t.status.replace("-", " ") + "</span>" +
          "<span class='tip'>" + esc(t.tip) + "</span></label>";
      }).join("");
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

  function renderBudget() {
    const box = $("budget-body");
    if (!state.budget.length) {
      box.innerHTML = "<p class='muted'>No budget yet — enter a total below and auto-split it, or add categories one by one.</p>" +
        "<div class='row'><input id='btotal' type='number' min='0' placeholder='Total budget, e.g. 25000'>" +
        "<button id='bsplit'>Auto-split budget</button></div>";
      $("bsplit").addEventListener("click", () => {
        const total = Number($("btotal").value) || 0;
        if (total <= 0) return;
        state.budget = suggestedBudget(total, BUDGET_CATEGORIES);
        save(state); render();
      });
      return;
    }
    const bt = budgetTotals(state.budget);
    box.innerHTML =
      "<div class='bignum'>" + money(bt.spent) + " <span class='muted'>of " + money(bt.planned) + " planned (" + bt.pct + "%)</span></div>" +
      "<div class='bar'><div class='fill' style='width:" + Math.min(100, bt.pct) + "%'></div></div>" +
      state.budget.map((l, i) =>
        "<div class='bline'><span>" + esc(l.label) + "</span>" +
        "<input type='number' min='0' data-k='planned' data-i='" + i + "' value='" + l.planned + "' aria-label='planned'>" +
        "<input type='number' min='0' data-k='spent' data-i='" + i + "' value='" + l.spent + "' aria-label='spent'></div>"
      ).join("") +
      "<p class='muted small'>Left column: planned. Right column: spent so far.</p>";
    box.querySelectorAll("input[data-k]").forEach(inp => {
      inp.addEventListener("change", () => {
        state.budget[Number(inp.dataset.i)][inp.dataset.k] = Number(inp.value) || 0;
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
      "<button id='gadd'>Add guest</button></div>" +
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
        "</select><button data-i='" + i + "' class='vdel'>✕</button></div>"
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

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".tabbtn").forEach(b =>
      b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));
    $("weddate").addEventListener("change", e => {
      state.weddingDate = e.target.value; save(state); render();
    });
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
