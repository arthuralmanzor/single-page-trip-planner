// Rows of cells from CSV text. Handles quoted cells with commas, quotes and line breaks.
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Rows as objects keyed by the header row. Blank rows are dropped.
export function table(text) {
  const [head = [], ...rest] = parseCSV(text);
  const keys = head.map(h => h.trim());
  return {
    keys,
    rows: rest
      .filter(r => r.some(c => c.trim() !== ""))
      .map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()]))),
  };
}
