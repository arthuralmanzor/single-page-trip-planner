import { table } from "./csv.js";

const yes = v => /^(yes|y|true|x|done)$/i.test(v || "");

function grouped(rows, key, make) {
  const groups = [];
  for (const r of rows) {
    let g = groups.find(x => x.title === r[key]);
    if (!g) groups.push(g = make(r[key]));
    g.items.push(r);
  }
  return groups;
}

// The lists of the Checklists Sheet, from its "Checklists" tab.
export function readChecklists(text) {
  const t = table(text);
  if (t.keys[0] !== "Id") return [];
  return grouped(t.rows, "List", title => ({ title, items: [] })).map(g => ({
    title: g.title,
    items: g.items.map(r => ({ id: r.Id, text: r.Item || "", note: r.Note || "", done: yes(r.Done) })),
  }));
}

// The pharmacy kit, from the "Pharmacy" and "Pharmacy notes" tabs.
export function readPharmacy(kitText, notesText) {
  const t = table(kitText);
  if (t.keys[0] !== "Id") return null;
  const notes = table(notesText);
  const said = notes.keys[0] === "Where" ? notes.rows : [];
  const one = where => (said.find(r => r.Where.toLowerCase() === where) || {}).Text || "";
  return {
    intro: one("intro"),
    also: one("also"),
    notes: said.filter(r => r.Where.toLowerCase() === "good to know").map(r => r.Text),
    groups: grouped(t.rows, "Group", title => ({ title, items: [] })).map(g => ({
      title: g.title,
      note: (said.find(r => r.Where === g.title) || {}).Text || "",
      items: g.items.map(r => ({
        id: r.Id, name: r.Name || "", qty: r.Qty || "", for: r.For || "", who: r.Who || "",
        how: r.How || "", careful: r.Careful || "", pack: r.Pack || "",
      })),
    })),
  };
}

// The info sections, from the "Info" and "Tables" tabs. A table's first row is its headings.
export function readInfo(infoText, tablesText) {
  const sections = [];
  const section = title => {
    let s = sections.find(x => x.title === title);
    if (!s) sections.push(s = { title, rows: [], table: null });
    return s;
  };
  const info = table(infoText);
  if (info.keys[0] === "Section")
    for (const r of info.rows)
      section(r.Section).rows.push({ label: r.Label || "", text: r.Text || "", big: (r.Style || "").toLowerCase() === "big" });
  const tables = table(tablesText);
  if (tables.keys[0] === "Table")
    for (const r of tables.rows) {
      const s = section(r.Table);
      const cells = tables.keys.slice(1).map(k => r[k] || "");
      if (!s.table) {
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        s.table = { head: cells, rows: [] };
      } else s.table.rows.push(cells.slice(0, s.table.head.length));
    }
  return sections;
}
