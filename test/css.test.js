import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The page's root font size is the browser default, 16px, so .75rem is 12px.
const MIN_PX = 12;
const ROOT_PX = 16;

test("no text in the stylesheet is under 12px", () => {
  const css = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");
  const tooSmall = [];
  for (const [, value] of css.matchAll(/font-size:\s*([^;}]+)/g)) {
    const v = value.trim();
    if (v === "inherit") continue;
    const m = v.match(/^([\d.]+)(rem|px)$/);
    // An em or % size depends on its parent, so this test can't check it.
    assert.ok(m, `font-size:${v} isn't in rem or px`);
    const px = m[2] === "rem" ? parseFloat(m[1]) * ROOT_PX : parseFloat(m[1]);
    if (px < MIN_PX) tooSmall.push(`font-size:${v} (${px}px)`);
  }
  assert.deepEqual(tooSmall, []);
});
