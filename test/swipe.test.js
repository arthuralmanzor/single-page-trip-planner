import { test } from "node:test";
import assert from "node:assert/strict";
import { swipedDay } from "../js/swipe.js";

const days = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
// The day a drag opens on a 390-wide phone, from x0 to x1 and dy down.
function drag(open, x0, x1, dy = 0) {
  const day = swipedDay(days, open, { x: x0, y: 400 }, { x: x1, y: 400 + dy }, 390);
  return day === null ? null : day.id;
}

test("a finger moving left across the day's plan opens the next day", () => {
  assert.equal(drag("d2", 300, 100), "d3");
});

test("a finger moving right opens the day before", () => {
  assert.equal(drag("d2", 100, 300), "d1");
});

test("there's no day past the last one or before the first", () => {
  assert.equal(drag("d3", 300, 100), null);
  assert.equal(drag("d1", 100, 300), null);
});

// A tap moves the finger a little, and a stop's buttons and links are tapped all the time.
test("a short drag keeps the day", () => {
  assert.equal(drag("d2", 200, 160), null);
  assert.equal(drag("d2", 200, 240), null);
});

test("scrolling down the plan keeps the day, even when the finger drifts sideways", () => {
  assert.equal(drag("d2", 300, 200, -300), null);
  assert.equal(drag("d2", 100, 200, 150), null);
});

test("a swipe that slants a little still turns the day", () => {
  assert.equal(drag("d2", 300, 100, 60), "d3");
});

test("a drag from the screen's left or right edge keeps the day", () => {
  assert.equal(drag("d2", 6, 250), null);
  assert.equal(drag("d2", 384, 150), null);
});
