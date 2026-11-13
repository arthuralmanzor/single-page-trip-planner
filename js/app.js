import { readPlan, dayTabs, midday, stopLine } from "./plan.js";
import { tripClock, stopKey } from "./clock.js";
import { shownStops, changesSince, changeLine } from "./changes.js";
import { readChecklists, readPharmacy, readInfo } from "./reference.js";
import { sheetId, fetchTabs, familyLink, sheetFromFamilyLink } from "./sheets.js";
import { forecastUrl, forecastDue, readForecast, forecastAt, forecastText, dayForecast, dayForecastText, asOf, WARNINGS_URL, readWarnings, hasWarnings, warningsAt } from "./weather.js";

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
let CLOCK = tripClock([]);

const fmtClock = ms => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(/\s/g, "").toLowerCase();
const fmtDow = ms => new Date(ms).toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
const fmtDate = ms => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
const fmtMonthDay = ms => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
const localDate = ms => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const noon = date => midday(date, TZ);
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
  CHECKS = readChecklists(raw.checklists && raw.checklists.Checklists);
  const ref = raw.reference || {};
  PHARM = readPharmacy(ref.Pharmacy, ref["Pharmacy notes"]);
  INFO = readInfo(ref.Info, ref.Tables);
  CLOCK = tripClock(DAYS);
  SHOWN = shownStops(DAYS);
  // The first plan this phone opens has nothing to mark.
  if (!store.get(SEEN)) store.set(SEEN, SHOWN);
}

/* ---------- Stops that changed since this phone last showed them ---------- */
const SEEN = "trip-seen";
let SHOWN = {}, NEWS = { marks: {}, removed: [] };
const readNews = () => { NEWS = changesSince(store.get(SEEN) || SHOWN, DAYS); };
function renderChanged() {
  const text = changeLine(NEWS, DAYS), el = $("#changed");
  el.hidden = !text; el.textContent = text;
  watchSeen();
}
/* A mark counts as seen after two seconds on screen, and the line after two seconds for the
   removed stops it counts. Both stay drawn until the next check or the next time the day is
   drawn, so they don't vanish mid-read. */
const timers = new WeakMap();
let watcher = null;
function watchSeen() {
  if (watcher) watcher.disconnect();
  // The tab bar stays at the top of the screen, so a mark under it isn't on screen.
  const bar = $("#tabbar"), top = Math.ceil(parseFloat(getComputedStyle(bar).top) + bar.offsetHeight);
  watcher = new IntersectionObserver(entries => entries.forEach(({ target: el, intersectionRatio }) => {
    clearTimeout(timers.get(el));
    if (intersectionRatio > 0.99) timers.set(el, setTimeout(() => { if (el.isConnected && !document.hidden) see(el); }, 2000));
  }), { threshold: 1, rootMargin: `-${top}px 0px 0px 0px` });
  document.querySelectorAll(".chg, #changed:not([hidden])").forEach(el => watcher.observe(el));
}
function see(el) {
  const seen = store.get(SEEN) || {};
  if (el.id === "changed") NEWS.removed.forEach(k => { delete seen[k]; });
  else seen[el.dataset.changed] = SHOWN[el.dataset.changed];
  store.set(SEEN, seen);
}
// Takes off the marks seen since the last check, without drawing the day again.
function dropSeen() {
  readNews();
  document.querySelectorAll(".chg").forEach(el => { if (!NEWS.marks[el.dataset.changed]) el.remove(); });
  renderChanged();
}

/* ---------- Trip clock: where you should be ---------- */
let sim = null, autoDay = true;
const nowMs = () => sim ?? Date.now();
const tripState = (ms = nowMs()) => CLOCK.at(ms);
/* Overnight, the last stop is from yesterday: focus on the day ahead. */
function fresh(st) { return localDate(st.cur.t) === localDate(st.ms); }
function focusDay(st) { return (!fresh(st) && st.next) ? st.next.d : st.cur.d; }

