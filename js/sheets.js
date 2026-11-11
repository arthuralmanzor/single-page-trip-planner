// Reads tabs of a link-shared Google Sheet as CSV text. No key and no sign-in.

export function sheetId(link) {
  const m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(link || "") || /^([A-Za-z0-9_-]{20,})$/.exec((link || "").trim());
  return m ? m[1] : null;
}

async function fetchTab(id, name) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  // A Sheet that isn't shared answers with a sign-in page instead of CSV.
  if (!res.ok || /^\s*</.test(text)) throw Object.assign(new Error("not shared"), { notShared: true });
  return text;
}

// { tabName: csvText } for each name asked for.
export async function fetchTabs(id, names) {
  const texts = await Promise.all(names.map(n => fetchTab(id, n)));
  return Object.fromEntries(names.map((n, i) => [n, texts[i]]));
}
