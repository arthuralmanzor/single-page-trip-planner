import { test } from "node:test";
import assert from "node:assert/strict";
import { tripClock, stopKey, delayLine } from "../js/clock.js";

const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+08:00`);
const day2 = { id: "d2", stops: [
  { code: "D2-01", at: at("2027-11-17", "10:00") },
  { code: "D2-02", at: at("2027-11-17", "18:00") },
] };
const day3 = { id: "d3", stops: [
  { code: "D3-01", at: at("2027-11-18", "09:00") },
  { code: "D3-02", at: at("2027-11-18", "11:00") },
  { code: "D3-03", at: at("2027-11-18", "13:00") },
  { code: "D3-04", at: at("2027-11-18", "15:00") },
] };
const clock = tripClock([day2, day3]);

// How each stop of the trip shows at a moment, by its code.
function shown(ms) {
  const st = clock.at(ms);
  return Object.fromEntries([day2, day3].flatMap(d => d.stops.map(s => [s.code, clock.mark(stopKey(d, s), st)])));
}

test("mid-trip, the stops already done fold to one line", () => {
  assert.deepEqual(shown(at("2027-11-18", "12:00")), {
    "D2-01": { is: "done", folds: true },
    "D2-02": { is: "done", folds: true },
    "D3-01": { is: "done", folds: true },
    "D3-02": { is: "now", folds: false },
    "D3-03": { is: "next", folds: false },
    "D3-04": { is: "", folds: false },
  });
});

test("a stop with no time never folds, so its note to fix the Sheet stays in view", () => {
  const untimed = { code: "D3-09", at: null };
  const c = tripClock([{ ...day3, stops: [...day3.stops, untimed] }]);
  assert.deepEqual(c.mark(stopKey(day3, untimed), c.at(at("2027-11-18", "14:00"))), { is: "", folds: false });
});

test("before the trip, every stop shows in full", () => {
  const all = shown(at("2027-11-16", "12:00"));
  assert.deepEqual(Object.values(all), Array(6).fill({ is: "", folds: false }));
});

test("after the trip, every stop shows in full, marked done", () => {
  const all = shown(at("2027-11-18", "17:00"));
  assert.deepEqual(Object.values(all), Array(6).fill({ is: "done", folds: false }));
});

test("a tap halfway down a stop's line is halfway to the next stop", () => {
  assert.equal(clock.momentIn(stopKey(day3, day3.stops[1]), 0.5), at("2027-11-18", "12:00"));
  assert.equal(clock.momentIn(stopKey(day3, day3.stops[1]), 0), at("2027-11-18", "11:00"));
});

test("a tap at the foot of a stop's line keeps the family at that stop", () => {
  const ms = clock.momentIn(stopKey(day3, day3.stops[1]), 1);
  assert.ok(ms < at("2027-11-18", "13:00"));
  assert.equal(clock.at(ms).cur.s.code, "D3-02");
});

// The line after a day's last stop runs overnight to the next day's first stop.
test("a tap on a day's last stop, or the trip's, is that stop's own time", () => {
  assert.equal(clock.momentIn(stopKey(day2, day2.stops[1]), 0.5), at("2027-11-17", "18:00"));
  assert.equal(clock.momentIn(stopKey(day3, day3.stops[3]), 0.5), at("2027-11-18", "15:00"));
});

test("a stop with no time has no moment to tap", () => {
  assert.equal(clock.momentIn("d3/D3-09", 0.5), null);
});

const titled = { id: "d1", stops: [
  { code: "D1-04", title: "Ferry tickets", at: at("2027-11-16", "10:10") },
  { code: "D1-05", title: "Star Ferry", at: at("2027-11-16", "10:20") },
] };
const minutes = n => n * 60000;

test("a delay says where the family is and how far behind the plan", () => {
  const c = tripClock([titled]), real = at("2027-11-16", "10:25");
  assert.equal(delayLine(minutes(10), c.at(real - minutes(10))), "Delayed at D1-04 Ferry tickets for 10 min");
  assert.equal(delayLine(minutes(75), c.at(real - minutes(10))), "Delayed at D1-04 Ferry tickets for 1 h 15 min");
  assert.equal(delayLine(-minutes(60), c.at(at("2027-11-16", "10:15"))), "Ahead at D1-04 Ferry tickets by 1 h");
});

test("a delay under a minute says nothing", () => {
  const c = tripClock([titled]);
  assert.equal(delayLine(20000, c.at(at("2027-11-16", "10:15"))), "");
});

test("a delay before or after the trip has no stop to name", () => {
  const c = tripClock([titled]);
  assert.equal(delayLine(minutes(5), c.at(at("2027-11-16", "09:00"))), "Delayed for 5 min");
});
