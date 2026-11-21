// Deploy as a separate Apps Script web app, executing as the owner.
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const input = JSON.parse(e.postData.contents);
    if (!["entry", "verify", "task", "status", "finalize", "leaderboard"].includes(input.action)) return reply_({ok: false, error: "Invalid action."});
    const config = PropertiesService.getScriptProperties().getProperties();
    const workbook = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    if (input.action === "leaderboard") return reply_(photoRunLeaderboard_(workbook, config));
    const cache = CacheService.getScriptCache();
    let phone = "";
    let name = "";
    if (input.action === "entry" || input.action === "verify") {
      phone = normalizePhone_(input.phone);
      name = safeCell_(input.name, 100);
      if (!name) return reply_({ok: false, error: "Enter your name."});
      if (!/^\d{8,15}$/.test(phone)) return reply_({ok: false, error: "Enter your registered WhatsApp number."});
      const attendees = workbook.getSheetByName(config.REGISTRATION_TAB);
      const column = Number(config.WHATSAPP_COLUMN || 3);
      const rows = attendees.getLastRow();
      const numbers = rows > 0 ? attendees.getRange(1, column, rows, 1).getDisplayValues() : [];
      if (!numbers.some(row => normalizePhone_(row[0]) === phone)) {
        return reply_({ok: false, error: "This number is not on the RUN ALONG registration list."});
      }
      if (photoRunArchived_(workbook, phone)) return archivedPhotoRunReply_();
      if (input.action === "verify") return reply_({ok: true});
    } else {
      if (typeof input.session !== "string" || !/^[a-f0-9-]{36}$/.test(input.session)) return expired_();
      phone = cache.get("entry:" + input.session);
      if (!phone) return expired_();
      if (photoRunArchived_(workbook, phone)) return archivedPhotoRunReply_();
      if (input.action === "status") return reply_({ok: true, ...reviewProgress_(workbook, phone)});
      if (input.action === "finalize") {
        lock.waitLock(10000);
        const entries = workbook.getSheetByName("Challenge Entries");
        const row = photoRunEntryRow_(entries, phone);
        if (!row) return expired_();
        const cell = entries.getRange(row, 9);
        if (!cell.getValue()) {
          entries.getRange(1, 9).setValue("Submitted at");
          cell.setValue(new Date());
          SpreadsheetApp.flush();
        }
        return reply_({ok: true, finalized: true});
      }
      if (!/^(L[123]|OPEN)-[0-9]{2}$/.test(input.id) || typeof input.title !== "string") {
        return reply_({ok: false, error: "Invalid task."});
      }
      if (input.id === "L2-03" && !String(input.caption || "").trim()) {
        return reply_({ok: false, error: "Name the three Emirates in the caption."});
      }
    }
    const photo = decodePhoto_(input.photo);
    const folder = DriveApp.getFolderById(config.PHOTO_FOLDER_ID);
    lock.waitLock(10000);
    if (input.action === "task" && photoRunFinalized_(workbook, phone)) {
      return reply_({ok: false, error: "Your PhotoRun entry has already been submitted."});
    }
    const tabName = input.action === "entry" ? "Challenge Entries" : "Challenge Photos";
    let tab = workbook.getSheetByName(tabName);
    if (!tab) {
      tab = workbook.insertSheet(tabName);
      tab.appendRow(["Time", "WhatsApp", "Task ID", "Task", "Caption", "Photo", "Review"]);
    }
    if (input.action === "entry" && !tab.getRange(1, 8).getValue()) tab.getRange(1, 8).setValue("Name");
    const taskId = input.action === "entry" ? "PASS" : input.id;
    const previous = tab.getLastRow() > 1
      ? tab.getRange(2, 2, tab.getLastRow() - 1, 6).getValues()
      : [];
    const existing = previous.findIndex(row => normalizePhone_(row[0]) === phone && row[1] === taskId && row[5] !== "Rejected");
    const duplicate = existing >= 0;
    if (duplicate && input.action === "entry" && !tab.getRange(existing + 2, 8).getValue()) {
      tab.getRange(existing + 2, 8).setValue(name);
    }
    if (!duplicate) {
      const file = folder.createFile(Utilities.newBlob(photo, "image/jpeg", taskId + "-" + Utilities.getUuid() + ".jpg"));
      try {
        const title = input.action === "entry" ? "Armband" : safeCell_(input.title, 100);
        tab.appendRow([new Date(), phone, taskId, title, safeCell_(input.caption, 160), file.getUrl(), "Pending", ...(input.action === "entry" ? [name] : [])]);
        SpreadsheetApp.flush();
      } catch (error) {
        file.setTrashed(true);
        throw error;
      }
    }
    if (input.action === "entry") {
      const session = Utilities.getUuid();
      cache.put("entry:" + session, phone, 21600);
      return reply_({ok: true, session, ...reviewProgress_(workbook, phone)});
    }
    return reply_({ok: true, already: duplicate, ...reviewProgress_(workbook, phone)});
  } catch (error) {
    console.error(String(error));
    return reply_({ok: false, error: "The upload could not be saved. Please try again."});
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function decodePhoto_(encoded) {
  if (typeof encoded !== "string" || encoded.length > 2400000) throw new Error("Invalid photo size");
  const bytes = Utilities.base64Decode(encoded);
  if (bytes.length < 4 || bytes[0] !== -1 || bytes[1] !== -40 || bytes[2] !== -1) throw new Error("Invalid JPEG");
  return bytes;
}

function normalizePhone_(value) {
  let digits = String(value || "").replace(/\D/g, "").replace(/^00/, "");
  if (/^05\d{8}$/.test(digits)) digits = "971" + digits.slice(1);
  if (/^5\d{8}$/.test(digits)) digits = "971" + digits;
  return digits;
}

function safeCell_(value, length) {
  const text = String(value || "").trim().slice(0, length);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function expired_() {
  return reply_({ok: false, error: "Your session expired. Choose Use a different entry to verify again."});
}

function reply_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function reviewProgress_(workbook, phone) {
  const sheet = workbook.getSheetByName("Challenge Photos");
  const reviews = {};
  if (sheet && sheet.getLastRow() > 1) {
    for (const row of sheet.getRange(2, 2, sheet.getLastRow() - 1, 6).getDisplayValues()) {
      const [number, task, , , , status] = row;
      if (normalizePhone_(number) !== phone || !/^(L[123]|OPEN)-\d{2}$/.test(task)) continue;
      reviews[task] = status || "Pending";
    }
  }
  return {
    reviews,
    finalized: photoRunFinalized_(workbook, phone),
    completed: Object.keys(reviews).filter(task => ["Approved", "Winner"].includes(reviews[task]))
  };
}

function photoRunEntryRow_(sheet, phone) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const numbers = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getDisplayValues();
  const match = numbers.findIndex(row => normalizePhone_(row[0]) === phone);
  return match < 0 ? 0 : match + 2;
}

function photoRunFinalized_(workbook, phone) {
  const entries = workbook.getSheetByName("Challenge Entries");
  const row = photoRunEntryRow_(entries, phone);
  return row > 0 && Boolean(entries.getRange(row, 9).getValue());
}

function photoRunLeaderboard_(workbook, config) {
  const levels = [{"ids":["OPEN-06"],"points":2,"limit":1},{"ids":["L1-01","L1-02","L1-03","L1-04","L1-05"],"points":1,"limit":3},{"ids":["L2-01","L2-02","L2-06","L2-04","L2-05"],"points":2,"limit":3},{"ids":["L3-01","L3-02","L3-03","L3-04","L3-05"],"points":3,"limit":3}];
  const total = levels.reduce((count, level) => count + level.ids.length, 0);
  const entries = workbook.getSheetByName("Challenge Entries");
  const photos = workbook.getSheetByName("Challenge Photos");
  if (!entries || !photos || entries.getLastRow() < 2 || photos.getLastRow() < 2) {
    return {ok: true, total, rankings: []};
  }

  const registered = workbook.getSheetByName(config.REGISTRATION_TAB);
  const names = new Map();
  if (registered && registered.getLastRow() > 0) {
    const phoneColumn = Number(config.WHATSAPP_COLUMN || 3);
    for (const row of registered.getRange(1, 1, registered.getLastRow(), Math.max(2, phoneColumn)).getDisplayValues()) {
      const phone = normalizePhone_(row[phoneColumn - 1]);
      if (phone && row[1].trim() && !names.has(phone)) names.set(phone, row[1].trim());
    }
  }

  const players = new Map();
  const entryRows = entries.getRange(2, 1, entries.getLastRow() - 1, 10).getDisplayValues();
  const archived = new Set(entryRows.filter(row => row[9]).map(row => normalizePhone_(row[1])));
  for (const row of entryRows) {
    const phone = normalizePhone_(row[1]);
    const name = names.get(phone) || row[7].trim();
    if (phone && !archived.has(phone) && name && row[2] === "PASS" && row[6] !== "Rejected") {
      players.set(phone, {name, reviews: new Map()});
    }
  }
  for (const row of photos.getRange(2, 2, photos.getLastRow() - 1, 6).getDisplayValues()) {
    const player = players.get(normalizePhone_(row[0]));
    if (player) player.reviews.set(row[1], row[5]);
  }

  const scores = [];
  for (const player of players.values()) {
    let score = 0;
    let completed = 0;
    for (const level of levels) {
      const count = level.ids.filter(id => player.reviews.get(id) === "Approved").length;
      completed += count;
      score += Math.min(count, level.limit) * level.points;
    }
    score += ["OPEN-03", "OPEN-04"].filter(id => player.reviews.get(id) === "Winner").length * 4;
    if (score > 0) scores.push({name: player.name, score, completed});
  }

  scores.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let position = 0;
  const rankings = scores.slice(0, 10).map((row, index) => {
    if (index === 0 || row.score !== scores[index - 1].score) position = index + 1;
    return {position, ...row};
  });
  return {ok: true, total, rankings};
}

function photoRunArchived_(workbook, phone) {
  const sheet = workbook.getSheetByName("Challenge Entries");
  if (!sheet || sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, 2, sheet.getLastRow() - 1, 9).getDisplayValues()
    .some(row => normalizePhone_(row[0]) === phone && Boolean(row[8]));
}

function archivedPhotoRunReply_() {
  return reply_({ok: false, error: "This PhotoRun entry has been archived. Contact the organizer to restore it."});
}
