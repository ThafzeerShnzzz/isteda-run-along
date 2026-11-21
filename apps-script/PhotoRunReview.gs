// Add this file to a script bound to the private RUN ALONG registrations sheet.
function onOpen() {
  SpreadsheetApp.getUi().createMenu("PhotoRun").addItem("Review entries and photos", "openPhotoRunReview").addToUi();
}

function openPhotoRunReview() {
  const ui = HtmlService.createHtmlOutput("<!doctype html><base target=\"_blank\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>\n*{box-sizing:border-box}body{margin:0;background:#11140f;color:#f4f6ef;font:14px system-ui,sans-serif}\nheader{position:sticky;top:0;background:#171d14;border-bottom:1px solid #4a5641;padding:18px 24px;z-index:1}\nh1,h2,h3,p{margin:0 0 8px}h1{font-size:24px}h2{font-size:18px;color:#d8ff36}\nmain{max-width:900px;margin:auto;padding:20px 24px}select,button{font:inherit;border-radius:7px;padding:8px 12px;margin:2px 6px 2px 0}\nbutton{cursor:pointer;border:1px solid #6a785d;background:#252d20;color:#fff}button.approve{background:#d8ff36;color:#161b11;border-color:#d8ff36;font-weight:700}button:disabled{opacity:.5}\n.player{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px}\n.score{color:#d8ff36;font-size:22px;font-weight:800;white-space:nowrap}\nsection{margin-bottom:24px}article{background:#1e251a;border:1px solid #414c39;border-radius:10px;padding:12px 14px;margin:8px 0}\n.meta,#status{color:#c5cfbe}a{display:inline-block;color:#d8ff36;margin:0 10px 6px 0}h3{font-size:15px}\n</style>\n<header><h1>PhotoRun Review</h1><label for=\"player\">Player</label><br><select id=\"player\"></select><button id=\"refresh\">Refresh</button>\n<div class=\"player\"><div><strong id=\"name\"></strong><br><span id=\"phone\"></span></div><div><span class=\"score\" id=\"score\"></span><button type=\"button\" id=\"archive-entry\" hidden>Archive Entry</button></div></div>\n<p id=\"status\" role=\"status\"></p></header><main id=\"questions\"></main>\n<script>\nconst byId=id=>document.getElementById(id);\nconst make=(tag,text,cls)=>Object.assign(document.createElement(tag),{textContent:text,className:cls||\"\"});\nlet data;\nfunction failed(error){byId(\"status\").textContent=error.message;byId(\"refresh\").disabled=false;byId(\"player\").disabled=false;document.querySelectorAll(\"article button\").forEach(b=>b.disabled=false);}\nfunction link(label,url){\n  let parsed;\n  try{parsed=new URL(url)}catch{return null}\n  if(parsed.protocol!==\"https:\"||parsed.hostname!==\"drive.google.com\")return null;\n  return Object.assign(make(\"a\",label),{href:parsed.href,rel:\"noopener\"});\n}\nfunction load(){\n  byId(\"status\").textContent=\"Loading entries…\";byId(\"refresh\").disabled=true;byId(\"player\").disabled=true;\n  google.script.run.withFailureHandler(failed).withSuccessHandler(result=>{\n    const select=byId(\"player\");\n    const selected=select.value;\n    data=result;\n    select.replaceChildren(...data.players.map(p=>Object.assign(make(\"option\",p.name+\" · \"+p.phone),{value:p.phone})));\n    if(data.players.some(p=>p.phone===selected))select.value=selected;\n    select.disabled=false;byId(\"refresh\").disabled=false;\n    render();\n  }).getPhotoRunDashboard();\n}\nfunction render(){\n  const p=data.players.find(item=>item.phone===byId(\"player\").value);\n  const root=byId(\"questions\");root.replaceChildren();\n  byId(\"name\").textContent=p?.name||\"\";byId(\"phone\").textContent=p?.phone||\"\";\n  byId(\"score\").textContent=p ? p.score+\" points\" : \"\";\n  byId(\"status\").textContent=p ? \"\" : \"No player entries yet.\";\n  byId(\"archive-entry\").hidden=!p?.canArchive;\n  if(!p)return;\n  const entryLink=link(\"Open admit card photo\",p.entryPhoto);\n  if(entryLink)root.append(entryLink);\n  for(const level of data.levels){\n    const section=make(\"section\",\"\");\n    section.append(make(\"h2\",level.title));\n    level.tasks.forEach((task,i)=>{\n      const card=make(\"article\",\"\");\n      const row=p.submissions[task.id];\n      card.append(make(\"h3\",\"Q\"+(i+1)+\" · \"+task.title.replace(/^Q[0-9]+[.] +/,\"\")),make(\"p\",task.text));\n      card.append(make(\"p\",row ? row.state : \"No submission\",\"meta\"));\n      if(row){\n        if(row.caption)card.append(make(\"p\",row.caption));\n        const photo=link(\"Open submitted photo\",row.photo);\n        if(photo)card.append(photo);\n        const actions=[[\"Approve\",\"Approved\"],[\"Reject\",\"Rejected\"]];\n        if([\"OPEN-03\",\"OPEN-04\"].includes(task.id))actions.push([\"Award 4 points\",\"Winner\"]);\n        for(const [label,state] of actions){\n          const button=make(\"button\",label,state===\"Approved\"?\"approve\":\"\");\n          button.onclick=()=>{\n            document.querySelectorAll(\"article button\").forEach(b=>b.disabled=true);\n            byId(\"status\").textContent=\"Saving review…\";\n            google.script.run.withFailureHandler(failed).withSuccessHandler(load)\n              .reviewPhotoRunEntry(row.tab,row.row,row.photo,state);\n          };\n          card.append(button);\n        }\n      }\n      section.append(card);\n    });\n    root.append(section);\n  }\n}\nbyId(\"archive-entry\").onclick=()=>{\n  const player=data.players.find(item=>item.phone===byId(\"player\").value);\n  if(!player?.canArchive||!window.confirm(\"Archive \"+player.name+\"'s PhotoRun entry? Their photos will be kept.\"))return;\n  byId(\"archive-entry\").disabled=true;\n  google.script.run.withFailureHandler(error=>{\n    byId(\"archive-entry\").disabled=false;\n    failed(error);\n  }).withSuccessHandler(()=>{\n    byId(\"archive-entry\").disabled=false;\n    load();\n  }).archivePhotoRunPlayer(player.phone);\n};\nbyId(\"player\").onchange=render;byId(\"refresh\").onclick=load;load();\n</script>").setWidth(880).setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(ui, "PhotoRun Admin");
}

