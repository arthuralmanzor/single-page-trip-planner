import { readPlan, dayTabs } from "./plan.js";
import { readChecklists, readPharmacy, readInfo } from "./reference.js";
import { sheetId, fetchTabs } from "./sheets.js";

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  drop(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }
const smooth = () => matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth";

/* ---------- The loaded trip ---------- */
let TZ = "UTC", TRIP = null, DAYS = [], BOOKINGS = [], PROBLEMS = [];
let CHECKS = [], PHARM = null, INFO = [];
let FLAT = [], FIDX = {}, TRIP_END = 0;

const fmtClock = ms => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(/\s/g, "").toLowerCase();
const fmtDow = ms => new Date(ms).toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
const fmtDate = ms => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
const fmtMonthDay = ms => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
const localDate = ms => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const noon = date => Date.parse(date + "T04:00:00Z"); // midday in most of Asia, and the right date everywhere
function until(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return `in ${h} h${r ? ` ${r} min` : ""}`;
  const d = Math.round(m / 1440); return `in ${d} day${d === 1 ? "" : "s"}`;
}

function useTrip(raw) {
  const plan = readPlan(raw.plan);
  TRIP = plan.trip; TZ = TRIP.timeZone; DAYS = plan.days; BOOKINGS = plan.bookings; PROBLEMS = plan.problems;
  try { fmtClock(0); } catch (e) { PROBLEMS.push({ where: "Trip", text: `The time zone "${TZ}" isn't one this phone knows.` }); TZ = "UTC"; }
  CHECKS = readChecklists(raw.checklists && raw.checklists.Checklists);
  const ref = raw.reference || {};
  PHARM = readPharmacy(ref.Pharmacy, ref["Pharmacy notes"]);
  INFO = readInfo(ref.Info, ref.Tables);
  FLAT = [];
  DAYS.forEach(d => d.stops.forEach(s => { if (s.at != null) FLAT.push({ d, s, t: s.at }); }));
  FLAT.sort((a, b) => a.t - b.t);
  FIDX = {}; FLAT.forEach((f, i) => { FIDX[f.d.id + "/" + f.s.code] = i; });
  TRIP_END = FLAT.length ? FLAT[FLAT.length - 1].t + 2 * 3600e3 : 0;
}

/* ---------- Trip clock: where you should be ---------- */
let sim = null, autoDay = true;
const nowMs = () => sim ?? Date.now();
function tripState(ms = nowMs()) {
  if (!FLAT.length) return { phase: "empty", ms };
  if (ms < FLAT[0].t) return { phase: "before", next: FLAT[0], ms };
  if (ms >= TRIP_END) return { phase: "after", ms };
  let i = 0; for (let k = 0; k < FLAT.length; k++) { if (FLAT[k].t <= ms) i = k; else break; }
  const cur = FLAT[i], next = FLAT[i + 1] || null;
  const p = next ? Math.min(1, Math.max(0, (ms - cur.t) / (next.t - cur.t))) : 1;
  return { phase: "during", cur, next, idx: i, p, ms };
}
/* Overnight, the last stop is from yesterday: focus on the day ahead. */
function fresh(st) { return localDate(st.cur.t) === localDate(st.ms); }
function focusDay(st) { return (!fresh(st) && st.next) ? st.next.d : st.cur.d; }

