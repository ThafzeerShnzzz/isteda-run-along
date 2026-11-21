const byId = id => document.getElementById(id);
const make = (tag, text) => Object.assign(document.createElement(tag), {textContent: text});
const storageKey = "run-along-challenge-progress";
let catalog, endpoint, activeLevel = -1;
let gameTimer;
let entry = null;
try {
  entry = JSON.parse(sessionStorage.getItem(storageKey));
} catch {
  // A fresh entry can still be started.
}

function saveEntry() {
  try {
    if (entry) sessionStorage.setItem(storageKey, JSON.stringify(entry));
    else sessionStorage.removeItem(storageKey);
  } catch {
    // The current page remains usable when browser storage is unavailable.
  }
}

async function request(data) {
  const response = await fetch(endpoint, {
    method: "POST", body: JSON.stringify(data), signal: AbortSignal.timeout(45000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Please try again.");
  return result;
}

async function photoData(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.83).split(",")[1];
  } finally {
    bitmap.close();
  }
}


function levelLabel(level) {
  if (!level.points) return level.title;
  return level.title + " (" + level.points + (level.points === 1 ? " point each)" : " points each)");
}

function levelCount(level) {
  return level.tasks.filter(task => entry.completed.includes(task.id)).length;
}

function updateProgress() {
  let total = 0;
  catalog.forEach((level, index) => {
    const count = levelCount(level);
    total += count * (level.points || 0);
    byId("levels").children[index].textContent = levelLabel(level) + " · " + count + "/" + level.tasks.length;
  });
  byId("score").textContent = "Total points: " + total;
  if (activeLevel >= 0) {
    const level = catalog[activeLevel];
    byId("level-progress").textContent = "Challenges completed: " + levelCount(level) + "/" + level.tasks.length;
  }
}

function displayLevel(index) {
  activeLevel = index;
  const level = catalog[index];
  const section = byId("tasks");
  section.hidden = false;
  [...byId("levels").children].forEach((button, i) => {
    button.setAttribute("aria-pressed", String(i === index));
  });
  const progress = make("p", "");
  progress.id = "level-progress";
  progress.setAttribute("role", "status");
  section.replaceChildren(make("h2", levelLabel(level)), progress);
  updateProgress();
  if (level.rule) section.append(make("p", level.rule));
  if (!level.tasks.length) section.append(make("p", "Tasks coming soon."));
  for (const task of level.tasks) {
    const card = document.createElement("article");
    card.append(make("h3", task.title), make("p", task.text));
    section.append(card);
    if (entry.completed.includes(task.id)) {
      card.append(make("p", "Photo submitted"));
      continue;
    }
    const form = document.createElement("form");
    const label = make("label", task.id === "OPEN-05" ? "Attach screenshot or photo proof" : "Attach task photo");
    const photo = Object.assign(document.createElement("input"), {type: "file", accept: "image/*", required: true});
    const button = make("button", "Submit Photo");
    const status = make("output", "");
    status.setAttribute("role", "status");
    label.append(photo);
    form.append(label);
    let caption;
    if (task.caption) {
      caption = Object.assign(document.createElement("input"), {type: "text", maxLength: 160, required: true});
      const captionLabel = make("label", "Caption");
      captionLabel.append(caption);
      form.append(captionLabel);
    }
    form.append(button, status);
    card.append(form);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const currentEntry = entry;
      button.disabled = true;
      status.textContent = "Uploading…";
      try {
        await request({
          action: "task", session: currentEntry.session, id: task.id, title: task.title,
          caption: caption?.value.trim() || "", photo: await photoData(photo.files[0])
        });
        if (entry !== currentEntry) return;
        if (!entry.completed.includes(task.id)) entry.completed.push(task.id);
        saveEntry();
        updateProgress();
        form.replaceWith(make("p", "Photo submitted"));
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }
}

function openChallenges() {
  byId("entry").hidden = true;
  byId("play").hidden = false;
  byId("tasks").hidden = true;
  activeLevel = -1;
  byId("game-guide").hidden = false;
  byId("enter-game").hidden = false;
  byId("game-loading").hidden = true;
  byId("game-levels").hidden = true;
  byId("levels").replaceChildren(...catalog.map((level, index) => {
    const button = make("button", "");
    button.setAttribute("aria-pressed", "false");
    button.onclick = () => displayLevel(index);
    return button;
  }));
  updateProgress();
}

function pdfText(text) {
  return text.replace(/[’‘]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7e]/g, "");
}

function wrap(text) {
  const lines = [];
  let line = "";
  for (const word of pdfText(text).split(/\s+/)) {
    if (line.length && line.length + word.length > 77) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  return [...lines, line];
}

function downloadPDF() {
  const lines = [
    "RUN ALONG. | ISTEDA x EL FORSA", "PhotoRun | Dubai Run Challenge Card", "",
    "Take your photos offline. Return to PhotoRun to upload after the run.", ""
  ];
  for (const level of catalog) {
    lines.push(levelLabel(level).toUpperCase());
    if (level.rule) lines.push(...wrap(level.rule));
    if (!level.tasks.length) lines.push("Tasks coming soon.");
    for (const task of level.tasks) lines.push(...wrap("[ ] " + task.title + " - " + task.text), "");
    lines.push("");
  }
  const pages = [];
  for (let i = 0; i < lines.length; i += 45) pages.push(lines.slice(i, i + 45));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count " + pages.length + " /Kids [" + pages.map((_, i) => (4 + i * 2) + " 0 R").join(" ") + "] >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  for (const page of pages) {
    const stream = "BT /F1 12 Tf 16 TL 48 790 Td\n" +
      page.map(line => "(" + line.replace(/[\\()]/g, "\\$&") + ") Tj T*").join("\n") + "\nET\n";
    objects.push(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents " + (objects.length + 2) + " 0 R >>",
      "<< /Length " + stream.length + " >>\nstream\n" + stream + "endstream"
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += (i + 1) + " 0 obj\n" + object + "\nendobj\n";
    return offset;
  });
  const xref = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (const offset of offsets) pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  const url = URL.createObjectURL(new Blob([pdf], {type: "application/pdf"}));
  const link = Object.assign(document.createElement("a"), {href: url, download: "RUN_ALONG_PhotoRun.pdf"});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}


byId("enter-game").onclick = () => {
  byId("game-guide").hidden = true;
  byId("enter-game").hidden = true;
  byId("game-loading").hidden = false;
  const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 4000;
  gameTimer = setTimeout(() => {
    byId("game-loading").hidden = true;
    byId("game-levels").hidden = false;
    byId("choose-level").focus();
  }, delay);
};

byId("different-entry").onclick = () => {
  clearTimeout(gameTimer);
  entry = null;
  saveEntry();
  byId("play").hidden = true;
  byId("entry").hidden = false;
  byId("entry-status").textContent = "";
  byId("verify").elements.phone.focus();
};

byId("verify").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = byId("continue");
  const status = byId("entry-status");
  if (!endpoint) return;
  button.disabled = true;
  status.textContent = "Checking your number and uploading your admit card photo…";
  try {
    const result = await request({action: "entry", phone: data.get("phone"), photo: await photoData(data.get("pass"))});
    entry = {session: result.session, completed: result.completed || []};
    saveEntry();
    form.reset();
    openChallenges();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function json(url) {
  const response = await fetch(url, {cache: "no-cache"});
  if (!response.ok) throw new Error("Challenge details could not load. Please refresh.");
  return response.json();
}

try {
  [catalog, {submissionUrl: endpoint}] = await Promise.all([
    json("challenge-questions.json"), json("challenge-config.json")
  ]);
  byId("download").disabled = false;
  byId("download").onclick = downloadPDF;
  if (endpoint) {
    byId("continue").disabled = false;
    if (entry?.session && Array.isArray(entry.completed)) openChallenges();
  } else {
    byId("entry-status").textContent = "Challenge uploads are opening soon.";
  }
} catch (error) {
  byId("entry-status").textContent = error.message;
}