function getPhotoRunDashboard() {
  const levels = [{"title":"Common Question","kind":"common","points":2,"scoringLimit":1,"tasks":[{"id":"OPEN-06","title":"ISTEDA Wristband Selfie","text":"Upload a selfie wearing your ISTEDA wristband. Make sure the wristband is clearly visible."}]},{"title":"Level 1 (Easy Mode)","tasks":[{"id":"L1-01","title":"ISTEDA Cap & Wristband","text":"Take a photo of yourself wearing both the exclusive ISTEDA cap and wristband."},{"id":"L1-02","title":"ISTEDA Team Selfie","text":"Take a group selfie with at least five ISTEDA team members."},{"id":"L1-03","title":"ISTEDA Member Selfie","text":"Take a selfie with an ISTEDA member of the opposite gender."},{"id":"L1-04","title":"ISTEDA Face Challenge","text":"Get one of these expressions on camera: Vyshu crying, Maha laughing, Dona blushing, or Lino looking angry. Choose any one."},{"id":"L1-05","title":"Meet the New Members","text":"Take a selfie with three ISTEDA members who joined on or after the OKP event."}],"points":1,"scoringLimit":3},{"title":"Level 2","tasks":[{"id":"L2-01","title":"Q1. Dubai Run Throwback","text":"Can you find someone wearing an older Dubai Run shirt and take a photo showing both editions? Can you get three different years in one shot?"},{"id":"L2-02","title":"Q2. Shoe Twin","text":"Can you find a runner wearing the same shoe brand and colour as you and take a photo showing both pairs?"},{"id":"L2-06","title":"Q3. The Runner Rectangle","text":"Can you find four Dubai Run participants from outside ISTEDA and form a rectangle with your arms together? Ask a friend to take the photo."},{"id":"L2-04","title":"Q4. Match the Reference Photo","text":"Can you recreate either reference photo from the same spot and angle? Choose the Al Boursa St 200 m sign or Texas Chicken.","referencePhotos":true},{"id":"L2-05","title":"Q5. Direction Challenge ↪️📸","text":"Can you find a left-turn or right-turn road sign and strike a dramatic pose pointing or leaning in the same direction? Ask a friend to capture you and the sign together."}],"points":2,"scoringLimit":3},{"title":"Level 3","tasks":[{"id":"L3-01","title":"Q1. Reverse Bibs","text":"Can you find a runner whose bib ends with your last two digits reversed? If yours ends in 27, look for 72. Take a selfie showing both bibs."},{"id":"L3-02","title":"Q2. Sheikh Zayed Road Jump 📸","text":"Can you jump from one white dash toward the next on a clear stretch of the closed Sheikh Zayed Road route? Ask a friend to photograph you with both feet off the ground."},{"id":"L3-03","title":"Q3. Triple 7","text":"Can you find a runner whose bib contains three 7s anywhere in the number? Take a selfie with them holding up seven fingers."},{"id":"L3-04","title":"Q4. Birthday Challenge","text":"Can you find a runner whose bib ends with your birth day of the month? If you were born on the 21st, look for 21. Take a selfie while they point to the matching digits."},{"id":"L3-05","title":"Q5. Maths Match","text":"Can you find a runner whose final bib digit adds to 10 with yours, like 6 and 4, 9 and 1, or 2 and 8? Take a selfie showing both bibs and the numbers on your fingers. If yours ends in 0, find runners ending in 9 and 1 and show all three bibs in one photo."}],"points":3,"scoringLimit":3},{"title":"Special Awards","tasks":[{"id":"OPEN-03","title":"Best Photography Award · 4 points","text":"Submit any photo related to Dubai Run. The winning photo earns 4 points."},{"id":"OPEN-04","title":"Best Selfie · 4 points","text":"Take a selfie with something related to Dubai Run. The winning selfie earns 4 points."},{"id":"OPEN-05","title":"Most Calories Burned","text":"Upload a screenshot or other proof showing your total calories burned on Dubai Run day."}],"kind":"awards"}];
  const workbook = SpreadsheetApp.getActiveSpreadsheet();
  const roster = workbook.getSheetByName("Sheet1");
  const names = new Map();
  if (roster && roster.getLastRow()) {
    for (const [name, phone] of roster.getRange(1, 2, roster.getLastRow(), 2).getDisplayValues()) {
      const key = photoRunPhone_(phone);
      if (key && name.trim() && !names.has(key)) names.set(key, name.trim());
    }
  }
  const players = new Map();
  const entries = listPhotoRunReviews("Challenge Entries");
  const archived = new Set(entries.filter(row => row.archived).map(row => photoRunPhone_(row.phone)));
  for (const row of [...entries, ...listPhotoRunReviews("Challenge Photos")]) {
    const phone = photoRunPhone_(row.phone);
    if (!phone || archived.has(phone)) continue;
    if (!players.has(phone)) players.set(phone, {phone, name: row.name || names.get(phone) || phone, entryPhoto: "", submissions: {}});
    const player = players.get(phone);
    if (row.tab === "Challenge Entries") {
      if (!player.entryPhoto) player.entryPhoto = row.photo;
    } else if (/^(L[123]|OPEN)-[0-9]{2}$/.test(row.task) && !player.submissions[row.task]) player.submissions[row.task] = row;
  }
  const entryPhones = new Set(entries.map(row => photoRunPhone_(row.phone)));
  for (const player of players.values()) {
    player.score = photoRunScore_(player.submissions, levels);
    player.canArchive = entryPhones.has(player.phone);
  }
  return {levels, players: [...players.values()].sort((a,b) => a.name.localeCompare(b.name) || a.phone.localeCompare(b.phone))};
}