/* ---------- Directions ---------- */
function chipHTML(p) {
  if (/^Platform\b/i.test(p)) return `<span class="chip plat">${esc(p)}</span>`;
  if (/^towards\b/i.test(p)) return `<span class="chip dirn"><span class="sr">Direction: </span>${esc(p)}</span>`;
  if (/^Exit\b/i.test(p)) return `<span class="chip exit">${esc(p)}</span>`;
  if (/\b\d+\s*min\b/.test(p)) return `<span class="chip dur">${esc(p)}</span>`;
  return `<span class="chip">${esc(p)}</span>`;
}
function legHTML(l) {
  const route = l.from ? `<span class="from">${esc(l.from)}</span><span class="to" aria-label="to">→</span><span class="dest">${esc(l.to)}</span>` : `<span class="dest">${esc(l.to)}</span>`;
  return `<div class="leg" style="--c:var(--${l.line || "muted"})"><div class="leg-top"><span class="line">${esc(l.name)}</span><span class="stops">${route}</span></div>${l.notes.length ? `<div class="chips">${l.notes.map(chipHTML).join("")}</div>` : ""}</div>`;
}
const legsHTML = s => s.legs.length ? `<div class="legs">${s.legs.map(legHTML).join("")}</div>` : "";
const etaHTML = s => s.arrives ? `<div class="eta"><span class="lbl">Leave</span><b>${esc(s.leaves || s.time)}</b><span class="ar" aria-hidden="true">→</span><span class="lbl">Arrive</span><b>${esc(s.arrives)}</b></div>` : "";
function bannerHTML(b) { return b ? `<div class="callout ${b.type === "warn" ? "warn" : "tip"}">${b.label ? `<span class="ic">${esc(b.label)}</span>` : ""}<span>${esc(b.text)}</span></div>` : ""; }
function mapHTML(places) {
  if (!places.length) return "";
  return `<div class="maps">${places.map(p => `<a class="maplink" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(p.search)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.750 7-13a7 7 0 0 0-7-7zm0 9.500a2.500 2.500 0 1 1 0-5 2.500 2.500 0 0 1 0 5z"/></svg><span>${esc(p.label)}</span></a>`).join("")}</div>`;
}
function ticketsFor(codes) {
  const seen = new Set(), out = [];
  for (const b of BOOKINGS) if (codes.includes(b.code)) for (const t of b.tickets) if (!seen.has(t.url)) { seen.add(t.url); out.push(t); }
  return out;
}
function tixHTML(codes) {
  const list = ticketsFor(codes);
  return list.length ? `<div class="tixlinks">${list.map(t => `<a class="btn" href="${esc(t.url)}" target="_blank" rel="noopener">Open ticket · ${esc(t.label)}</a>`).join("")}</div>` : "";
}

