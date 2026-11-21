// Add this file to a script bound to the private RUN ALONG registrations sheet.
function onOpen() {
  SpreadsheetApp.getUi().createMenu("PhotoRun").addItem("Review entries and photos", "openPhotoRunReview").addToUi();
}

function openPhotoRunReview() {
  const ui = HtmlService.createHtmlOutput(`<!doctype html><base target="_blank">
<style>
body{font:14px system-ui;background:#141810;color:#f3f5ec;margin:14px}
button,select{font:inherit;margin:4px 3px 4px 0;padding:6px}
button{background:#d8ff36;border:0;border-radius:4px;cursor:pointer}
article{border:1px solid #505744;border-radius:7px;margin:9px 0;padding:9px;overflow-wrap:anywhere}
p{margin:6px 0}a{color:#d8ff36}
</style>
<h2>PhotoRun review</h2>
<select id="tab" aria-label="Submissions"><option>Challenge Photos</option><option>Challenge Entries</option></select>
<select id="filter" aria-label="Review status"><option>Pending</option><option>All</option><option>Approved</option><option>Rejected</option><option>Winner</option></select>
<button id="refresh">Refresh</button><p id="status" role="status"></p><div id="rows"></div>
<script>
const byId = id => document.getElementById(id);
function element(tag,text) { const node = document.createElement(tag); node.textContent = text; return node; }
function failed(error) { byId("status").textContent = error.message; }
function load() {
  byId("status").textContent = "Loading…";
  google.script.run.withFailureHandler(failed).withSuccessHandler(render).listPhotoRunReviews(byId("tab").value);
}
function render(rows) {
  const target = byId("rows");
  target.replaceChildren();
  const filter = byId("filter").value;
  const shown = rows.filter(row => filter === "All" || row.state === filter);
  byId("status").textContent = shown.length ? shown.length + " submissions" : "No submissions in this view.";
  for (const row of shown) {
    const card = element("article","");
    card.append(element("strong",row.title),element("p",[row.name, row.phone, row.time].filter(Boolean).join(" · ")),element("p",row.state));
    if (row.caption) card.append(element("p",row.caption));
    if (/^https:\\/\\/drive\\.google\\.com\\//.test(row.photo)) {
      const link = element("a","Open photo");
      link.href = row.photo;
      link.rel = "noopener";
      card.append(link,document.createElement("br"));
    }
    const actions = [["Approve","Approved"],["Reject","Rejected"]];
    if (["OPEN-03","OPEN-04"].includes(row.task)) actions.push(["Award 4 points","Winner"]);
    for (const [label,state] of actions) {
      const button = element("button",label);
      button.onclick = () => {
        card.querySelectorAll("button").forEach(btn => btn.disabled = true);
        google.script.run.withSuccessHandler(load).withFailureHandler(error => {
          card.querySelectorAll("button").forEach(btn => btn.disabled = false);
          failed(error);
        }).reviewPhotoRunEntry(row.tab,row.row,row.photo,state);
      };
      card.append(button);
    }
    target.append(card);
  }
}
byId("refresh").onclick = byId("tab").onchange = byId("filter").onchange = load;
load();
</script>`).setTitle("PhotoRun review");
  SpreadsheetApp.getUi().showSidebar(ui);
}

function photoRunReviewSheet_(tab) {
  if (!["Challenge Entries", "Challenge Photos"].includes(tab)) throw new Error("Invalid tab.");
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
}

function listPhotoRunReviews(tab) {
  const sheet = photoRunReviewSheet_(tab);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, tab === "Challenge Entries" ? 8 : 7).getDisplayValues().map((v, i) => ({
    tab, row: i + 2, time: v[0], phone: v[1], task: v[2], title: v[3], caption: v[4], photo: v[5], state: v[6] || "Pending", name: v[7] || ""
  })).filter(row => row.photo).reverse();
}

function reviewPhotoRunEntry(tab, row, photo, state) {
  if (!["Approved", "Rejected", "Winner"].includes(state)) throw new Error("Invalid review status.");
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const sheet = photoRunReviewSheet_(tab);
    if (!sheet || !Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error("Refresh the submissions.");
    const current = sheet.getRange(row, 1, 1, 7).getDisplayValues()[0];
    if (!photo || current[5] !== photo) throw new Error("The submission moved. Refresh and try again.");
    if (state === "Winner") {
      if (tab !== "Challenge Photos" || !["OPEN-03", "OPEN-04"].includes(current[2])) throw new Error("This submission has no point award.");
      const previous = sheet.getRange(2, 3, sheet.getLastRow() - 1, 5).getDisplayValues();
      previous.forEach((other, i) => {
        if (i + 2 !== row && other[0] === current[2] && other[4] === "Winner") {
          sheet.getRange(i + 2, 7).setValue("Approved");
        }
      });
    }
    sheet.getRange(row, 7).setValue(state);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}
