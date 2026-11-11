import { test } from "node:test";
import assert from "node:assert/strict";
import { readPlan } from "../js/plan.js";

const TRIP = `"Key","Value"
"Name","Sample city trip"
"First day","2027-11-16"
"Last day","2027-11-21"
"Time zone","Asia/Hong_Kong"
"Travelers","7"
"Hotel","Harbour Hotel"`;

const DAYS = `"Day","Date","Tag","Title","Note label","Note","Note type","Bring"
"Day 3","2027-11-18","Peak","Causeway Bay, then the Peak at night","TIMING","Slow morning.","tip","Peak Tram tickets for 5
Jackets"`;

const HEAD = `"Code","Time","Kind","Stop","Details","Leaves","Arrives","Route","Wait","Tip","Places","Bookings","Summary","Day start"`;
const day3 = (...rows) => ({ Trip: TRIP, Days: DAYS, "Day 3": [HEAD, ...rows].join("\n") });

test("a stop row becomes a stop on its day", () => {
  const plan = readPlan(day3(`"D3-02","11:45","food","Lunch · Jollibee Causeway Bay","Rice meals, ""extra"" gravy.","","","","","","","","Lunch at Jollibee",""`));
  assert.equal(plan.trip.name, "Sample city trip");
  assert.equal(plan.days.length, 1);
  const d = plan.days[0];
  assert.equal(d.title, "Causeway Bay, then the Peak at night");
  assert.equal(d.dow, "Thu");
  assert.deepEqual(d.bring, ["Peak Tram tickets for 5", "Jackets"]);
  assert.deepEqual(d.banner, { label: "TIMING", text: "Slow morning.", type: "tip" });
  const s = d.stops[0];
  assert.equal(s.code, "D3-02");
  assert.equal(s.title, "Lunch · Jollibee Causeway Bay");
  assert.equal(s.details, 'Rice meals, "extra" gravy.');
  assert.equal(s.at, Date.parse("2027-11-18T11:45:00+08:00"));
  assert.equal(s.summary, "Lunch at Jollibee");
  assert.deepEqual(plan.problems, []);
});

test("a route cell becomes one leg per line, with its line, ends and directions", () => {
  const plan = readPlan(day3(`"D3-01","11:15","travel","Leave the hotel","","11:15","≈11:43","Tsuen Wan Line: Prince Edward → Admiralty (Platform 2 · towards Central)
Bus: Airport (Ground Transportation Centre) → Harbour Hotel (towards Hung Hom · 6th stop)
Star Ferry: Central Pier 7 → Tsim Sha Tsui","Trains every 2 min.","Sit at the front.","Jollibee Causeway Bay | Jollibee, 56-58 Yee Wo St, Causeway Bay
Times Square","BK-05, BK-06","","yes"`));
  const s = plan.days[0].stops[0];
  assert.deepEqual(s.legs, [
    { line: "tsw", name: "Tsuen Wan Line", from: "Prince Edward", to: "Admiralty", notes: ["Platform 2", "towards Central"] },
    { line: "bus", name: "Bus", from: "Airport (Ground Transportation Centre)", to: "Harbour Hotel", notes: ["towards Hung Hom", "6th stop"] },
    { line: "ferry", name: "Star Ferry", from: "Central Pier 7", to: "Tsim Sha Tsui", notes: [] },
  ]);
  assert.deepEqual(s.places, [
    { label: "Jollibee Causeway Bay", search: "Jollibee, 56-58 Yee Wo St, Causeway Bay" },
    { label: "Times Square", search: "Times Square" },
  ]);
  assert.deepEqual(s.bookings, ["BK-05", "BK-06"]);
  assert.equal(s.leaves, "11:15");
  assert.equal(s.arrives, "≈11:43");
  assert.equal(s.wait, "Trains every 2 min.");
  assert.equal(s.tip, "Sit at the front.");
  assert.equal(s.dayStart, true);
  assert.deepEqual(plan.problems, []);
});

test("times are read however the Sheet shows them", () => {
  const plan = readPlan(day3(
    `"D3-01","Nov 17 23:30","travel","Night before","","","","","","","","","",""`,
    `"D3-02","4:30 PM","visit","Afternoon","","","","","","","","","",""`,
    `"D3-03","16:45:00","visit","Seconds","","","","","","","","","",""`,
    `"D3-04","≈9:05","visit","About nine","","","","","","","","","",""`,
    `"D3-05","9:10am","visit","Lowercase","","","","","","","","","",""`,
  ));
  const at = Object.fromEntries(plan.days[0].stops.map(s => [s.code, s.at]));
  assert.equal(at["D3-01"], Date.parse("2027-11-17T23:30:00+08:00"));
  assert.equal(at["D3-02"], Date.parse("2027-11-18T16:30:00+08:00"));
  assert.equal(at["D3-03"], Date.parse("2027-11-18T16:45:00+08:00"));
  assert.equal(at["D3-04"], Date.parse("2027-11-18T09:05:00+08:00"));
  assert.equal(at["D3-05"], Date.parse("2027-11-18T09:10:00+08:00"));
  const shown = Object.fromEntries(plan.days[0].stops.map(s => [s.code, s.time]));
  assert.equal(shown["D3-02"], "16:30");
  assert.equal(shown["D3-03"], "16:45");
  assert.equal(shown["D3-01"], "Nov 17 23:30");
  assert.deepEqual(plan.problems, []);
});