/* ---------- Itinerary ---------- */
let selDay = store.get("trip-day");
const dayById = id => DAYS.find(d => d.id === id) || DAYS[0];
function renderStrip(st = tripState()) {
  const today = st.phase === "during" ? focusDay(st).id : null;
  const curIdx = today ? DAYS.findIndex(d => d.id === today) : (st.phase === "after" ? DAYS.length : -1);
  $("#dayStrip").innerHTML = DAYS.map((d, i) => `<button class="day-btn${i < curIdx ? " past" : ""}" type="button" data-day="${esc(d.id)}" aria-pressed="${d.id === selDay}">
    <span class="dow">${esc(d.dow)}</span><span class="dn">${esc(d.dn)}</span><span class="tag">${esc(d.tag)}</span>${d.id === today ? '<span class="today">NOW</span>' : ""}</button>`).join("");
}
function timelineHTML(d) {
  return `<ol class="tl">${d.stops.map(s => `<li class="k-${esc(s.kind)}${s.problems.length ? " bad" : ""}" data-k="${esc(d.id + "/" + s.code)}">
      <span class="time">${esc(s.time)}<span class="code">${esc(s.code)}</span></span><span class="rail"><span class="node"></span></span>
      <div class="body"><span class="state" aria-live="polite"></span>${s.dayStart ? '<span class="startchip">Start here</span>' : ""}<h3>${esc(s.title || "(no name)")}</h3>
        ${s.problems.map(p => `<div class="badnote">Fix in the Sheet: ${esc(p)}</div>`).join("")}
        ${etaHTML(s)}${legsHTML(s)}
        ${s.details ? `<p>${esc(s.details)}</p>` : ""}
        ${mapHTML(s.places)}
        ${s.wait ? `<div class="wait"><span class="lbl">Expect</span><span>${esc(s.wait)}</span></div>` : ""}
        ${s.tip ? `<div class="tip-inline">${esc(s.tip)}</div>` : ""}
        ${tixHTML(s.bookings)}
      </div></li>`).join("")}</ol>`;
}
let packed = store.get("trip-bring") || {};
function glanceHTML(d) {
  const plan = d.stops.filter(s => s.summary).map(s => `<li><button type="button" class="g-item" data-goto="${esc(d.id + "/" + s.code)}"><span class="mono">${esc(s.time)}</span><span>${esc(s.summary)}</span></button></li>`).join("");
  const bring = d.bring.length ? `<div class="g-col"><h3 class="g-h">Bring today</h3><ul class="g-bring">${d.bring.map((b, i) => { const id = `${d.date}-${i}`; return `<li><label><input type="checkbox" data-bring="${esc(id)}" ${packed[id] ? "checked" : ""}><span>${esc(b)}</span></label></li>`; }).join("")}</ul><p class="g-every">${TRIP.everyDay ? `Every day: ${esc(TRIP.everyDay)}. ` : ""}Ticks stay on this phone.</p></div>` : "";
  if (!plan && !bring) return "";
  return `<section class="glance" aria-label="Day ${d.n} at a glance">${plan ? `<div class="g-col"><h3 class="g-h">Today's plan</h3><ol class="g-list">${plan}</ol></div>` : ""}${bring}</section>`;
}
function dayBookingsHTML(d) {
  const list = BOOKINGS.filter(b => b.date === d.date);
  return list.length ? `<div class="daybk"><span class="lbl">Booked</span>${list.map(b => `<a href="#bookings" class="bkchip"><span class="mono">${esc(b.code)}</span> ${esc(b.title)}${b.time ? ` · ${esc(b.time)}` : ""}</a>`).join("")}</div>` : "";
}
function renderDay() {
  const d = dayById(selDay);
  if (!d) { $("#dayView").innerHTML = `<div class="empty">The Sheet has no days yet.</div>`; return; }
  const notes = store.get("trip-notes") || {};
  $("#dayView").innerHTML = `
   <div class="dayhead"><span class="kicker">${esc(d.name)} · ${esc(d.dow)}, ${esc(fmtMonthDay(noon(d.date)))}</span><h2>${esc(d.title)}</h2></div>
   ${glanceHTML(d)}
   ${bannerHTML(d.banner)}
   ${dayBookingsHTML(d)}
   <p class="codehint">Each stop has a code like <span class="mono">D${d.n}-03</span>. Use it when you ask Gemini for a change.</p>
   ${d.stops.length ? timelineHTML(d) : `<div class="empty">No stops on this day yet.</div>`}
   <div class="card"><h3>My notes for ${esc(d.name)}</h3>
     <label for="dayNote" class="saved" style="min-height:0">Saved on this phone only.</label>
     <textarea id="dayNote" data-note="${esc(d.date)}" placeholder="e.g. Meet at Exit J2">${esc(notes[d.date] || "")}</textarea>
   </div>`;
  applyMarks();
}
function applyMarks(st = tripState()) {
  document.querySelectorAll("#dayView .g-item[data-goto]").forEach(g => {
    const fi = FIDX[g.dataset.goto]; let cls = "";
    if (st.phase === "after") cls = "done";
    else if (st.phase === "during" && fi != null) { if (fi < st.idx) cls = "done"; else if (fi === st.idx && fresh(st)) cls = "now"; }
    g.classList.toggle("done", cls === "done"); g.classList.toggle("now", cls === "now");
  });
  document.querySelectorAll("#dayView li[data-k]").forEach(li => {
    const fi = FIDX[li.dataset.k]; const s = li.querySelector(".state");
    let cls = "";
    if (st.phase === "after") cls = "done";
    else if (st.phase === "during" && fi != null) {
      if (fi < st.idx) cls = "done"; else if (fi === st.idx) cls = "now"; else if (fi === st.idx + 1) cls = "next";
    }
    li.classList.toggle("done", cls === "done"); li.classList.toggle("now", cls === "now"); li.classList.toggle("next", cls === "next");
    if (cls === "now") { li.style.setProperty("--p", st.p.toFixed(3)); s.textContent = sim ? "Now (preview)" : "You are here"; }
    else if (cls === "next") { li.style.removeProperty("--p"); s.textContent = `Next · ${until(st.next.t - st.ms)}`; }
    else { li.style.removeProperty("--p"); s.textContent = ""; }
  });
}
function jumpToNow() {
  const st = tripState(); if (st.phase !== "during") return;
  autoDay = true;
  if (location.hash && location.hash !== "#itinerary") location.hash = "itinerary";
  const fd = focusDay(st).id;
  if (selDay !== fd) { selDay = fd; renderStrip(st); renderDay(); }
  requestAnimationFrame(() => { const li = $("#dayView li.now") || $("#dayView li.next"); if (li) li.scrollIntoView({ behavior: smooth(), block: "center" }); });
}

