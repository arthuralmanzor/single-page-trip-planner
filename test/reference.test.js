import { test } from "node:test";
import assert from "node:assert/strict";
import { readChecklists, readPharmacy, readInfo } from "../js/reference.js";

test("checklist rows are grouped into their lists, in Sheet order", () => {
  const lists = readChecklists(`"Id","List","Item","Note","Done"
"n-heads","Still to get or confirm","Headcount and ages","Done: 4 travelers.","yes"
"b-naia","Before you leave","Check in online","",""
"n-tix","Still to get or confirm","Peak Tram receipt","",""`);
  assert.deepEqual(lists, [
    { title: "Still to get or confirm", items: [
      { id: "n-heads", text: "Headcount and ages", note: "Done: 4 travelers.", done: true },
      { id: "n-tix", text: "Peak Tram receipt", note: "", done: false },
    ] },
    { title: "Before you leave", items: [{ id: "b-naia", text: "Check in online", note: "", done: false }] },
  ]);
  assert.deepEqual(readChecklists(undefined), []);
  assert.deepEqual(readChecklists(`"Key","Value"\n"Name","x"`), []);
});

test("the pharmacy kit groups its medicines and carries its notes", () => {
  const kit = readPharmacy(`"Id","Group","Name","Qty","For","Who","How","Careful","Pack"
"ph-para","Medicines for adults","Biogesic 500 mg","× 20","Fever","Adults","Follow the box","Not with Neozep","Hand carry"
"ph-kid","Medicines for the kids","Tempra","× 1","Fever","Kids","Measuring cup","","Hand carry"`,
  `"Where","Text"
"Intro","Show the pharmacist the short list."
"Also","Bring the prescriptions."
"Medicines for the kids","Never give them adult tablets."
"Good to know","Doses: always follow the box."
"Good to know","Everything goes in your hand carry."`);
  assert.equal(kit.intro, "Show the pharmacist the short list.");
  assert.equal(kit.also, "Bring the prescriptions.");
  assert.deepEqual(kit.notes, ["Doses: always follow the box.", "Everything goes in your hand carry."]);
  assert.deepEqual(kit.groups.map(g => [g.title, g.note, g.items.length]), [
    ["Medicines for adults", "", 1], ["Medicines for the kids", "Never give them adult tablets.", 1],
  ]);
  assert.deepEqual(kit.groups[0].items[0], {
    id: "ph-para", name: "Biogesic 500 mg", qty: "× 20", for: "Fever", who: "Adults",
    how: "Follow the box", careful: "Not with Neozep", pack: "Hand carry",
  });
  assert.equal(readPharmacy(undefined, undefined), null);
});

test("info rows become sections, and a section can carry a table", () => {
  const info = readInfo(`"Section","Label","Text","Style"
"Emergency","","999","big"
"Emergency","","Police, fire, ambulance",""
"Hotel","Harbour Hotel","",""
"Rice and Filipino food","","For the seniors: Filipino food with rice.",""`,
  `"Table","A","B","C","D"
"Rice and Filipino food","Area","Place","What","Address"
"Rice and Filipino food","Jordan","Bedana's","Home-style","113 Woosung St"
"Flying","Bag","Allowance","Notes",""
"Flying","Hand carry","10 kg","Cabin bag",""`);
  assert.deepEqual(info, [
    { title: "Emergency", rows: [{ label: "", text: "999", big: true }, { label: "", text: "Police, fire, ambulance", big: false }], table: null },
    { title: "Hotel", rows: [{ label: "Harbour Hotel", text: "", big: false }], table: null },
    { title: "Rice and Filipino food", rows: [{ label: "", text: "For the seniors: Filipino food with rice.", big: false }],
      table: { head: ["Area", "Place", "What", "Address"], rows: [["Jordan", "Bedana's", "Home-style", "113 Woosung St"]] } },
    { title: "Flying", rows: [], table: { head: ["Bag", "Allowance", "Notes"], rows: [["Hand carry", "10 kg", "Cabin bag"]] } },
  ]);
  assert.deepEqual(readInfo(undefined, undefined), []);
});
