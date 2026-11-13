import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

// Compares with the commit this branch started from on main. The comment above SHELL in sw.js
// says why a changed file needs a new SHELL.
test("a change to a file kept for opening with no signal bumps SHELL", t => {
  const git = (...args) => execFileSync("git", args, { cwd: fileURLToPath(root), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const shell = text => /const SHELL = "([^"]+)"/.exec(text)[1];
  let base;
  try { base = git("merge-base", "origin/main", "HEAD"); }
  catch (e) {
    // CI fetches main, so a missing main there means the check isn't running.
    if (process.env.CI) throw e;
    return t.skip("no origin/main to compare with");
  }
  const changed = [...git("diff", "--name-only", base).split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")];
  const kept = changed.filter(f => FILES.includes(f));
  if (!kept.length) return;
  assert.notEqual(shell(readFileSync(new URL("sw.js", root), "utf8")), shell(git("show", `${base}:sw.js`)),
    `${kept.join(", ")} changed, so SHELL in sw.js needs a new version`);
});
