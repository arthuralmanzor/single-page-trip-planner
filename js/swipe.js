// How far the finger has to move sideways, and how far from the screen's edge it has to start,
// in CSS pixels. The phone's own back and forward swipes start at the edges.
const MIN = 60, EDGE = 32;

// The day a drag on the day's plan opens, or null. A finger moving left opens the next day, and
// one moving right the day before. A drag has to go twice as far across as down, or it's scrolling.
export function swipedDay(days, openId, from, to, width) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (from.x < EDGE || from.x > width - EDGE) return null;
  if (Math.abs(dx) < MIN || Math.abs(dx) < 2 * Math.abs(dy)) return null;
  const i = days.findIndex(d => d.id === openId);
  return days[dx < 0 ? i + 1 : i - 1] ?? null;
}
