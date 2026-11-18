import { test } from "node:test";
import assert from "node:assert/strict";
import { readForecast, refreshForecasts, forecastForPoint, forecastAt, forecastText, dayForecast, dayForecastText, readWarnings, warningsAt, asOf, hasWarnings, forecastIcon, readObservatoryForecast, observatoryDay, observatoryLines } from "../js/weather.js";

const hk = hhmm => Date.parse(`2027-11-18T${hhmm}:00+08:00`);
const POINT = { lat: 22.3, lon: 114.17 };
// The forecast feed's answer: each hour in seconds, its temperature, its chance of rain, its
// weather as a WMO code (0 clear, 2 partly cloudy, 3 overcast, 61 rain) and whether it's daytime.
const FEED = { hourly: {
  time: ["10:00", "11:00", "12:00", "13:00"].map(t => hk(t) / 1000),
  temperature_2m: [21.4, 22.6, 24.5, 23.0],
  precipitation_probability: [10, 20, 60, 40],
  weather_code: [0, 2, 61, 3],
  is_day: [1, 1, 1, 1],
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
  assert.equal(dayForecastText(dayForecast(fc, hk("10:50"), hk("12:10"), hk("11:00"))), "23° to 25° · rain up to 60%");
  assert.equal(dayForecastText(dayForecast(fc, hk("09:00"), hk("23:00"), hk("11:00"))), "21° to 25° · rain up to 60%");
  assert.equal(dayForecast(fc, hk("15:00"), hk("18:00"), hk("11:00")), null);
  assert.equal(dayForecast(fc, hk("10:00"), hk("13:00"), hk("23:00")), null);
});

test("an hour with no chance of rain in the feed shows its temperature alone", () => {
  const dry = readForecast({ hourly: { ...FEED.hourly, precipitation_probability: [null, null, null, null] } }, POINT, hk("09:00"));
  assert.equal(forecastText(forecastAt(dry, hk("11:00"), hk("11:00"))), "23°");
  assert.equal(dayForecastText(dayForecast(dry, hk("10:00"), hk("13:00"), hk("11:00"))), "21° to 25°");
});

const TOKYO = { lat: 35.68, lon: 139.76 }, KYOTO = { lat: 35.01, lon: 135.77 };
// A stand-in for the feed, with Tokyo at 12° and Kyoto at 9°. It lists the points it's asked for.
function feed() {
  const asked = [];
  const get = async url => {
    const point = [TOKYO, KYOTO].find(p => url.includes(`latitude=${p.lat}&longitude=${p.lon}&`));
    asked.push(point);
    return { hourly: { ...FEED.hourly, temperature_2m: FEED.hourly.time.map(() => point === TOKYO ? 12 : 9) } };
  };
  return { get, asked };
}

test("each day's stops show the forecast at the day's point, fetched once for each point", async () => {
  const { get, asked } = feed();
  const days = [{ weatherAt: TOKYO }, { weatherAt: KYOTO }, { weatherAt: { ...KYOTO } }, { weatherAt: null }];
  const list = await refreshForecasts([], days, hk("09:00"), get);
  assert.deepEqual(asked, [TOKYO, KYOTO]);
  assert.equal(forecastText(forecastAt(forecastForPoint(list, TOKYO), hk("11:00"), hk("11:00"))), "12° · 20% rain");
  assert.equal(forecastText(forecastAt(forecastForPoint(list, KYOTO), hk("11:00"), hk("11:00"))), "9° · 20% rain");
  assert.equal(forecastForPoint(list, null), null);
});

test("a stop with its own point gets that point's forecast fetched too", async () => {
  const { get, asked } = feed();
  await refreshForecasts([], [{ weatherAt: TOKYO, stops: [{ weatherAt: KYOTO }, { weatherAt: TOKYO }] }], hk("09:00"), get);
  assert.deepEqual(asked, [TOKYO, KYOTO]);
});

test("a point's forecast is fetched again only once it's an hour old", async () => {
  const days = [{ weatherAt: TOKYO }, { weatherAt: KYOTO }];
  const kyoto = await refreshForecasts([], [{ weatherAt: KYOTO }], hk("09:00"), feed().get);
  // At 9:59 Tokyo has none yet, and Kyoto's from 9:00 stays as it is.
  const soon = feed(), list = await refreshForecasts(kyoto, days, hk("09:59"), soon.get);
  assert.deepEqual(soon.asked, [TOKYO]);
  assert.equal(forecastForPoint(list, KYOTO), forecastForPoint(kyoto, KYOTO));
  // At 10:00 Kyoto's is an hour old, and Tokyo's is a minute old.
  const later = feed();
  await refreshForecasts(list, days, hk("10:00"), later.get);
  assert.deepEqual(later.asked, [KYOTO]);
});