/* ---------- Weather: the Forecast at each stop's time, and the Warnings in force ---------- */
const WEATHER = "trip-weather", WARNINGS = "trip-warnings";
let FORECAST = store.get(WEATHER), IN_FORCE = store.get(WARNINGS);
// A feed that never answers would hold the next check up, so each fetch gives up after 15 seconds.
async function getJSON(url) {
  const stop = new AbortController(), t = setTimeout(() => stop.abort(), 15000);
  try {
    const res = await fetch(url, { signal: stop.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
let weatherBusy = false;
async function loadWeather() {
  if (weatherBusy || !TRIP) return;
  weatherBusy = true;
  try {
    const point = TRIP.weatherAt;
    if (!point) { FORECAST = null; store.drop(WEATHER); }
    else if (forecastDue(FORECAST, point, Date.now())) {
      try {
        const fc = readForecast(await getJSON(forecastUrl(point)), point, Date.now());
        if (fc) { FORECAST = fc; store.set(WEATHER, fc); }
      } catch (e) {}
    }
    if (!hasWarnings(TRIP)) { IN_FORCE = null; store.drop(WARNINGS); }
    else {
      try { IN_FORCE = readWarnings(await getJSON(WARNINGS_URL), Date.now()); store.set(WARNINGS, IN_FORCE); } catch (e) {}
    }
  } finally { weatherBusy = false; }
  applyWeather(); renderNow();
}
const forecastLine = ms => { const f = forecastAt(FORECAST, ms, Date.now()); return f ? forecastText(f) : ""; };
const forecastHTML = ms => { const line = forecastLine(ms); return line ? `<span class="forecast">${esc(line)}</span>` : ""; };
/* Fills in the day's weather without drawing the day again, so a note being typed keeps its
   keyboard. The stop the family is at shows the weather now, as the now card does. */
function applyWeather(st = tripState()) {
  document.querySelectorAll("#dayView .forecast[data-stop-at]").forEach(el => {
    const line = forecastLine(el.closest("li.now") ? st.ms : +el.dataset.stopAt);
    el.textContent = line; el.hidden = !line;
  });
  const now = Date.now(), day = $("#dayView .day-forecast");
  if (day) {
    const f = dayForecast(FORECAST, +day.dataset.firstStopAt, +day.dataset.lastStopAt, now), old = asOf(FORECAST, now);
    day.textContent = f ? dayForecastText(f) + (old ? ` · as of ${savedWhen(old)}` : "") : ""; day.hidden = !f;
  }
  const list = warningsAt(IN_FORCE, now), box = $("#warnings");
  box.hidden = !list.length;
  if (list.length) box.innerHTML = `<span class="ic">WARNING</span><span><b>${esc(list.join(" · "))}</b>In force as of ${esc(savedWhen(IN_FORCE.fetchedAt))}.</span>`;
}

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
function placeHTML(p) {
  const mapLink = `<a class="maplink" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(p.search)}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.750 7-13a7 7 0 0 0-7-7zm0 9.500a2.500 2.500 0 1 1 0-5 2.500 2.500 0 0 1 0 5z"/></svg><span>${esc(p.label)}</span></a>`;
  if (!p.localAddress) return mapLink;
  return `<span class="place">${mapLink}<button type="button" class="btn" data-local-address="${esc(p.localAddress)}" data-place="${esc(p.label)}">Show the driver<span class="sr"> the address of ${esc(p.label)}</span></button></span>`;
}
const mapHTML = places => places.length ? `<div class="maps">${places.map(placeHTML).join("")}</div>` : "";
function ticketsFor(codes) {
  const seen = new Set(), out = [];
  for (const b of BOOKINGS) if (codes.includes(b.code)) for (const t of b.tickets) if (!seen.has(t.url)) { seen.add(t.url); out.push(t); }
  return out;
}
function tixHTML(codes) {
  const list = ticketsFor(codes);
  return list.length ? `<div class="tixlinks">${list.map(t => `<a class="btn" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Open ticket · ${esc(t.label)}</a>`).join("")}</div>` : "";
}
// What a stop says under its name. The day's plan and the now card both show it.
const stopHTML = s => [
  etaHTML(s), legsHTML(s),
  s.details ? `<p>${esc(s.details)}</p>` : "",
  mapHTML(s.places),
  s.wait ? `<div class="wait"><span class="lbl">Expect</span><span>${esc(s.wait)}</span></div>` : "",
  s.tip ? `<div class="tip-inline">${esc(s.tip)}</div>` : "",
  tixHTML(s.bookings),
].join("");

/* ---------- Itinerary ---------- */
let selDay = store.get("trip-day");
const dayById = id => DAYS.find(d => d.id === id) || DAYS[0];
function renderStrip(st = tripState()) {
  const today = st.phase === "during" ? focusDay(st).id : null;
  const curIdx = today ? DAYS.findIndex(d => d.id === today) : (st.phase === "after" ? DAYS.length : -1);
  $("#dayStrip").innerHTML = DAYS.map((d, i) => `<button class="day-btn${i < curIdx ? " past" : ""}" type="button" data-day="${esc(d.id)}" aria-pressed="${d.id === selDay}">
    <span class="dow">${esc(d.dow)}</span><span class="dn">${esc(d.dn)}</span><span class="tag">${esc(d.tag)}</span>${d.id === today ? '<span class="today">NOW</span>' : ""}</button>`).join("");
}
const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>`;
const copyHTML = (d, s) => `<button type="button" class="copy" data-stop-line="${esc(stopLine(d, s))}">${s.code ? `<span class="sr">Copy </span>${esc(s.code)}` : "Copy"}${COPY_ICON}</button>`;
const markHTML = k => NEWS.marks[k] ? `<span class="chg ${NEWS.marks[k]}" data-changed="${esc(k)}">${NEWS.marks[k] === "new" ? "New" : "Updated"}</span>` : "";
function timelineHTML(d) {
  return `<ol class="tl">${d.stops.map(s => `<li class="k-${esc(s.kind)}${s.problems.length ? " bad" : ""}" data-k="${esc(stopKey(d, s))}">
      <span class="time">${esc(s.time)}<span class="code">${esc(s.code)}</span>${copyHTML(d, s)}</span><span class="rail"><span class="node"></span></span>
      <div class="body"><span class="state" aria-live="polite"></span>${markHTML(stopKey(d, s))}${s.dayStart ? '<span class="startchip">Start here</span>' : ""}<h3>${esc(s.title || "(no name)")}</h3>${s.at != null ? `<span class="forecast" data-stop-at="${s.at}" hidden></span>` : ""}
        ${s.problems.map(p => `<div class="badnote">Fix in the Sheet: ${esc(p)}</div>`).join("")}
        ${stopHTML(s)}
      </div></li>`).join("")}</ol>`;
}
let packed = store.get("trip-bring") || {};
function glanceHTML(d) {
  const plan = d.stops.filter(s => s.summary).map(s => `<li><button type="button" class="g-item" data-goto="${esc(stopKey(d, s))}"><span class="mono">${esc(s.time)}</span><span>${esc(s.summary)}</span></button></li>`).join("");
  const bring = d.bring.length ? `<div class="g-col"><h3 class="g-h">Bring today</h3><ul class="g-bring">${d.bring.map((b, i) => { const id = `${d.date}-${i}`; return `<li><label><input type="checkbox" data-bring="${esc(id)}" ${packed[id] ? "checked" : ""}><span>${esc(b)}</span></label></li>`; }).join("")}</ul><p class="g-every">${TRIP.everyDay ? `Every day: ${esc(TRIP.everyDay)}. ` : ""}Ticks stay on this phone.</p></div>` : "";
  if (!plan && !bring) return "";
  return `<section class="glance" aria-label="Day ${d.n} at a glance">${plan ? `<div class="g-col"><h3 class="g-h">Today's plan</h3><ol class="g-list">${plan}</ol></div>` : ""}${bring}</section>`;
}
function dayBookingsHTML(d) {
  const list = BOOKINGS.filter(b => b.date === d.date);
  return list.length ? `<div class="daybk"><span class="lbl">Booked</span>${list.map(b => `<a href="#bookings" class="bkchip"><span class="mono">${esc(b.code)}</span> ${esc(b.title)}${b.time ? ` · ${esc(b.time)}` : ""}</a>`).join("")}</div>` : "";
}
function renderDay() {
  readNews();
  const d = dayById(selDay);
  if (!d) { $("#dayView").innerHTML = `<div class="empty">The Sheet has no days yet.</div>`; return; }
  const notes = store.get("trip-notes") || {};
  const timed = d.stops.filter(s => s.at != null).map(s => s.at);
  const dayForecastEl = timed.length ? `<p class="day-forecast" data-first-stop-at="${Math.min(...timed)}" data-last-stop-at="${Math.max(...timed)}" hidden></p>` : "";
  $("#dayView").innerHTML = `
   <div class="dayhead"><span class="kicker">${esc(d.name)} · ${esc(d.dow)}, ${esc(fmtMonthDay(noon(d.date)))}</span><h2>${esc(d.title)}</h2>${dayForecastEl}</div>
   ${glanceHTML(d)}
   ${bannerHTML(d.banner)}
   ${dayBookingsHTML(d)}
   <p class="codehint">Each stop has a code like <span class="mono">D${d.n}-03</span>. Tap it to copy the stop, then paste it when you ask Gemini for a change.</p>
   ${d.stops.length ? timelineHTML(d) : `<div class="empty">No stops on this day yet.</div>`}
   <div class="card"><h3>My notes for ${esc(d.name)}</h3>
     <label for="dayNote" class="saved" style="min-height:0">Saved on this phone only.</label>
     <textarea id="dayNote" data-note="${esc(d.date)}" placeholder="e.g. Meet at Exit J2">${esc(notes[d.date] || "")}</textarea>
   </div>`;
  applyMarks(); applyWeather(); renderChanged();
}
function applyMarks(st = tripState()) {
  document.querySelectorAll("#dayView .g-item[data-goto]").forEach(g => {
    const { is } = CLOCK.mark(g.dataset.goto, st);
    g.classList.toggle("done", is === "done"); g.classList.toggle("now", is === "now" && fresh(st));
  });
  document.querySelectorAll("#dayView li[data-k]").forEach(li => {
    const { is: cls, folds } = CLOCK.mark(li.dataset.k, st), s = li.querySelector(".state");
    li.classList.toggle("done", cls === "done"); li.classList.toggle("now", cls === "now"); li.classList.toggle("next", cls === "next");
    fold(li, folds);
    if (cls === "now") { li.style.setProperty("--p", st.p.toFixed(3)); s.textContent = sim ? "Now (preview)" : "You are here"; }
    else if (cls === "next") { li.style.removeProperty("--p"); s.textContent = `Next · ${until(st.next.t - st.ms)}`; }
    else { li.style.removeProperty("--p"); s.textContent = ""; }
  });
}
/* A done stop folds to its time, code and name. Its name turns into a button that opens it and
   folds it again, and a stop opened that way stays open while it's done. */
const opened = new Set();
function fold(li, folds) {
  const k = li.dataset.k, h = li.querySelector("h3"), btn = h.querySelector(".fold");
  if (folds && !btn) h.innerHTML = `<button type="button" class="fold"><span>${esc(h.textContent)}</span></button>`;
  if (!folds) { opened.delete(k); if (btn) h.textContent = btn.textContent; }
  const folded = folds && !opened.has(k);
  li.classList.toggle("folded", folded);
  if (folds) h.firstChild.setAttribute("aria-expanded", String(!folded));
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
  // The preview tool is at the bottom of the page, so the way back to the clock is here.
  const liveBtn = sim ? '<button type="button" class="btn" id="simLive">Back to live</button>' : "";
  const simTag = sim ? `<span class="simtag">Preview</span>${liveBtn}` : "";
  if (st.phase === "empty") {
    box.innerHTML = `<div class="now-head"><span class="kicker">Trip mode</span>${simTag}</div><p class="now-sub">Once the Sheet has stops with times, this card shows where you should be.</p>`;
  } else if (st.phase === "before") {
    const f = st.next;
    box.innerHTML = `<div class="now-head"><span class="kicker">Trip mode</span>${simTag}</div>
      <h3 class="now-title">${until(f.t - st.ms).replace(/^in /, "")} to go</h3>
      <p class="now-sub">From ${esc(fmtDate(f.t))}, this card shows where you should be, what's next and how to get there. Open the page on the day and it follows the plan by the clock.</p>
      <div class="now-next"><span class="lbl">First up · ${esc(fmtDate(f.t))}, ${fmtClock(f.t)}</span>${markHTML(stopKey(f.d, f.s))}<h4>${esc(f.s.title)}</h4>${forecastHTML(f.t)}</div>`;
  } else if (st.phase === "after") {
    box.innerHTML = `<div class="now-head"><span class="kicker">Trip complete</span>${simTag}</div><h3 class="now-title">Welcome home</h3><p class="now-sub">The full plan stays here for the photos and the memories.</p>`;
  } else {
    const { cur, next, p, ms } = st;
    const isFresh = fresh(st), fd = focusDay(st);
    const sameDay = next && localDate(next.t) === localDate(ms);
    const heads = next ? (next.s.tip || next.s.wait || "") : "";
    const stop = stopHTML(cur.s);
    box.innerHTML = `<div class="now-head"><span class="livedot" aria-hidden="true"></span><span class="kicker">${sim ? "Preview" : "Now"} · ${esc(fmtDow(ms))} ${fmtClock(ms)}</span>${liveBtn}</div>
      ${isFresh ? `<div class="now-cur"><span class="mono code">${copyHTML(cur.d, cur.s)} · ${esc(cur.s.time)}</span>${markHTML(stopKey(cur.d, cur.s))}<h3 class="now-title">${esc(cur.s.title)}</h3>${forecastHTML(ms)}</div>
      ${stop ? `<div class="now-stop">${stop}</div>` : ""}` : `<div class="now-cur"><span class="mono code">${esc(fd.name)} · ${esc(fd.dow)}, ${esc(fmtMonthDay(noon(fd.date)))}</span><h3 class="now-title">${esc(fd.title)}</h3></div>
      ${fd.bring.length ? `<div class="heads"><span class="lbl">Bring today</span><span>${esc(fd.bring.join(" · "))}</span></div>` : ""}`}
      ${next && isFresh ? `<div class="now-bar" role="progressbar" aria-label="Time until the next stop" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="width:${(p * 100).toFixed(1)}%"></i></div>` : ""}
      ${next ? `<div class="now-next">
        <span class="lbl">${next.s.kind === "travel" ? "Leave" : "Next"} ${sameDay ? "" : `${esc(fmtDow(next.t))} `}${fmtClock(next.t)} · ${until(next.t - ms)}</span>
        ${markHTML(stopKey(next.d, next.s))}<h4>${esc(next.s.title)}</h4>${forecastHTML(next.t)}
        ${legsHTML(next.s)}
        ${heads ? `<div class="heads"><span class="lbl">Heads-up</span><span>${esc(heads)}</span></div>` : ""}
      </div>` : `<p class="now-sub">That's the last stop of the trip.</p>`}
      <button type="button" class="btn" id="nowJump">Show in the day's plan</button>`;
  }
  renderPill(st); watchSeen();
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
  else { renderStrip(st); applyMarks(st); applyWeather(st); }
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
  autoDay = true; tick();
  // The tool is at the bottom of the page. Before or after the trip, the moment shows only in the
  // now card at the top.
  if (tripState().phase === "during") jumpToNow();
  else if (location.hash && location.hash !== "#itinerary") location.hash = "itinerary"; // which scrolls to the top
  else scrollTo({ top: 0, behavior: smooth() });
});

$("#dayStrip").addEventListener("click", e => { const b = e.target.closest("[data-day]"); if (!b) return; selDay = b.dataset.day; autoDay = false; store.set("trip-day", selDay); renderStrip(); renderDay(); });
$("#nowCard").addEventListener("click", e => {
  const copy = e.target.closest("[data-stop-line]");
  if (copy) copyStop(copy.dataset.stopLine);
  else if (e.target.closest("#nowJump")) jumpToNow();
  else if (e.target.closest("#simLive")) { sim = null; autoDay = true; tick(); toast("Back to the live clock"); }
});
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
  const copy = e.target.closest("[data-stop-line]");
  if (copy) { copyStop(copy.dataset.stopLine); return; }
  const stop = e.target.closest("li[data-k]");
  if (stop && stop.querySelector(".fold") && e.target.closest(".fold, .time")) {
    const k = stop.dataset.k;
    if (opened.has(k)) opened.delete(k); else opened.add(k);
    fold(stop, true); return;
  }
  const g = e.target.closest("[data-goto]"); if (!g) return;
  const li = [...document.querySelectorAll("#dayView li[data-k]")].find(x => x.dataset.k === g.dataset.goto);
  if (li) { li.scrollIntoView({ behavior: smooth(), block: "start" }); li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1600); }
});

