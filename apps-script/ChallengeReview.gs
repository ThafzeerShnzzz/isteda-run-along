function onOpen() {
  SpreadsheetApp.getUi().createMenu("Run Along")
    .addItem("Review Challenges", "openChallengeReview")
    .addToUi();
}

function openChallengeReview() {
  SpreadsheetApp.getUi().showModelessDialog(
    HtmlService.createHtmlOutputFromFile("ChallengeReview").setWidth(930).setHeight(680),
    "Run Along Challenge Review"
  );
}

function listChallengeReviews() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const entries = challengeRows_(book, "Challenge Entries");
  const tasks = challengeRows_(book, "Challenge Photos");
  const people = new Map();
  for (const row of [...entries, ...tasks]) {
    if (!people.has(row.phone)) people.set(row.phone, {phone: row.phone, passes: [], tasks: []});
    const person = people.get(row.phone);
    (row.id === "PASS" ? person.passes : person.tasks).push(row);
  }
  return [...people.values()].map(person => {
    person.verified = person.passes.some(row => row.status === "Approved");
    const approved = [...new Set(person.tasks.filter(row => row.status === "Approved").map(row => row.id))];
    const levelTwo = approved.filter(id => id.startsWith("L2-")).length;
    person.levelTwoComplete = person.verified && levelTwo >= 3;
    person.points = person.verified ? 2 * (approved.length - levelTwo + Math.min(3, levelTwo)) : 0;
    return person;
  });
}

function reviewChallengePhoto(kind, rowNumber, photoUrl, status) {
  const name = challengeTab_(kind);
  if (!["Approved", "Rejected", "Pending"].includes(status)) throw new Error("Invalid review status.");
  const lock = LockService.getDocumentLock();
  lock.waitLock(8000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const row = challengeRow_(book, name, rowNumber, photoUrl);
    book.getSheetByName(name).getRange(row.rowNumber, 7).setValue(status);
    SpreadsheetApp.flush();
    return listChallengeReviews();
  } finally {
    lock.releaseLock();
  }
}

function previewChallengePhoto(kind, rowNumber, photoUrl) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const row = challengeRow_(book, challengeTab_(kind), rowNumber, photoUrl);
  const match = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\//.exec(row.url);
  if (!match) throw new Error("The photo link is unavailable.");
  const file = DriveApp.getFileById(match[1]);
  const blob = file.getThumbnail() || file.getBlob();
  if (!["image/jpeg", "image/png", "image/webp"].includes(blob.getContentType())) {
    throw new Error("Open the photo in Drive to view it.");
  }
  return "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes());
}

function challengeTab_(kind) {
  if (kind === "pass") return "Challenge Entries";
  if (kind === "task") return "Challenge Photos";
  throw new Error("Invalid photo type.");
}

function challengeRow_(book, name, rowNumber, url) {
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || !url) throw new Error("Invalid photo.");
  const row = challengeRows_(book, name).find(item => item.rowNumber === rowNumber && item.url === url);
  if (!row) throw new Error("This row changed. Refresh the panel and try again.");
  return row;
}

function challengeRows_(book, name) {
  const sheet = book.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getDisplayValues()
    .map(([date, phone, id, title, caption, url, status], index) => ({
      date, phone, id, title, caption, url, status: status || "Pending", rowNumber: index + 2
    }))
    .filter(row => row.phone && row.id && row.url);
}