test("a point whose forecast can't be fetched keeps its last one, and the other points still refresh", async () => {
  const days = [{ weatherAt: TOKYO }, { weatherAt: KYOTO }];
  const old = await refreshForecasts([], days, hk("09:00"), feed().get);
  const { get } = feed();
  const noKyoto = async url => { if (url.includes(`latitude=${KYOTO.lat}&`)) throw new Error("offline"); return get(url); };
  const busy = async url => url.includes(`latitude=${KYOTO.lat}&`) ? { error: true, reason: "Too many requests" } : get(url);
  for (const fetchFeed of [noKyoto, busy]) {
    const list = await refreshForecasts(old, days, hk("10:30"), fetchFeed);
    assert.equal(forecastForPoint(list, KYOTO), forecastForPoint(old, KYOTO));
    assert.equal(forecastForPoint(list, TOKYO).fetchedAt, hk("10:30"));
  }
});

test("a point no day uses any more is dropped, and with none there's no forecast", async () => {
  const old = await refreshForecasts([], [{ weatherAt: TOKYO }, { weatherAt: KYOTO }], hk("09:00"), feed().get);
  const list = await refreshForecasts(old, [{ weatherAt: TOKYO }], hk("09:30"), feed().get);
  assert.deepEqual(list.map(fc => fc.point), [TOKYO]);
  assert.deepEqual(await refreshForecasts(old, [{ weatherAt: null }], hk("09:30"), feed().get), []);
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

// With no reception a warning stays up with the time it was checked, like the forecast does, so a
// typhoon signal never vanishes as if it had been lowered.
test("warnings keep showing for up to half a day with no reception", () => {
  const w = readWarnings(WARNSUM, hk("09:00"));
  assert.equal(warningsAt(w, hk("21:00")).length, 2);
  assert.deepEqual(warningsAt(w, hk("21:01")), []);
  assert.deepEqual(warningsAt(null, hk("12:00")), []);
});

test("a forecast that couldn't refresh on time says when it's from", () => {
  assert.equal(asOf(fc, hk("10:30")), null);
  assert.equal(asOf(fc, hk("10:31")), hk("09:00"));
});

test("warnings show only on a Hong Kong trip that has a Weather at point, on the Trip tab or a day", () => {
  const hkTrip = { timeZone: "Asia/Hong_Kong" };
  assert.equal(hasWarnings(hkTrip, [{ weatherAt: null }, { weatherAt: POINT }]), true);
  assert.equal(hasWarnings(hkTrip, [{ weatherAt: null }]), false);
  assert.equal(hasWarnings({ timeZone: "Asia/Manila" }, [{ weatherAt: { lat: 14.51, lon: 121.02 } }]), false);
});

test("each hour's icon shows its weather, by day and by night", () => {
  assert.equal(forecastIcon(forecastAt(fc, hk("10:00"), hk("10:00"))), "sun");
  assert.equal(forecastIcon(forecastAt(fc, hk("11:00"), hk("10:00"))), "sun-cloud");
  assert.equal(forecastIcon(forecastAt(fc, hk("12:00"), hk("10:00"))), "rain");
  assert.equal(forecastIcon(forecastAt(fc, hk("13:00"), hk("10:00"))), "cloud");
  const at = (code, more) => forecastIcon({ temp: 22, rain: 10, code, day: true, ...more });
  assert.equal(at(0, { day: false }), "moon");
  assert.equal(at(2, { day: false }), "cloud");
  assert.equal(at(45), "fog");
  assert.equal(at(95), "storm");
  assert.equal(at(null), null);
});

test("a likely shower shows rain, and rain or a storm shows before heat or cold", () => {
  assert.equal(forecastIcon({ temp: 22, rain: 50, code: 3, day: true }), "rain");
  assert.equal(forecastIcon({ temp: 22, rain: 49, code: 3, day: true }), "cloud");
  assert.equal(forecastIcon({ temp: 34, rain: 60, code: 0, day: true }), "rain");
  assert.equal(forecastIcon({ temp: 11, rain: 10, code: 95, day: true }), "storm");
});

test("33° and up shows very hot, and 12° and down shows cold", () => {
  assert.equal(forecastIcon({ temp: 33, rain: 0, code: 0, day: true }), "hot");
  assert.equal(forecastIcon({ temp: 32.4, rain: 0, code: 0, day: true }), "sun");
  assert.equal(forecastIcon({ temp: 12, rain: 0, code: 3, day: false }), "cold");
  assert.equal(forecastIcon({ temp: 12.6, rain: 0, code: 3, day: false }), "cloud");
});

// The Observatory's 9-day forecast. Each entry carries more than the page reads.
const fnd = (...days) => ({ generalSituation: "A cold front will cross the coast.", weatherForecast: days.map(([date, low, high, psr, words]) => ({
  forecastDate: date.replace(/-/g, ""), week: "Thursday", forecastWind: "North force 4.", forecastWeather: words,
  forecastMaxtemp: { value: high, unit: "C" }, forecastMintemp: { value: low, unit: "C" }, ForecastIcon: 54, PSR: psr,
})) });
const HK_TRIP = { timeZone: "Asia/Hong_Kong", weatherAt: POINT };
const hkDay = date => ({ date, weatherAt: HK_TRIP.weatherAt });

test("a Hong Kong day's header shows the Observatory's low, high, chance of significant rain and words", () => {
  const ofc = readObservatoryForecast(fnd(["2027-11-18", 21, 27, "Low", "Mainly cloudy. One or two rain patches later."], ["2027-11-19", 18, 22, "Medium High", "Cooler."]), hk("09:00"));
  assert.deepEqual(observatoryLines(observatoryDay(ofc, HK_TRIP, hkDay("2027-11-18"), hk("09:05"))), ["21° to 27° · low chance of significant rain", "Mainly cloudy. One or two rain patches later."]);
  assert.deepEqual(observatoryLines(observatoryDay(ofc, HK_TRIP, hkDay("2027-11-19"), hk("09:05"))), ["18° to 22° · medium-high chance of significant rain", "Cooler."]);
  assert.equal(observatoryDay(ofc, HK_TRIP, hkDay("2027-11-30"), hk("09:05")), null);
  assert.deepEqual(observatoryLines({ low: 21, high: 27, rain: null, weather: "" }), ["21° to 27°", ""]);
});

test("the Observatory forecast covers only a Hong Kong trip's days at the trip's point", () => {
  const ofc = readObservatoryForecast(fnd(["2027-11-18", 21, 27, "Low", "Fine."]), hk("09:00"));
  // A day with a point of its own is spent in another city, here Macau.
  assert.equal(observatoryDay(ofc, HK_TRIP, { date: "2027-11-18", weatherAt: { lat: 22.2, lon: 113.55 } }, hk("09:05")), null);
  assert.notEqual(observatoryDay(ofc, HK_TRIP, { date: "2027-11-18", weatherAt: { ...POINT } }, hk("09:05")), null);
  assert.equal(observatoryDay(ofc, { timeZone: "Asia/Tokyo", weatherAt: POINT }, hkDay("2027-11-18"), hk("09:05")), null);
  assert.equal(observatoryDay(ofc, { timeZone: "Asia/Hong_Kong", weatherAt: null }, { date: "2027-11-18", weatherAt: null }, hk("09:05")), null);
});

test("today's Observatory forecast stays once the afternoon's answer starts at tomorrow", () => {
  const dayEarlier = 24 * 3600e3;
  const morning17 = readObservatoryForecast(fnd(["2027-11-17", 19, 24, "Low", "Sunny."], ["2027-11-18", 21, 27, "Low", "Cloudy."]), hk("09:00") - dayEarlier);
  const afternoon17 = readObservatoryForecast(fnd(["2027-11-18", 21, 26, "Low", "Mainly cloudy."], ["2027-11-19", 18, 22, "Low", "Cooler."]), hk("16:30") - dayEarlier, morning17);
  const afternoon18 = readObservatoryForecast(fnd(["2027-11-19", 17, 21, "Medium", "Cooler with rain."]), hk("16:30"), afternoon17);
  assert.deepEqual(Object.keys(afternoon17.days).sort(), ["2027-11-17", "2027-11-18", "2027-11-19"]);
  assert.deepEqual(Object.keys(afternoon18.days).sort(), ["2027-11-18", "2027-11-19"]);
  assert.equal(observatoryDay(afternoon18, HK_TRIP, hkDay("2027-11-18"), hk("16:35")).high, 26);
  assert.equal(observatoryDay(afternoon18, HK_TRIP, hkDay("2027-11-19"), hk("16:35")).rain, "Medium");
});

test("an Observatory answer that isn't a forecast is ignored, and one more than half a day old shows none", () => {
  assert.equal(readObservatoryForecast({ error: "busy" }, hk("09:00")), null);
  assert.equal(readObservatoryForecast(null, hk("09:00")), null);
  assert.equal(readObservatoryForecast({ weatherForecast: [{ forecastDate: "20271118" }] }, hk("09:00")), null);
  const ofc = readObservatoryForecast(fnd(["2027-11-18", 21, 27, "Low", "Fine."]), hk("09:00"));
  assert.notEqual(observatoryDay(ofc, HK_TRIP, hkDay("2027-11-18"), hk("21:00")), null);
  assert.equal(observatoryDay(ofc, HK_TRIP, hkDay("2027-11-18"), hk("21:01")), null);
  assert.equal(observatoryDay(null, HK_TRIP, hkDay("2027-11-18"), hk("09:00")), null);
});