/* ---------- Copy a stop to paste into a chat ---------- */
async function copyStop(line) {
  try { await navigator.clipboard.writeText(line); toast("Copied. Paste it into your chat."); }
  catch (e) { toast("Couldn't copy here. Type the stop's code instead."); }
}

/* ---------- Show the driver: a place's local address, full-screen ---------- */
// The button is in the day's plan and in the now card, so one listener on the page serves both.
document.addEventListener("click", e => {
  const b = e.target.closest("[data-local-address]"); if (!b) return;
  $("#driverPlace").textContent = b.dataset.place;
  $("#driverAddress").textContent = b.dataset.localAddress;
  $("#driver").showModal();
});
$("#driverClose").addEventListener("click", () => $("#driver").close());

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
const rxId = i => "rx:" + i.id; // a medicine and a checklist line may share an Id in their Sheets
const rxRow = (k, v, cls) => v ? `<div${cls ? ` class="${cls}"` : ""}><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "";
function rxCard(i) {
  return `<article class="rx${isDone(rxId(i)) ? " got" : ""}"><label class="rx-top"><input type="checkbox" data-id="${esc(rxId(i))}" ${isDone(rxId(i)) ? "checked" : ""}><span class="rx-title"><b>${esc(i.name)}</b><span class="rx-qty mono">${esc(i.qty)}</span></span></label>
    <dl class="rx-dl">${rxRow("For", i.for)}${rxRow("Who", i.who)}${rxRow("How", i.how)}${rxRow("Careful", i.careful, "rx-c")}${rxRow("Pack", i.pack)}</dl></article>`;
}
function renderPharmacy() {
  const box = $("#pharmBody");
  if (!PHARM) { box.innerHTML = `<div class="empty">Nothing here yet.</div>`; $("#pharmMeter").textContent = ""; return; }
  const all = PHARM.groups.flatMap(g => g.items);
  $("#pharmMeter").textContent = `${all.filter(i => isDone(rxId(i))).length}/${all.length} bought`;
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
window.addEventListener("hashchange", () => {
  // A family link pasted into a tab already on this page changes only the hash. Boot reads it.
  if (sheetFromFamilyLink(location.href)) { location.reload(); return; }
  route(); window.scrollTo({ top: 0 });
});

/* The tab bar sticks below the phone's status bar, so it's stuck once the header has scrolled
   under the status bar. The status bar's height changes when the phone turns. */
const tabbar = $("#tabbar"), tabs = $("#tabbar nav");
let stuckWatch = null, statusBar = null;
function watchStuck() {
  const top = parseFloat(getComputedStyle(tabbar).top);
  if (top === statusBar) return;
  statusBar = top;
  if (stuckWatch) stuckWatch.disconnect();
  stuckWatch = new IntersectionObserver(([e]) => tabbar.classList.toggle("stuck", !e.isIntersecting), { rootMargin: `-${top}px 0px 0px 0px` });
  stuckWatch.observe($("header.ticket"));
}
watchStuck();
addEventListener("resize", watchStuck);
// The name takes room from the tabs, so the open tab is scrolled back into view.
new ResizeObserver(() => {
  const a = tabs.querySelector("[aria-current]"); if (!a) return;
  const n = tabs.getBoundingClientRect(), r = a.getBoundingClientRect();
  if (r.right > n.right) tabs.scrollLeft += r.right - n.right;
  else if (r.left < n.left) tabs.scrollLeft -= n.left - r.left;
}).observe(tabs);

function renderProblems() {
  const box = $("#problems");
  box.hidden = !PROBLEMS.length;
  if (PROBLEMS.length) box.innerHTML = `<b>${PROBLEMS.length === 1 ? "1 thing" : `${PROBLEMS.length} things`} in the Sheet need${PROBLEMS.length === 1 ? "s" : ""} fixing. The rest of the plan is shown as usual.</b><ul>${PROBLEMS.map(p => `<li><span class="mono">${esc(p.where)}</span> · ${esc(p.text)}</li>`).join("")}</ul>`;
}
function renderAll() {
  document.title = TRIP.name;
  $("#tripName").textContent = $("#tabbarName").textContent = TRIP.name;
  const first = DAYS[0], last = DAYS[DAYS.length - 1];
  const dates = first ? (first === last ? fmtMonthDay(noon(first.date)) : `${fmtMonthDay(noon(first.date))} – ${fmtMonthDay(noon(last.date))}`) : "";
  $("#tripSub").textContent = [dates, TRIP.travelers ? `${TRIP.travelers} travelers` : ""].filter(Boolean).join(" · ");
  doneInSheet = sheetDone();
  const st = tripState();
  if (st.phase === "during" && autoDay) selDay = focusDay(st).id;
  if (!DAYS.some(d => d.id === selDay)) selDay = DAYS[0] ? DAYS[0].id : null;
  $("#v-setup").hidden = true;
  ["#tabbar", "#syncStatus", "#share", "#simBox", "#foot"].forEach(s => { $(s).hidden = false; });
  $("#weatherCredit").hidden = !TRIP.weatherAt; $("#hkoCredit").hidden = !hasWarnings(TRIP);
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

// The plan the page shows, as text. A check that finds the same plan draws nothing again, so it
// doesn't close the keyboard on a note being typed.
let drawn = "";
const planText = raw => JSON.stringify([raw.plan, raw.checklists, raw.reference]);
let loading = false, checkedAt = 0;
async function load(link, { first = false } = {}) {
  if (loading) return false;
  loading = true; checkedAt = Date.now(); $("#refresh").disabled = true;
  const old = store.get(COPY);
  if (TRIP) { setStatus("", "Checking the Sheet…"); dropSeen(); }
  try {
    const raw = await fetchTrip(link, old);
    const plan = readPlan(raw.plan);
    if (!plan.days.length) throw Object.assign(new Error("no days"), { notPlan: true, why: plan.problems[0] && plan.problems[0].text });
    store.set(LINK, link); store.set(COPY, raw);
    if (planText(raw) !== drawn) { useTrip(raw); renderAll(); drawn = planText(raw); }
    setStatus("live", `Up to date as of ${fmtClock(raw.savedAt)}.`);
    return true;
  } catch (e) {
    if (first) {
      $("#setupMsg").textContent = e.notShared ? "That Sheet isn't shared. Set it to “Anyone with the link can view” and try again."
        : e.notPlan ? (e.why || "That Sheet opened, but it has no Days tab with days in it. Is it the Plan Sheet?")
        : "Couldn't reach Google Sheets. Check your connection and try again.";
    } else if (old) {
      setStatus("stale", e.notShared ? `The Sheet is no longer shared. Showing the copy saved ${savedWhen(old.savedAt)}.`
        : e.notPlan ? `${e.why || "The Sheet's Days tab can't be read."} Showing the copy saved ${savedWhen(old.savedAt)}.`
        : `No connection. Showing the copy saved ${savedWhen(old.savedAt)}.`);
    }
    return false;
  } finally { loading = false; $("#refresh").disabled = false; loadWeather(); }
}

async function openFromSetup(link) {
  $("#setupGo").disabled = true; $("#setupMsg").textContent = "Opening…";
  await load(link, { first: true });
  $("#setupGo").disabled = false;
}
$("#setupForm").addEventListener("submit", e => {
  e.preventDefault();
  const typed = $("#setupLink").value.trim(), link = sheetFromFamilyLink(typed) || typed;
  if (!sheetId(link)) { $("#setupMsg").textContent = "That doesn't look like a Google Sheets link."; return; }
  openFromSetup(link);
});
$("#refresh").addEventListener("click", async () => { if (await load(store.get(LINK))) toast("Plan refreshed"); });
// What came from the Sheet. The family's own ticks and notes stay.
const dropSheet = () => [LINK, COPY, SEEN, WEATHER, WARNINGS].forEach(k => store.drop(k));
$("#forget").addEventListener("click", () => {
  if (!confirm("Forget this Sheet on this phone? Your ticks and notes stay.")) return;
  dropSheet(); location.hash = ""; location.reload();
});

/* ---------- Share with family ---------- */
$("#shareGo").addEventListener("click", async () => {
  const url = familyLink(location.href, store.get(LINK));
  if (navigator.share) {
    try { await navigator.share({ title: TRIP.name, url }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); toast("Link copied. Send it to the family."); }
  catch (e) { $("#shareLink").value = url; $("#shareCopy").hidden = false; $("#shareLink").select(); }
});

/* ---------- Boot ---------- */
(function boot() {
  const fromFamily = sheetFromFamilyLink(location.href);
  if (fromFamily) history.replaceState(null, "", location.pathname + location.search);
  if (fromFamily && sheetId(fromFamily) !== sheetId(store.get(LINK))) {
    if (!store.get(LINK) || confirm("Open the plan from this link instead of the one on this phone? Your ticks and notes stay.")) {
      dropSheet();
      $("#v-setup").hidden = false; $("#setupLink").value = fromFamily;
      openFromSetup(fromFamily);
      return;
    }
  }
  const link = store.get(LINK), copy = store.get(COPY);
  if (!link) { $("#v-setup").hidden = false; return; }
  if (copy) {
    try { useTrip(copy); renderAll(); drawn = planText(copy); setStatus("", `Saved ${savedWhen(copy.savedAt)}. Checking the Sheet…`); } catch (e) {}
  } else { $("#syncStatus").hidden = false; }
  load(link);
})();
setInterval(() => {
  tick();
  if (!document.hidden && TRIP && Date.now() - checkedAt >= 5 * 60e3) load(store.get(LINK));
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !TRIP) return;
  tick();
  const copy = store.get(COPY);
  if (copy && Date.now() - copy.savedAt > 60000) load(store.get(LINK));
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