test("stops are listed by time, whatever their row or code", () => {
  const plan = readPlan(day3(
    `"D3-01","11:15","travel","Leave","","","","","","","","","",""`,
    `"D3-02","16:15","visit","Shopping","","","","","","","","","",""`,
    `"D3-12","14:00","food","Coffee","","","","","","","","","",""`,
  ));
  assert.deepEqual(plan.days[0].stops.map(s => s.code), ["D3-01", "D3-12", "D3-02"]);
});

test("a broken row is flagged and the rest of the plan still loads", () => {
  const plan = readPlan(day3(
    `"D3-01","11:15","travel","Leave","","","","","","","","","",""`,
    `"D3-02","","visit","No time","","","","","","","","","",""`,
    `"D3-02","12:00","visit","Same code","","","","","","","","","",""`,
    `"D4-01","13:00","visit","Wrong day","","","","","","","","","",""`,
    `"","14:00","visit","No code","","","","","","","","","",""`,
    `"D3-05","15:00","visit","","","","","","","","","","",""`,
    `"D3-06","16:00","picnic","Odd kind","","","","","","","","","",""`,
  ));
  const stops = plan.days[0].stops;
  assert.equal(stops.length, 7);
  assert.deepEqual(stops.map(s => s.title), ["Leave", "No time", "Same code", "Wrong day", "No code", "", "Odd kind"]);
  const said = stops.map(s => s.problems.join(" "));
  assert.equal(said[0], "");
  assert.match(said[1], /time/i);
  assert.match(said[2], /D3-02.*twice/i);
  assert.match(said[3], /D4-01.*Day 3/i);
  assert.match(said[4], /code/i);
  assert.match(said[5], /name/i);
  assert.match(said[6], /picnic/i);
  assert.equal(stops[6].kind, "visit");
  assert.equal(plan.problems.length, 6);
  assert.ok(plan.problems.every(p => p.where.startsWith("Day 3")));
});

test("a missing or wrong tab is a problem, not a crash", () => {
  const gone = readPlan({ Trip: TRIP, Days: DAYS });
  assert.equal(gone.days[0].stops.length, 0);
  assert.match(gone.problems[0].text, /Day 3/);
  // Google answers with the first tab when it can't find the one asked for.
  const wrong = readPlan({ Trip: TRIP, Days: DAYS, "Day 3": TRIP });
  assert.equal(wrong.days[0].stops.length, 0);
  assert.match(wrong.problems[0].text, /Day 3/);
  const noDays = readPlan({ Trip: TRIP, Days: TRIP });
  assert.equal(noDays.days.length, 0);
  assert.match(noDays.problems[0].text, /Days/);
});

test("a day with a bad date is flagged and skipped", () => {
  const plan = readPlan({
    Trip: TRIP,
    Days: DAYS + `\n"Day 4","Nov 19","Disney","Disneyland","","","",""`,
    "Day 3": HEAD, "Day 4": HEAD,
  });
  assert.deepEqual(plan.days.map(d => d.name), ["Day 3"]);
  assert.match(plan.problems[0].text, /Day 4.*date/i);
});

test("the trip lists the other Sheets it links to", () => {
  const plan = readPlan({ ...day3(), Trip: TRIP + `\n"Checklists sheet","https://docs.google.com/spreadsheets/d/abc123/edit"\n"Pharmacy and info sheet",""` });
  assert.deepEqual(plan.trip.sheets, { checklists: "https://docs.google.com/spreadsheets/d/abc123/edit" });
});

test("the Bookings tab lists what is booked, with links to its ticket images", () => {
  const plan = readPlan({ ...day3(), Bookings: `"Code","Date","Type","Title","Time","Details","Bring","Status","Tickets"
"BK-03","2027-11-16","Hotel","Harbour Hotel · Nov 16–21","Check-in after 3:00pm","1 Harbour Road.","Passport","confirmed","Hotel booking | https://drive.google.com/file/d/abc/view
https://drive.google.com/file/d/def/view"
"BK-99","","Tour","Not dated yet","","","","",""` });
  assert.deepEqual(plan.bookings[0], {
    code: "BK-03", date: "2027-11-16", type: "Hotel", title: "Harbour Hotel · Nov 16–21",
    time: "Check-in after 3:00pm", details: "1 Harbour Road.", bring: "Passport", status: "confirmed",
    tickets: [
      { label: "Hotel booking", url: "https://drive.google.com/file/d/abc/view" },
      { label: "Ticket 2", url: "https://drive.google.com/file/d/def/view" },
    ],
  });
  assert.equal(plan.bookings[1].code, "BK-99");
  assert.deepEqual(plan.problems, []);
});

test("a plan with no Bookings tab has no bookings", () => {
  assert.deepEqual(readPlan(day3()).bookings, []);
  assert.deepEqual(readPlan({ ...day3(), Bookings: TRIP }).bookings, []);
});
