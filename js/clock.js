// A stop's key across the whole trip, like "d3/D3-05". The page marks each stop's row with it.
export const stopKey = (d, s) => d.id + "/" + s.code;

// The trip clock: where the family should be at a moment, and how each stop shows then.
// A stop with no time is left off the clock.
export function tripClock(days) {
  const stops = [];
  days.forEach(d => d.stops.forEach(s => { if (s.at != null) stops.push({ d, s, t: s.at }); }));
  stops.sort((a, b) => a.t - b.t);
  const order = {};
  stops.forEach(({ d, s }, i) => { order[stopKey(d, s)] = i; });
  // The trip ends two hours after its last stop.
  const end = stops.length ? stops[stops.length - 1].t + 2 * 3600e3 : 0;

  function at(ms) {
    if (!stops.length) return { phase: "empty", ms };
    if (ms < stops[0].t) return { phase: "before", next: stops[0], ms };
    if (ms >= end) return { phase: "after", ms };
    let i = 0;
    for (let k = 0; k < stops.length; k++) { if (stops[k].t <= ms) i = k; else break; }
    const cur = stops[i], next = stops[i + 1] || null;
    const p = next ? Math.min(1, Math.max(0, (ms - cur.t) / (next.t - cur.t))) : 1;
    return { phase: "during", cur, next, idx: i, p, ms };
  }

  // How the stop with this key shows at that moment.
  // It is "done", "now", "next" or "", and a done stop folds to one line.
  // After the trip every stop is done, and none folds, so the whole plan shows.
  function mark(key, st) {
    const i = order[key];
    if (st.phase === "after") return { is: "done", folds: false };
    if (st.phase !== "during" || i == null) return { is: "", folds: false };
    if (i < st.idx) return { is: "done", folds: true };
    return { is: i === st.idx ? "now" : i === st.idx + 1 ? "next" : "", folds: false };
  }

  // The moment p of the way from the stop with this key to the stop after it, as the day's plan
  // draws the line between them. After a day's last stop the line runs overnight, so there p
  // doesn't move it. It stays short of the next stop, which is "now" from its own time.
  function momentIn(key, p) {
    const i = order[key];
    if (i == null) return null;
    const cur = stops[i], next = stops[i + 1];
    if (!next || next.d !== cur.d) return cur.t;
    return Math.min(cur.t + p * (next.t - cur.t), Math.max(cur.t, next.t - 1000));
  }

  return { at, mark, momentIn };
}

// What the page says about a Delay of this many ms (less than 0 when ahead of the plan), with
// where the family is by it. Under a minute says nothing.
export function delayLine(behind, st) {
  const m = Math.round(Math.abs(behind) / 60000);
  if (!m) return "";
  const span = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const stop = st.phase === "during" ? [st.cur.s.code, st.cur.s.title].filter(Boolean).join(" ") : "";
  const at = stop ? ` at ${stop}` : "";
  return behind > 0 ? `Delayed${at} for ${span}` : `Ahead${at} by ${span}`;
}
