import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
// The files sw.js keeps on the phone, so the page opens with no signal.
const FILES = JSON.parse(/const FILES = (\[[^\]]*\])/.exec(readFileSync(new URL("sw.js", root), "utf8"))[1]);

test("every script and stylesheet of the page is kept for opening with no signal", () => {
  const own = ["js", "css"].flatMap(dir => readdirSync(new URL(`${dir}/`, root)).map(f => `${dir}/${f}`));
  assert.deepEqual(own.filter(f => !FILES.includes(f)), []);
});

// One missing file stops the service worker from installing, and then nothing is kept.
test("every file kept for opening with no signal exists", () => {
  assert.deepEqual(FILES.filter(f => f !== "./" && !existsSync(new URL(f, root))), []);
});
