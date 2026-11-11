import { test } from "node:test";
import assert from "node:assert/strict";
import { tripClock, stopKey } from "../js/clock.js";

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