/* Now card */
function renderNow(st = tripState()) {
  const box = $("#nowBody"), card = $("#nowCard");
  card.dataset.phase = st.phase; card.classList.toggle("is-sim", !!sim);
  const simTag = sim ? '<span class="simtag">Preview</span>' : "";
  if (st.phase === "empty") {
    box.innerHTML = `<div class="now-head"><span class="kicker">Trip mode</span></div><p class="now-sub">Once the Sheet has stops with times, this card shows where you should be.</p>`;
  } else if (st.phase === "before") {
    const f = st.next;
    box.innerHTML = `<div class="now-head"><span class="kicker">Trip mode</span>${simTag}</div>
      <h3 class="now-title">${until(f.t - st.ms).replace(/^in /, "")} to go</h3>
      <p class="now-sub">From ${esc(fmtDate(f.t))}, this card shows where you should be, what's next and how to get there. Open the page on the day and it follows the plan by the clock.</p>
      <div class="now-next"><span class="lbl">First up · ${esc(fmtDate(f.t))}, ${fmtClock(f.t)}</span><h4>${esc(f.s.title)}</h4></div>`;
  } else if (st.phase === "after") {
    box.innerHTML = `<div class="now-head"><span class="kicker">Trip complete</span>${simTag}</div><h3 class="now-title">Welcome home</h3><p class="now-sub">The full plan stays here for the photos and the memories.</p>`;
  } else {
    const { cur, next, p, ms } = st;
    const isFresh = fresh(st), fd = focusDay(st);
    const sameDay = next && localDate(next.t) === localDate(ms);
    const heads = next ? (next.s.tip || next.s.wait || "") : "";
    box.innerHTML = `<div class="now-head"><span class="livedot" aria-hidden="true"></span><span class="kicker">${sim ? "Preview" : "Now"} · ${esc(fmtDow(ms))} ${fmtClock(ms)}</span></div>
      ${isFresh ? `<div class="now-cur"><span class="mono code">${esc(cur.s.code)} · ${esc(cur.s.time)}</span><h3 class="now-title">${esc(cur.s.title)}</h3></div>
      ${etaHTML(cur.s)}${legsHTML(cur.s)}` : `<div class="now-cur"><span class="mono code">${esc(fd.name)} · ${esc(fd.dow)}, ${esc(fmtMonthDay(noon(fd.date)))}</span><h3 class="now-title">${esc(fd.title)}</h3></div>
      ${fd.bring.length ? `<div class="heads"><span class="lbl">Bring today</span><span>${esc(fd.bring.join(" · "))}</span></div>` : ""}`}
      ${next && isFresh ? `<div class="now-bar" role="progressbar" aria-label="Time until the next stop" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="width:${(p * 100).toFixed(1)}%"></i></div>` : ""}
      ${next ? `<div class="now-next">
        <span class="lbl">${next.s.kind === "travel" ? "Leave" : "Next"} ${sameDay ? "" : `${esc(fmtDow(next.t))} `}${fmtClock(next.t)} · ${until(next.t - ms)}</span>
        <h4>${esc(next.s.title)}</h4>
        ${legsHTML(next.s)}
        ${heads ? `<div class="heads"><span class="lbl">Heads-up</span><span>${esc(heads)}</span></div>` : ""}
      </div>` : `<p class="now-sub">That's the last stop of the trip.</p>`}
      <button type="button" class="btn" id="nowJump">Show in the day's plan</button>`;
  }
  renderPill(st);
}
function renderPill(st) {
  const el = $("#countdown");
  el.hidden = st.phase === "empty";
  if (st.phase === "before") { const f = st.next; el.textContent = f.t - st.ms < 864e5 ? `Starts ${fmtClock(f.t)}` : `${until(f.t - st.ms).replace(/^in /, "")} to go`; el.disabled = true; }
  else if (st.phase === "after") { el.textContent = "Trip complete"; el.disabled = true; }
  else if (st.phase === "during") { const label = fresh(st) ? st.cur.s.title : (st.next ? `${st.next.d.name} starts ${fmtClock(st.next.t)}` : st.cur.s.title); el.innerHTML = `<span class="pdot" aria-hidden="true"></span>${fmtClock(st.ms)} · ${esc(label)}`; el.disabled = false; }
}
function tick() {
  if (!TRIP) return;
  const st = tripState();
  if (st.phase === "during" && autoDay && selDay !== focusDay(st).id) { selDay = focusDay(st).id; renderStrip(st); renderDay(); }
  else { renderStrip(st); applyMarks(st); }
  renderNow(st);
}

