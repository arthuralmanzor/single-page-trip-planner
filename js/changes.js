import { stopKey } from "./clock.js";

// What the page shows of a stop, as one string. The fields are listed one by one, so a field
// added to the stop later doesn't mark every stop "Updated" on the next load. A place's local
// address joins it only when there is one, for the same reason.
const shown = s => JSON.stringify([
  s.time, s.kind, s.title, s.details, s.leaves, s.arrives,
  s.legs.map(l => [l.name, l.from, l.to, l.notes]),
  s.wait, s.tip, s.places.map(p => p.localAddress ? [p.label, p.search, p.localAddress] : [p.label, p.search]),
  s.bookings, s.summary, s.dayStart,
]);

// Each stop of the plan as the page shows it, by its key, like "d3/D3-05".
export function shownStops(days) {
  const out = {};
  for (const d of days) for (const s of d.stops) out[stopKey(d, s)] = shown(s);
  return out;
}

// Which stops differ from `seen`, the stops as this phone last showed them.
export function changesSince(seen, days) {
  const now = shownStops(days), marks = {};
  for (const [k, v] of Object.entries(now)) {
    if (!(k in seen)) marks[k] = "new";
    else if (seen[k] !== v) marks[k] = "updated";
  }
  return { marks, removed: Object.keys(seen).filter(k => !(k in now)) };
}

// One line on what changed, like "2 stops changed, on Day 3 and Day 4.", or "" for nothing.
export function changeLine({ marks, removed }, days) {
  const changed = Object.keys(marks), keys = [...changed, ...removed];
  if (!keys.length) return "";
  // A key starts with its day's id, like "d3". A day taken out of the plan has no name left.
  const ids = [...new Set(keys.map(k => k.split("/")[0]))].sort((a, b) => a.slice(1) - b.slice(1));
  const names = ids.map(id => (days.find(d => d.id === id) || { name: `Day ${id.slice(1)}` }).name);
  const stops = n => `${n} ${n === 1 ? "stop" : "stops"}`;
  const gone = n => `${n === 1 ? "was" : "were"} removed`;
  const what = !changed.length ? `${stops(removed.length)} ${gone(removed.length)}`
    : `${stops(changed.length)} changed${removed.length ? ` and ${removed.length} ${gone(removed.length)}` : ""}`;
  const last = names.pop();
  return `${what}, on ${names.length ? `${names.join(", ")} and ${last}` : last}.`;
}
