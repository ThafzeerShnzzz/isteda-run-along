// Deploy as a separate Apps Script web app, executing as the owner.
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const input = JSON.parse(e.postData.contents);
    if (!["entry", "task"].includes(input.action)) return reply_({ok: false, error: "Invalid action."});
    const photo = decodePhoto_(input.photo);
    const config = PropertiesService.getScriptProperties().getProperties();
    const workbook = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    const folder = DriveApp.getFolderById(config.PHOTO_FOLDER_ID);
    const cache = CacheService.getScriptCache();
    let phone = "";
    if (input.action === "entry") {
      phone = normalizePhone_(input.phone);
      if (!/^\d{8,15}$/.test(phone)) return reply_({ok: false, error: "Enter your registered WhatsApp number."});
      const attendees = workbook.getSheetByName(config.REGISTRATION_TAB);
      const column = Number(config.WHATSAPP_COLUMN);
      const rows = attendees.getLastRow() - 1;
      const numbers = rows > 0 ? attendees.getRange(2, column, rows, 1).getDisplayValues() : [];
      if (!numbers.some(row => normalizePhone_(row[0]) === phone)) {
        return reply_({ok: false, error: "This number is not on the RUN ALONG registration list."});
      }
    } else {
      if (typeof input.session !== "string" || !/^[a-f0-9-]{36}$/.test(input.session)) return expired_();
      phone = cache.get("entry:" + input.session);
      if (!phone) return expired_();
      if (!/^(L[123]|OPEN)-[0-9]{2}$/.test(input.id) || typeof input.title !== "string") {
        return reply_({ok: false, error: "Invalid task."});
      }
      if (input.id === "L2-03" && !String(input.caption || "").trim()) {
        return reply_({ok: false, error: "Name the three Emirates in the caption."});
      }
    }
    lock.waitLock(10000);
    const tabName = input.action === "entry" ? "Challenge Entries" : "Challenge Photos";
    let tab = workbook.getSheetByName(tabName);
    if (!tab) {
      tab = workbook.insertSheet(tabName);
      tab.appendRow(["Time", "WhatsApp", "Task ID", "Task", "Caption", "Photo", "Review"]);
    }
    const taskId = input.action === "entry" ? "PASS" : input.id;
    const previous = tab.getLastRow() > 1
      ? tab.getRange(2, 2, tab.getLastRow() - 1, 6).getValues()
      : [];
    const duplicate = previous.some(row => normalizePhone_(row[0]) === phone && row[1] === taskId && row[5] !== "Rejected");
    if (!duplicate) {
      const file = folder.createFile(Utilities.newBlob(photo, "image/jpeg", taskId + "-" + Utilities.getUuid() + ".jpg"));
      try {
        const title = input.action === "entry" ? "Armband" : safeCell_(input.title, 100);
        tab.appendRow([new Date(), phone, taskId, title, safeCell_(input.caption, 160), file.getUrl(), "Pending"]);
        SpreadsheetApp.flush();
      } catch (error) {
        file.setTrashed(true);
        throw error;
      }
    }
    if (input.action === "entry") {
      const session = Utilities.getUuid();
      cache.put("entry:" + session, phone, 21600);
      return reply_({ok: true, session});
    }
    return reply_({ok: true, already: duplicate});
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