/* Preview another moment */
function renderSim() {
  const sel = $("#simDay"), keep = sel.value;
  const dates = DAYS.map(d => d.date);
  if (dates.length) dates.unshift(new Date(noon(dates[0]) - 864e5).toISOString().slice(0, 10));
  sel.innerHTML = dates.map(d => `<option value="${d}">${esc(fmtDate(noon(d)))}</option>`).join("");
  sel.value = dates.includes(keep) ? keep : (dates[2] || dates[0] || "");
}
function tzOffset(date) { // "+08:00" for the trip's time zone on that date
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(new Date(noon(date))).find(x => x.type === "timeZoneName");
  return (p && /[+-]\d{2}:\d{2}/.exec(p.value) || ["+00:00"])[0];
}
$("#simGo").addEventListener("click", () => {
  const date = $("#simDay").value; if (!date) return;
  sim = Date.parse(`${date}T${$("#simTime").value || "10:00"}:00${tzOffset(date)}`);
  $("#simLive").hidden = false; autoDay = true; tick(); jumpToNow();
});
$("#simLive").addEventListener("click", () => { sim = null; $("#simLive").hidden = true; autoDay = true; tick(); toast("Back to the live clock"); });

$("#dayStrip").addEventListener("click", e => { const b = e.target.closest("[data-day]"); if (!b) return; selDay = b.dataset.day; autoDay = false; store.set("trip-day", selDay); renderStrip(); renderDay(); });
$("#nowCard").addEventListener("click", e => { if (e.target.closest("#nowJump")) jumpToNow(); });
$("#countdown").addEventListener("click", () => { jumpToNow(); });
$("#dayView").addEventListener("change", e => {
  const id = e.target.dataset && e.target.dataset.bring; if (!id) return;
  packed[id] = e.target.checked; store.set("trip-bring", packed);
});
$("#dayView").addEventListener("input", e => {
  const date = e.target.dataset && e.target.dataset.note; if (!date) return;
  const notes = store.get("trip-notes") || {}; notes[date] = e.target.value; store.set("trip-notes", notes);
});
$("#dayView").addEventListener("click", e => {
  const g = e.target.closest("[data-goto]"); if (!g) return;
  const li = [...document.querySelectorAll("#dayView li[data-k]")].find(x => x.dataset.k === g.dataset.goto);
  if (li) { li.scrollIntoView({ behavior: smooth(), block: "start" }); li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1600); }
});

/* ---------- Ticks: the Sheet's Done column, then this phone's own ticks on top ---------- */
let ticks = store.get("trip-ticks") || {};
const sheetDone = () => Object.fromEntries(CHECKS.flatMap(g => g.items).map(i => [i.id, i.done]));
let doneInSheet = {};
const isDone = id => ticks[id] ?? doneInSheet[id] ?? false;
function setTick(id, on) { ticks[id] = on; store.set("trip-ticks", ticks); renderChecks(); renderPharmacy(); }

/* ---------- Checklists ---------- */
function renderChecks() {
  if (!CHECKS.length) { $("#checkGroups").innerHTML = `<div class="empty">No checklists yet.</div>`; $("#overall").innerHTML = ""; return; }
  $("#checkGroups").innerHTML = CHECKS.map(g => {
    const n = g.items.length, dn = g.items.filter(i => isDone(i.id)).length;
    return `<div class="group"><div class="group-head"><h3>${esc(g.title)}</h3><span class="meter">${dn}/${n}</span></div>
      <div class="bar"><i style="width:${n ? dn / n * 100 : 0}%"></i></div>
      <ul class="checks">${g.items.map(i => `<li><label><input type="checkbox" data-id="${esc(i.id)}" ${isDone(i.id) ? "checked" : ""}><span class="t"><span>${esc(i.text)}</span>${i.note ? `<small>${esc(i.note)}</small>` : ""}</span></label></li>`).join("")}</ul></div>`;
  }).join("");
  $("#overall").innerHTML = CHECKS.map(g => { const n = g.items.length, dn = g.items.filter(i => isDone(i.id)).length; return `<div class="card"><span class="k">${esc(g.title)}</span><span class="v mono">${dn}/${n}</span></div>`; }).join("");
}
$("#checkGroups").addEventListener("change", e => { const id = e.target.dataset.id; if (id) setTick(id, e.target.checked); });

