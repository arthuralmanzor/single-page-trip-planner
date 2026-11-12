import { table } from "./csv.js";

// Hong Kong's lines get their own colour on the page. Any other name still shows, in grey.
const LINES = {
  "tsuen wan line": "tsw", "island line": "isl", "tung chung line": "tcl",
  "south island line": "sil", "disneyland line": "drl", "ding ding tram": "tram",
  "star ferry": "ferry", "bus": "bus",
};
const KINDS = ["travel", "key", "visit", "food"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const STOP_HEAD = "Code";
const DAYS_HEAD = "Day";

const pad2 = n => String(n).padStart(2, "0");
const lines = s => String(s || "").split(/\n/).map(x => x.trim()).filter(Boolean);

// Milliseconds for a wall-clock time in the trip's time zone.
export const midday = (date, tz) => zoned(date, 12, 0, tz);

function knownZone(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
}

function zoned(date, hh, mm, tz) {
  const utc = Date.parse(`${date}T${pad2(hh)}:${pad2(mm)}:00Z`);
  if (Number.isNaN(utc)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utc)).map(p => [p.type, p.value]));
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  return utc - (shown - utc);
}

// "16:30", "4:30 PM", "16:30:00", "≈9:05" or "Nov 15 13:45": the moment, and the text to show.
function readTime(text, day, tz) {
  const m = /^(?:([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? )?≈?(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?$/i.exec(text.trim());
  if (!m) return null;
  let hh = +m[3];
  const mm = +m[4], half = (m[5] || "").toLowerCase();
  if (half === "p" && hh < 12) hh += 12;
  if (half === "a" && hh === 12) hh = 0;
  if (hh > 23 || mm > 59) return null;
  let date = day.date;
  if (m[1]) {
    const mon = MONTHS.indexOf(m[1].toLowerCase());
    if (mon < 0) return null;
    // The date sits just before or inside the trip, so it takes the nearest year to the day's.
    const y = +day.date.slice(0, 4), dMon = +day.date.slice(5, 7) - 1;
    const year = mon - dMon > 6 ? y - 1 : dMon - mon > 6 ? y + 1 : y;
    date = `${year}-${pad2(mon + 1)}-${pad2(+m[2])}`;
  }
  const at = zoned(date, hh, mm, tz);
  if (at == null) return null;
  const clock = `${hh}:${pad2(mm)}`;
  return { at, date, shown: m[1] ? `${m[1]} ${+m[2]} ${clock}` : clock };
}

function readLeg(text) {
  const m = /^([^:→]+):\s*(.*?)(?:\s*\(([^()]*)\))?$/.exec(text);
  const name = m ? m[1].trim() : "Route";
  const [from, to = ""] = (m ? m[2] : text).split("→").map(x => x.trim());
  return {
    line: (Object.entries(LINES).find(([known]) => new RegExp(`\\b${known}\\b`, "i").test(name)) || [])[1] || "",
    name,
    from: to ? from : "",
    to: to || from,
    notes: (m && m[3] ? m[3] : "").split(" · ").map(x => x.trim()).filter(Boolean),
  };
}

function readPlace(text) {
  const [label, search] = text.split("|").map(x => x.trim());
  return { label, search: search || label };
}

function readTrip(text) {
  const kv = Object.fromEntries(table(text).rows.map(r => [r.Key, r.Value]));
  const sheets = {};
  for (const [k, v] of Object.entries(kv)) {
    const m = /^(.*) sheet$/i.exec(k || "");
    if (m && v) sheets[m[1].toLowerCase().replace(/[^a-z]+(.)/g, (_, c) => c.toUpperCase())] = v;
  }
  return {
    name: kv["Name"] || "Trip",
    firstDay: kv["First day"] || "",
    lastDay: kv["Last day"] || "",
    timeZone: kv["Time zone"] || "",
    travelers: kv["Travelers"] || "",
    hotel: kv["Hotel"] || "",
    everyDay: kv["Every day"] || "",
    sheets,
  };
}

function readStop(r, day, tz, seen, booked) {
  const problems = [];
  const code = r.Code;
  const m = /^D(\d+)-(\d+)$/.exec(code);
  if (!code) problems.push("This stop has no code.");
  else if (!m) problems.push(`The code ${code} isn't in the D3-05 form.`);
  else if (+m[1] !== day.n) problems.push(`The code ${code} is on the Day ${day.n} tab.`);
  else if (seen.has(code)) problems.push(`The code ${code} is used twice.`);
  seen.add(code);

  const time = readTime(r.Time || "", day, tz);
  // An arrival with no date of its own is on the ride's date, which can be the day before the tab's.
  const arrival = time && readTime(r.Arrives || "", { date: time.date }, tz);
  if (!time) problems.push(r.Time ? `The time "${r.Time}" isn't a time like 16:30.` : "This stop has no time.");
  if (!r.Stop) problems.push("This stop has no name.");
  let kind = (r.Kind || "").toLowerCase();
  if (!KINDS.includes(kind)) {
    problems.push(`The kind "${r.Kind}" isn't one of ${KINDS.join(", ")}.`);
    kind = "visit";
  }
  const bookings = (r.Bookings || "").split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  if (booked.size) for (const b of bookings) if (!booked.has(b)) problems.push(`The booking ${b} isn't in the Bookings tab.`);
  return {
    code,
    time: time ? time.shown : r.Time || "",
    at: time ? time.at : null,
    kind,
    title: r.Stop || "",
    details: r.Details || "",
    leaves: r.Leaves || "",
    arrives: r.Arrives || "",
    arrivesAt: arrival ? arrival.at : null,
    legs: lines(r.Route).map(readLeg),
    wait: r.Wait || "",
    tip: r.Tip || "",
    places: lines(r.Places).map(readPlace),
    bookings,
    summary: r.Summary || "",
    dayStart: /^(yes|y|true|x)$/i.test(r["Day start"] || ""),
    problems,
  };
}

function readStops(text, day, tz, problems, booked) {
  if (text == null) {
    problems.push({ where: day.name, text: `The Sheet has no ${day.name} tab.` });
    return [];
  }
  const t = table(text);
  if (t.keys[0] !== STOP_HEAD) {
    problems.push({ where: day.name, text: `The ${day.name} tab is missing or doesn't start with a ${STOP_HEAD} column.` });
    return [];
  }
  const seen = new Set();
  const stops = t.rows.map(r => readStop(r, day, tz, seen, booked));
  // A stop with no readable time keeps its place after the row above it.
  let last = -Infinity;
  const order = stops.map((s, i) => { if (s.at != null) last = s.at; return { s, key: s.at ?? last, i }; });
  order.sort((a, b) => a.key - b.key || a.i - b.i);
  const name = s => s.code || s.title || "a stop";
  // Stops that start together are the group splitting up. The page can't tell who goes on, so
  // the next stop follows whichever of the rides arrives first.
  let ride = null;
  for (const { s } of order) {
    if (ride && s.at > ride.at && s.at < ride.arrivesAt)
      s.problems.push(`${name(s)} starts at ${s.time}, before the ride ${name(ride)} arrives at ${ride.arrives}.`);
    if (s.arrivesAt != null && !(ride && ride.at === s.at && ride.arrivesAt <= s.arrivesAt)) ride = s;
  }
  for (const { s } of order)
    for (const text of s.problems) problems.push({ where: `${day.name} · ${name(s)}`, text });
  return order.map(o => o.s);
}

function readBookings(text) {
  const t = table(text);
  if (t.keys[0] !== "Code") return [];
  return t.rows.map(r => ({
    code: r.Code, date: r.Date || "", type: r.Type || "", title: r.Title || "", time: r.Time || "",
    details: r.Details || "", bring: r.Bring || "", status: r.Status || "",
    tickets: lines(r.Tickets).map((line, i) => {
      const cut = line.lastIndexOf("|");
      const url = (cut < 0 ? line : line.slice(cut + 1)).trim();
      return { label: (cut < 0 ? "" : line.slice(0, cut).trim()) || `Ticket ${i + 1}`, url };
    }).filter(k => /^https:\/\//.test(k.url)),
  }));
}

// The plan the site shows, from the raw text of each tab of the Plan Sheet.
// Tabs: "Trip", "Days", one tab per row of Days named as in its Day column, and "Bookings".
export function readPlan(tabs) {
  const problems = [];
  const trip = readTrip(tabs.Trip);
  if (!knownZone(trip.timeZone || "-")) {
    problems.push({ where: "Trip", text: trip.timeZone
      ? `The time zone "${trip.timeZone}" isn't a name like Asia/Hong_Kong, so times are shown in UTC.`
      : "The Trip tab has no Time zone row, so times are shown in UTC." });
    trip.timeZone = "UTC";
  }
  const tz = trip.timeZone;
  const bookings = readBookings(tabs.Bookings);
  const booked = new Set(bookings.map(b => b.code));
  const dayTable = table(tabs.Days);
  if (dayTable.keys[0] !== DAYS_HEAD) {
    problems.push({ where: "Days", text: `The Days tab is missing or doesn't start with a ${DAYS_HEAD} column.` });
    return { trip, days: [], bookings, problems };
  }
  const days = [];
  for (const r of dayTable.rows) {
    const n = +(/\d+/.exec(r.Day) || [0])[0];
    const noon = /^\d{4}-\d{2}-\d{2}$/.test(r.Date) ? midday(r.Date, tz) : null;
    if (noon == null) {
      problems.push({ where: "Days", text: `${r.Day} has the date "${r.Date}", which isn't in the 2026-11-18 form.` });
      continue;
    }
    const day = {
      id: "d" + n, n, name: r.Day, date: r.Date,
      dow: new Date(noon).toLocaleDateString("en-US", { weekday: "short", timeZone: tz }),
      dn: String(+r.Date.slice(8, 10)),
      tag: r.Tag || "", title: r.Title || "",
      banner: r.Note ? { label: r["Note label"] || "", text: r.Note, type: r["Note type"] === "warn" ? "warn" : "tip" } : null,
      bring: lines(r.Bring),
      stops: [],
    };
    day.stops = readStops(tabs[r.Day], day, tz, problems, booked);
    days.push(day);
  }
  return { trip, days, bookings, problems };
}

// The tab names the Plan needs, once the Days tab is known.
export function dayTabs(daysText) {
  const t = table(daysText);
  return t.keys[0] === DAYS_HEAD ? t.rows.map(r => r.Day).filter(Boolean) : [];
}
