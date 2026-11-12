import { test } from "node:test";
import assert from "node:assert/strict";
import { familyLink, sheetFromFamilyLink } from "../js/sheets.js";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

test("a family link is the page's address with the Plan Sheet's id", () => {
  assert.equal(
    familyLink("https://family.github.io/trip/#checklists", `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`),
    `https://family.github.io/trip/#plan=${ID}`,
  );
});

test("a family link opens to the Plan Sheet's link", () => {
  assert.equal(
    sheetFromFamilyLink(`https://family.github.io/trip/#plan=${ID}`),
    `https://docs.google.com/spreadsheets/d/${ID}/edit`,
  );
});

test("the page's own addresses aren't family links", () => {
  for (const hash of ["", "#itinerary", "#plan=", "#plan=short", `#plan=${ID}%22%3E`]) {
    assert.equal(sheetFromFamilyLink(`https://family.github.io/trip/${hash}`), null, hash);
  }
});

test("text that isn't a link isn't a family link", () => {
  assert.equal(sheetFromFamilyLink("our trip plan"), null);
});