/* ---------- Pharmacy ---------- */
let pharmView = false;
const rxRow = (k, v, cls) => v ? `<div${cls ? ` class="${cls}"` : ""}><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "";
function rxCard(i) {
  return `<article class="rx${isDone(i.id) ? " got" : ""}"><label class="rx-top"><input type="checkbox" data-id="${esc(i.id)}" ${isDone(i.id) ? "checked" : ""}><span class="rx-title"><b>${esc(i.name)}</b><span class="rx-qty mono">${esc(i.qty)}</span></span></label>
    <dl class="rx-dl">${rxRow("For", i.for)}${rxRow("Who", i.who)}${rxRow("How", i.how)}${rxRow("Careful", i.careful, "rx-c")}${rxRow("Pack", i.pack)}</dl></article>`;
}
function renderPharmacy() {
  const box = $("#pharmBody");
  if (!PHARM) { box.innerHTML = `<div class="empty">Nothing here yet.</div>`; $("#pharmMeter").textContent = ""; return; }
  const all = PHARM.groups.flatMap(g => g.items);
  $("#pharmMeter").textContent = `${all.filter(i => isDone(i.id)).length}/${all.length} bought`;
  const t = $("#pharmToggle"); t.setAttribute("aria-pressed", pharmView); t.textContent = pharmView ? "Back to the full kit" : "Show the pharmacist";
  if (pharmView) {
    let n = 0;
    box.innerHTML = `<ol class="rx-list">${PHARM.groups.map(g => `<h4>${esc(g.title)}</h4>${g.items.map(i => `<li value="${++n}"><span class="rx-row"><span>${esc(i.name)}</span><span class="rx-qty mono">${esc(i.qty)}</span></span></li>`).join("")}`).join("")}</ol>${PHARM.also ? `<p class="rx-sep">${esc(PHARM.also)}</p>` : ""}`;
    return;
  }
  box.innerHTML = `${PHARM.intro ? `<p class="lede">${esc(PHARM.intro)}</p>` : ""}${PHARM.also ? `<div class="callout tip"><span class="ic">ALSO</span><span>${esc(PHARM.also)}</span></div>` : ""}`
    + PHARM.groups.map(g => `<div class="group"><div class="group-head"><h3>${esc(g.title)}</h3></div>${g.note ? `<p class="lede">${esc(g.note)}</p>` : ""}<div class="rx-grid">${g.items.map(rxCard).join("")}</div></div>`).join("")
    + (PHARM.notes.length ? `<div class="card"><h3>Good to know</h3><ul class="rx-notes">${PHARM.notes.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "");
}
$("#pharmToggle").addEventListener("click", () => { pharmView = !pharmView; renderPharmacy(); window.scrollTo({ top: 0 }); });
$("#pharmBody").addEventListener("change", e => { const id = e.target.dataset && e.target.dataset.id; if (id) setTick(id, e.target.checked); });

