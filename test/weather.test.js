import { test } from "node:test";
import assert from "node:assert/strict";
import { readForecast, forecastAt, forecastText, dayOutlook, outlookText, forecastDue, readWarnings, warningsAt } from "../js/weather.js";

const hk = hhmm => Date.parse(`2027-11-18T${hhmm}:00+08:00`);
const POINT = { lat: 22.3, lon: 114.17 };
// The forecast feed's answer: each hour in seconds, its temperature and its chance of rain.
const FEED = { hourly: {
  time: ["10:00", "11:00", "12:00", "13:00"].map(t => hk(t) / 1000),
  temperature_2m: [21.4, 22.6, 24.5, 23.0],
  precipitation_probability: [10, 20, 60, 40],
} };
const fc = readForecast(FEED, POINT, hk("09:00"));

test("a stop shows the forecast for the hour nearest its time", () => {
  assert.equal(forecastText(forecastAt(fc, hk("11:10"), hk("11:00"))), "23° · 20% rain");
  assert.equal(forecastText(forecastAt(fc, hk("11:40"), hk("11:00"))), "25° · 60% rain");
});

test("a stop outside the forecast's hours shows none", () => {
  assert.equal(forecastAt(fc, hk("08:30"), hk("08:00")), null);
  assert.equal(forecastAt(fc, hk("14:30"), hk("11:00")), null);
});

test("a forecast more than half a day old shows none", () => {
  assert.notEqual(forecastAt(fc, hk("11:00"), hk("09:00") + 12 * 3600e3), null);
  assert.equal(forecastAt(fc, hk("11:00"), hk("09:00") + 12 * 3600e3 + 60e3), null);
});

test("the day header shows the low, the high and the top chance of rain between the first and last stop", () => {
  assert.equal(outlookText(dayOutlook(fc, hk("10:50"), hk("12:10"), hk("11:00"))), "23° to 25° · rain up to 60%");
  assert.equal(outlookText(dayOutlook(fc, hk("09:00"), hk("23:00"), hk("11:00"))), "21° to 25° · rain up to 60%");
  assert.equal(dayOutlook(fc, hk("15:00"), hk("18:00"), hk("11:00")), null);
  assert.equal(dayOutlook(fc, hk("10:00"), hk("13:00"), hk("23:00")), null);
});

test("an hour with no chance of rain in the feed shows its temperature alone", () => {
  const dry = readForecast({ hourly: { ...FEED.hourly, precipitation_probability: [null, null, null, null] } }, POINT, hk("09:00"));
  assert.equal(forecastText(forecastAt(dry, hk("11:00"), hk("11:00"))), "23°");
  assert.equal(outlookText(dayOutlook(dry, hk("10:00"), hk("13:00"), hk("11:00"))), "21° to 25°");
});

test("the forecast refreshes at most once an hour, and at once for a new Weather at point", () => {
  assert.equal(forecastDue(null, POINT, hk("09:00")), true);
  assert.equal(forecastDue(fc, POINT, hk("09:59")), false);
  assert.equal(forecastDue(fc, POINT, hk("10:00")), true);
  assert.equal(forecastDue(fc, { lat: 14.51, lon: 121.02 }, hk("09:10")), true);
});

test("a feed answer that isn't a forecast is ignored", () => {
  assert.equal(readForecast({ error: true, reason: "Too many requests" }, POINT, hk("09:00")), null);
  assert.equal(readForecast(null, POINT, hk("09:00")), null);
});

// The Hong Kong Observatory's warning summary, with a typhoon signal and a rainstorm warning in
// force, a thunderstorm warning, and a cancelled one.
const WARNSUM = {
  WTCSGNL: { name: "Tropical Cyclone Warning Signal", code: "TC8NE", actionCode: "ISSUE" },
  WRAIN: { name: "Rainstorm Warning Signal", code: "WRAINB", actionCode: "ISSUE" },
  WTS: { name: "Thunderstorm Warning", code: "WTS", actionCode: "EXTEND" },
  WL: { name: "Landslip Warning", code: "WL", actionCode: "CANCEL" },
};

test("the warnings in force are the typhoon signal, then the rainstorm warning", () => {
  assert.deepEqual(warningsAt(readWarnings(WARNSUM, hk("09:00")), hk("09:05")), ["Typhoon signal 8", "Black rainstorm warning"]);
  assert.deepEqual(warningsAt(readWarnings({ WRAIN: { code: "WRAINA", actionCode: "ISSUE" } }, hk("09:00")), hk("09:05")), ["Amber rainstorm warning"]);
  assert.deepEqual(warningsAt(readWarnings({}, hk("09:00")), hk("09:05")), []);
});

test("a cancelled warning shows none", () => {
  const cancelled = { WTCSGNL: { code: "CANCEL", actionCode: "CANCEL" }, WRAIN: { code: "WRAINR", actionCode: "CANCEL" } };
  assert.deepEqual(warningsAt(readWarnings(cancelled, hk("09:00")), hk("09:05")), []);
});

test("warnings more than three hours old show none, since one may have ended", () => {
  const w = readWarnings(WARNSUM, hk("09:00"));
  assert.equal(warningsAt(w, hk("12:00")).length, 2);
  assert.deepEqual(warningsAt(w, hk("12:01")), []);
  assert.deepEqual(warningsAt(null, hk("12:00")), []);
});
