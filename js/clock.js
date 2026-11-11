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

  return { at, mark };
}