/* ---------- Bookings ---------- */
function bkDayLabel(date) {
  const d = DAYS.find(x => x.date === date);
  if (d) return `${d.name} · ${d.dow}, ${fmtMonthDay(noon(d.date))}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || "No date";
  const s = fmtDate(noon(date));
  return DAYS.length && date < DAYS[0].date ? `Before the trip · ${s}` : s;
}
function renderBookings() {
  const box = $("#bkList");
  if (!BOOKINGS.length) { box.innerHTML = `<div class="empty">No bookings yet.</div>`; return; }
  const groups = {}; BOOKINGS.forEach(b => { (groups[b.date || "zz"] = groups[b.date || "zz"] || []).push(b); });
  box.innerHTML = Object.keys(groups).sort().map(k => `<div class="group"><div class="group-head"><h3>${esc(bkDayLabel(k === "zz" ? "" : k))}</h3></div>
    ${groups[k].map(b => `<article class="bk"><div class="top"><span class="ref mono">${esc(b.code)}</span>${b.status ? `<span class="pill ${b.status.toLowerCase() === "confirmed" ? "approved" : "proposed"}">${esc(b.status)}</span>` : ""}<span class="who">${esc(b.type)}${b.time ? ` · ${esc(b.time)}` : ""}</span></div>
      <h3>${esc(b.title)}</h3>
      ${b.details ? `<p>${esc(b.details)}</p>` : ""}
      ${b.bring ? `<div class="tip-inline">Bring: ${esc(b.bring)}</div>` : ""}
      ${tixHTML([b.code])}
    </article>`).join("")}</div>`).join("");
}

/* ---------- Info ---------- */
function renderInfo() {
  if (!INFO.length) { $("#infoBody").innerHTML = `<div class="empty">Nothing here yet.</div>`; return; }
  const rowHTML = r => r.big ? `<div class="big mono">${esc(r.text)}</div>` : `<li>${r.label ? `<b>${esc(r.label)}</b>${r.text ? " · " : ""}` : ""}${esc(r.text)}</li>`;
  const card = s => `<div class="card"><h3>${esc(s.title)}</h3>${s.rows.filter(r => r.big).map(rowHTML).join("")}<ul>${s.rows.filter(r => !r.big).map(rowHTML).join("")}</ul></div>`;
  const tabled = s => `<div class="group-head"><h3>${esc(s.title)}</h3></div>${s.rows.map(r => `<p class="lede">${r.label ? `${esc(r.label)}: ` : ""}${esc(r.text)}</p>`).join("")}
    <div class="tablewrap"><table><thead><tr>${s.table.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${s.table.rows.map(r => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${esc(c)}</b>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const cards = INFO.filter(s => !s.table), tables = INFO.filter(s => s.table);
  $("#infoBody").innerHTML = (cards.length ? `<div class="info-grid">${cards.map(card).join("")}</div>` : "") + tables.map(tabled).join("");
}

/* ---------- Views ---------- */
const VIEWS = ["itinerary", "checklists", "pharmacy", "bookings", "info"];
const has = { itinerary: () => true, checklists: () => CHECKS.length > 0, pharmacy: () => !!PHARM, bookings: () => BOOKINGS.length > 0, info: () => INFO.length > 0 };
function route() {
  if (!TRIP) return;
  let v = location.hash.slice(1);
  if (!VIEWS.includes(v) || !has[v]()) v = "itinerary";
  VIEWS.forEach(x => { $("#v-" + x).hidden = x !== v; });
  document.querySelectorAll("nav.tabs a").forEach(a => {
    a.hidden = !has[a.dataset.view]();
    if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}
window.addEventListener("hashchange", () => { route(); window.scrollTo({ top: 0 }); });

function renderProblems() {
  const box = $("#problems");
  box.hidden = !PROBLEMS.length;
  if (PROBLEMS.length) box.innerHTML = `<b>${PROBLEMS.length === 1 ? "1 thing" : `${PROBLEMS.length} things`} in the Sheet need${PROBLEMS.length === 1 ? "s" : ""} fixing. The rest of the plan is shown as usual.</b><ul>${PROBLEMS.map(p => `<li><span class="mono">${esc(p.where)}</span> · ${esc(p.text)}</li>`).join("")}</ul>`;
}
function renderAll() {
  document.title = TRIP.name;
  $("#tripName").textContent = TRIP.name;
  const first = DAYS[0], last = DAYS[DAYS.length - 1];
  const dates = first ? (first === last ? fmtMonthDay(noon(first.date)) : `${fmtMonthDay(noon(first.date))} – ${fmtMonthDay(noon(last.date))}`) : "";
  $("#tripSub").textContent = [dates, TRIP.travelers ? `${TRIP.travelers} travelers` : ""].filter(Boolean).join(" · ");
  doneInSheet = sheetDone();
  const st = tripState();
  if (st.phase === "during" && autoDay) selDay = focusDay(st).id;
  if (!DAYS.some(d => d.id === selDay)) selDay = DAYS[0] ? DAYS[0].id : null;
  $("#v-setup").hidden = true;
  ["#tabs", "#syncStatus", "#foot"].forEach(s => { $(s).hidden = false; });
  renderProblems(); renderSim(); renderStrip(st); renderDay(); renderNow(st);
  renderChecks(); renderPharmacy(); renderBookings(); renderInfo(); route();
}

/* ---------- Loading: the saved copy first, then the live Sheets ---------- */
const LINK = "trip-link", COPY = "trip-copy";
function setStatus(kind, text) { const s = $("#syncStatus"); s.classList.toggle("live", kind === "live"); s.classList.toggle("stale", kind === "stale"); $("#syncText").textContent = text; }
const savedWhen = ms => `${localDate(ms) === localDate(Date.now()) ? "today" : fmtDow(ms)} ${fmtClock(ms)}`;

async function fetchTrip(link, old) {
  const id = sheetId(link);
  const first = await fetchTabs(id, ["Trip", "Days", "Bookings"]);
  const plan = { ...first, ...await fetchTabs(id, dayTabs(first.Days)) };
  const sheets = readPlan({ Trip: first.Trip, Days: "" }).trip.sheets;
  // The other Sheets are extras: if one can't be read, keep the copy from last time.
  const extra = async (url, names, was) => {
    const xid = sheetId(url); if (!xid) return null;
    try { return await fetchTabs(xid, names); } catch (e) { return was || null; }
  };
  const [checklists, reference] = await Promise.all([
    extra(sheets.checklists, ["Checklists"], old && old.checklists),
    extra(sheets.pharmacyAndInfo, ["Pharmacy", "Pharmacy notes", "Info", "Tables"], old && old.reference),
  ]);
  return { plan, checklists, reference, savedAt: Date.now() };
}

let loading = false;
async function load(link, { first = false } = {}) {
  if (loading) return false;
  loading = true; $("#refresh").disabled = true;
  const old = store.get(COPY);
  if (TRIP) setStatus("", "Checking the Sheet…");
  try {
    const raw = await fetchTrip(link, old);
    const plan = readPlan(raw.plan);
    if (!plan.days.length) throw Object.assign(new Error("no days"), { notPlan: true });
    store.set(LINK, link); store.set(COPY, raw);
    useTrip(raw); renderAll();
    setStatus("live", `Up to date as of ${fmtClock(raw.savedAt)}.`);
    return true;
  } catch (e) {
    if (first) {
      $("#setupMsg").textContent = e.notShared ? "That Sheet isn't shared. Set it to “Anyone with the link can view” and try again."
        : e.notPlan ? "That Sheet opened, but it has no Days tab with days in it. Is it the Plan Sheet?"
        : "Couldn't reach Google Sheets. Check your connection and try again.";
    } else if (old) {
      setStatus("stale", e.notShared ? `The Sheet is no longer shared. Showing the copy saved ${savedWhen(old.savedAt)}.`
        : e.notPlan ? `The Sheet's Days tab can't be read. Showing the copy saved ${savedWhen(old.savedAt)}.`
        : `No connection. Showing the copy saved ${savedWhen(old.savedAt)}.`);
    }
    return false;
  } finally { loading = false; $("#refresh").disabled = false; }
}

$("#setupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const link = $("#setupLink").value.trim();
  if (!sheetId(link)) { $("#setupMsg").textContent = "That doesn't look like a Google Sheets link."; return; }
  $("#setupGo").disabled = true; $("#setupMsg").textContent = "Opening…";
  await load(link, { first: true });
  $("#setupGo").disabled = false;
});
$("#refresh").addEventListener("click", async () => { if (await load(store.get(LINK))) toast("Plan refreshed"); });
$("#forget").addEventListener("click", () => {
  if (!confirm("Forget this Sheet on this phone? Your ticks and notes stay.")) return;
  store.drop(LINK); store.drop(COPY); location.hash = ""; location.reload();
});

/* ---------- Boot ---------- */
(function boot() {
  const link = store.get(LINK), copy = store.get(COPY);
  if (!link) { $("#v-setup").hidden = false; return; }
  if (copy) {
    try { useTrip(copy); renderAll(); setStatus("", `Saved ${savedWhen(copy.savedAt)}. Checking the Sheet…`); } catch (e) {}
  } else { $("#syncStatus").hidden = false; }
  load(link);
})();
setInterval(tick, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !TRIP) return;
  tick();
  const copy = store.get(COPY);
  if (copy && Date.now() - copy.savedAt > 60000) load(store.get(LINK));
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