function photoRunScore_(submissions, levels) {
  const total = levels.reduce((sum, level) => {
    const count = level.tasks.filter(task => submissions[task.id]?.state === "Approved").length;
    return sum + Math.min(count, level.scoringLimit ?? count) * (level.points || 0);
  }, 0);
  return total + ["OPEN-03", "OPEN-04"].filter(id => submissions[id]?.state === "Winner").length * 4;
}

function photoRunPhone_(value) {
  let phone = String(value || "").replace(/[^0-9]/g, "").replace(/^00/, "");
  if (/^05[0-9]{8}$/.test(phone)) phone = "971" + phone.slice(1);
  if (/^5[0-9]{8}$/.test(phone)) phone = "971" + phone;
  return phone;
}

function photoRunReviewSheet_(tab) {
  if (!["Challenge Entries", "Challenge Photos"].includes(tab)) throw new Error("Invalid tab.");
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
}

function listPhotoRunReviews(tab) {
  const sheet = photoRunReviewSheet_(tab);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, tab === "Challenge Entries" ? 10 : 7).getDisplayValues().map((v, i) => ({
    tab, row: i + 2, time: v[0], phone: v[1], task: v[2], title: v[3], caption: v[4], photo: v[5], state: v[6] || "Pending", name: v[7] || "", archived: Boolean(v[9])
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

function archivePhotoRunPlayer(phone) {
  const key = photoRunPhone_(phone);
  if (!key) throw new Error("Select a player first.");
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const sheet = photoRunReviewSheet_("Challenge Entries");
    if (!sheet || sheet.getLastRow() < 2) throw new Error("Entry not found.");
    const numbers = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getDisplayValues();
    const cells = numbers.flatMap(([number], i) => photoRunPhone_(number) === key ? ["J" + (i + 2)] : []);
    if (!cells.length) throw new Error("Entry not found.");
    sheet.getRange(1, 10).setValue("Archived at");
    sheet.getRangeList(cells).setValue(new Date());
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}
