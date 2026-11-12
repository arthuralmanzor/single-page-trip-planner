import { test } from "node:test";
import assert from "node:assert/strict";
import { readPlan } from "../js/plan.js";
import { shownStops, changesSince, changeLine } from "../js/changes.js";

const TRIP = `"Key","Value"
"Name","Sample city trip"
"Time zone","Asia/Hong_Kong"`;
const DATES = { "Day 2": "2027-11-17", "Day 3": "2027-11-18", "Day 4": "2027-11-19" };
const HEAD = `"Code","Time","Kind","Stop","Details","Leaves","Arrives","Route","Wait","Tip","Places","Bookings","Summary","Day start"`;
// The plan's days, from the stop rows of each day: { "Day 3": [row, ...] }.
const plan = tabs => readPlan({
  Trip: TRIP,
  Days: [`"Day","Date"`, ...Object.keys(tabs).map(d => `"${d}","${DATES[d]}"`)].join("\n"),
  ...Object.fromEntries(Object.entries(tabs).map(([d, rows]) => [d, [HEAD, ...rows].join("\n")])),
}).days;
const days = (day3, day4 = []) => plan({ "Day 3": day3, "Day 4": day4 });

const LEAVE = `"D3-01","11:15","travel","Leave the hotel","","","","","","","","","",""`;
const LUNCH = `"D3-02","12:00","food","Lunch","","","","","","","","","",""`;
const TRAM = `"D3-03","16:15","key","Peak Tram up","","","","","","","","","",""`;
const MARKET = `"D2-01","19:00","visit","Night market","","","","","","","","","",""`;
const BOAT = `"D4-01","09:00","travel","Ferry to Lantau","","","","","","","","","",""`;

test("a stop whose time moved in the Sheet is marked updated, and only that stop", () => {
  const seen = shownStops(days([LEAVE, LUNCH, TRAM]));
  const now = days([LEAVE, LUNCH, TRAM.replace("16:15", "17:00")]);
  assert.deepEqual(changesSince(seen, now), { marks: { "d3/D3-03": "updated" }, removed: [] });
});

test("a stop added to the Sheet is marked new", () => {
  const seen = shownStops(days([LEAVE, TRAM]));
  const now = days([LEAVE, TRAM, LUNCH]);
  assert.deepEqual(changesSince(seen, now), { marks: { "d3/D3-02": "new" }, removed: [] });
});

test("a stop deleted from the Sheet is listed as removed", () => {
  const seen = shownStops(days([LEAVE, LUNCH, TRAM]));
  const now = days([LEAVE, TRAM]);
  assert.deepEqual(changesSince(seen, now), { marks: {}, removed: ["d3/D3-02"] });
});

// The line for the plan `now`, after the phone last showed the plan `before`.
const line = (before, now) => changeLine(changesSince(shownStops(before), now), now);

test("the line says how many stops changed, and on which day", () => {
  assert.equal(line(days([LEAVE, TRAM]), days([LEAVE.replace("Leave", "Go"), TRAM])), "1 stop changed, on Day 3.");
});

test("stops changed on more than one day are counted together", () => {
  const before = days([LEAVE, LUNCH], [BOAT]);
  const now = days([LEAVE, LUNCH.replace("12:00", "12:30"), TRAM], [BOAT.replace("09:00", "09:30")]);
  assert.equal(line(before, now), "3 stops changed, on Day 3 and Day 4.");
});

test("the line says when a stop was removed, since it has no mark of its own", () => {
  assert.equal(line(days([LEAVE, LUNCH, TRAM]), days([LEAVE, TRAM])), "1 stop was removed, on Day 3.");
});

test("changed and removed stops share the line", () => {
  const before = days([LEAVE, LUNCH], [BOAT]);
  const now = days([LEAVE, TRAM], [BOAT.replace("Ferry", "Boat")]);
  assert.equal(line(before, now), "2 stops changed and 1 was removed, on Day 3 and Day 4.");
});

test("the line names every day with a change, in trip order", () => {
  const before = plan({ "Day 2": [MARKET], "Day 3": [LEAVE], "Day 4": [BOAT] });
  const now = plan({ "Day 2": [MARKET.replace("19:00", "20:00")], "Day 3": [LEAVE.replace("11:15", "11:30")], "Day 4": [BOAT.replace("09:00", "09:30")] });
  assert.equal(line(before, now), "3 stops changed, on Day 2, Day 3 and Day 4.");
});

test("stops of a day taken out of the plan are removed, and the line still names the day", () => {
  const before = plan({ "Day 2": [MARKET], "Day 3": [LEAVE] });
  assert.equal(line(before, plan({ "Day 3": [LEAVE] })), "1 stop was removed, on Day 2.");
});

test("a change in any column of a stop marks it updated", () => {
  const cols = HEAD.replace(/"/g, "").split(",");
  const before = `"D3-01","11:15","travel","Leave","","","","","","","","","",""`;
  const edits = { Time: "11:20", Kind: "food", Stop: "Go", Details: "x", Leaves: "11:15", Arrives: "≈11:40",
    Route: "Bus: Hotel → Pier", Wait: "x", Tip: "x", Places: "Pier", Bookings: "BK-01", Summary: "x", "Day start": "yes" };
  for (const [col, value] of Object.entries(edits)) {
    const cells = before.slice(1, -1).split('","');
    cells[cols.indexOf(col)] = value;
    const now = days([`"${cells.join('","')}"`]);
    assert.deepEqual(changesSince(shownStops(days([before])), now).marks, { "d3/D3-01": "updated" }, col);
  }
});
