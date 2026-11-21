const byId = id => document.getElementById(id);
const make = (tag, text) => Object.assign(document.createElement(tag), {textContent: text});
const storageKey = "run-along-challenge-progress";
let catalog, endpoint, activeLevel = -1;
let gameTimer;
let photoRunUnlocked = false;
const testingMode = true;
let entry = null;
try {
  entry = JSON.parse(sessionStorage.getItem(storageKey));
  if (entry && !entry.reviews) entry.completed = [];
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
    total += Math.min(count, level.scoringLimit ?? count) * (level.points || 0);
    const button = byId("levels").children[index].querySelector("button");
    button.querySelector(".level-count").textContent = count + "/" + level.tasks.length;
  });
  total += ["OPEN-03", "OPEN-04"].filter(id => entry.reviews?.[id] === "Winner").length * 4;
  byId("score").textContent = "Total points: " + total;
  if (activeLevel >= 0) {
    const level = catalog[activeLevel];
    byId("level-progress").textContent = "Challenges completed: " + levelCount(level) + "/" + level.tasks.length;
  }
}

function displayLevel(index) {
  const section = byId("tasks");
  const tiles = byId("levels").children;
  const isClosing = activeLevel === index;
  activeLevel = isClosing ? -1 : index;
  section.hidden = isClosing;
  if (!isClosing) tiles[index].append(section);
  const level = catalog[index];
  [...byId("levels").children].forEach((tile, i) => {
    tile.querySelector("button").setAttribute("aria-expanded", String(i === activeLevel));
    tile.querySelector("button").setAttribute("aria-pressed", String(i === activeLevel));
  });
  if (isClosing) return;
  const progress = make("p", "");
  progress.id = "level-progress";
  progress.setAttribute("role", "status");
  section.replaceChildren(make("h2", levelLabel(level)), progress);
  updateProgress();
  if (level.scoringLimit) section.append(make("p", "Complete any 3 of 5 for up to " + level.scoringLimit * level.points + " points."));
  if (level.rule) section.append(make("p", level.rule));
  if (!level.tasks.length) section.append(make("p", "Tasks coming soon."));
  for (const task of level.tasks) {
    const card = document.createElement("article");
    card.append(make("h3", task.title), make("p", task.text));
    const references = byId("location-references");
    if (task.referencePhotos && references) card.append(references.content.cloneNode(true));
    section.append(card);
    const review = entry.reviews?.[task.id];
    if (entry.completed.includes(task.id) || review === "Pending") {
      const label = entry.preview ? "Test submission complete" :
        review === "Winner" ? "Award winner · 4 points" :
        review === "Approved" ? "Approved" : "Submitted for review";
      card.append(make("p", label));
      continue;
    }
    if (review === "Rejected") card.append(make("p", "Photo rejected. You can submit a new photo."));
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
        const result = currentEntry.preview ? null : await request({
          action: "task", session: currentEntry.session, id: task.id, title: task.title,
          caption: caption?.value.trim() || "", photo: await photoData(photo.files[0])
        });
        if (entry !== currentEntry) return;
        if (entry.preview) {
          if (!entry.completed.includes(task.id)) entry.completed.push(task.id);
        } else if (result.reviews) {
          entry.completed = result.completed;
          entry.reviews = result.reviews;
        } else {
          entry.reviews = {...entry.reviews, [task.id]: "Pending"};
        }
        if (!currentEntry.preview) saveEntry();
        updateProgress();
        form.replaceWith(make("p", entry.preview ? "Test submission complete" : "Submitted for review"));
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }
}

function openChallenges() {
  byId("preview-notice").hidden = !entry.preview;
  if (byId("refresh-score")) byId("refresh-score").hidden = entry.preview;
  byId("entry").hidden = true;
  byId("play").hidden = false;
  const tasks = byId("tasks");
  tasks.hidden = true;
  byId("game-levels").append(tasks);
  activeLevel = -1;
  byId("game-guide").hidden = false;
  byId("enter-game").hidden = false;
  byId("game-loading").hidden = true;
  byId("game-levels").hidden = true;
  byId("levels").replaceChildren(...catalog.map((level, index) => {
    const tile = make("div", "");
    const button = make("button", level.title);
    const count = make("span", "");
    count.className = "level-count";
    button.append(count);
    button.setAttribute("aria-pressed", "false");
    button.onclick = () => displayLevel(index);
    tile.append(button);
    button.setAttribute("aria-expanded", "false");
    if (level.kind === "awards") {
      tile.className = "scored-level awards-level";
      const label = make("span", level.title);
      const hint = make("span", "Enter to open");
      hint.className = "awards-hint";
      label.append(hint);
      button.replaceChildren(label, count);
    }
    if (level.points) {
      tile.className = "scored-level";
      const rate = make("small", level.points + (level.points === 1 ? " point per challenge" : " points per challenge"));
      tile.append(rate);
    }
    return tile;
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

async function downloadPDF() {
  const button = byId("download");
  button.disabled = true;
  try {
    await buildChallengePDF();
  } catch {
    byId("download-status").textContent = "The PDF could not be downloaded. Please try again.";
  } finally {
    button.disabled = false;
  }
}

async function buildChallengePDF() {
  byId("download-status").textContent = "";
  const lines = [
    "RUN ALONG. | ISTEDA x EL FORSA", "PhotoRun | Dubai Run Challenge Card", "",
    "Take your photos offline. Return to PhotoRun to upload after the run.", ""
  ];
  for (const level of catalog) {
    lines.push(levelLabel(level).toUpperCase());
    if (level.scoringLimit) lines.push("Complete any 3 of 5 for up to " + level.scoringLimit * level.points + " points.");
    if (level.rule) lines.push(...wrap(level.rule));
    if (!level.tasks.length) lines.push("Tasks coming soon.");
    for (const task of level.tasks) lines.push(...wrap("[ ] " + task.title + " - " + task.text), "");
    lines.push("");
  }
  const pages = [];
  for (let i = 0; i < lines.length; i += 45) pages.push(lines.slice(i, i + 45));
  const referenceFigures = Array.from(byId("location-references")?.content.querySelectorAll("figure") || []);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
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
  const pageRefs = pages.map((_, i) => (4 + i * 2) + " 0 R");
  for (const figure of referenceFigures) {
    const source = figure.querySelector("img");
    const caption = figure.querySelector("figcaption").textContent;
    const bitmap = await createImageBitmap(await (await fetch(source.src)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = atob(canvas.toDataURL("image/jpeg", 0.82).split(",")[1]);
    const hex = Array.from(jpeg, byte => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("") + ">";
    const imageId = objects.push("<< /Type /XObject /Subtype /Image /Width " + canvas.width +
      " /Height " + canvas.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8" +
      " /Filter [/ASCIIHexDecode /DCTDecode] /Length " + hex.length + " >>\nstream\n" + hex + "\nendstream");
    const height = Math.round(499 * canvas.height / canvas.width);
    const stream = "BT /F1 16 Tf 48 790 Td (Level 2 Q4 - " + caption + ") Tj ET\n" +
      "q 499 0 0 " + height + " 48 " + (750 - height) + " cm /ReferencePhoto Do Q\n";
    const contentId = objects.push("<< /Length " + stream.length + " >>\nstream\n" + stream + "endstream");
    const pageId = objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]" +
      " /Resources << /Font << /F1 3 0 R >> /XObject << /ReferencePhoto " + imageId +
      " 0 R >> >> /Contents " + contentId + " 0 R >>");
    pageRefs.push(pageId + " 0 R");
  }
  objects[1] = "<< /Type /Pages /Count " + pageRefs.length + " /Kids [" + pageRefs.join(" ") + "] >>";
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


byId("game-passcode-form")?.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const passcode = form.elements.passcode;
  if (passcode.value.trim() !== "1010") {
    byId("game-passcode-status").textContent = "Incorrect passcode. Try again.";
    passcode.select();
    return;
  }
  photoRunUnlocked = true;
  form.reset();
  form.hidden = true;
  byId("game-passcode-status").textContent = "";
  byId("entry").hidden = false;
  if (endpoint && entry?.session && Array.isArray(entry.completed)) openChallenges();
  else byId("verify").elements.phone.focus();
});

function showGameRules() {
  clearTimeout(gameTimer);
  byId("game-loading").hidden = true;
  byId("game-levels").hidden = true;
  byId("game-guide").hidden = false;
  byId("enter-game").hidden = false;
  byId("enter-game").focus();
}

function showGameLevels() {
  byId("game-guide").hidden = true;
  byId("enter-game").hidden = true;
  byId("game-loading").hidden = true;
  byId("game-levels").hidden = false;
  byId("choose-level").focus();
}

window.addEventListener("popstate", event => {
  if (!photoRunUnlocked || !entry || byId("play").hidden) return;
  clearTimeout(gameTimer);
  if (event.state?.photoRunScreen === "levels") showGameLevels();
  else showGameRules();
});

byId("back-to-rules")?.addEventListener("click", () => {
  if (history.state?.photoRunScreen === "levels") history.back();
  else showGameRules();
});

byId("enter-game").onclick = () => {
  if (history.state?.photoRunScreen !== "levels") {
    history.pushState({photoRunScreen: "levels"}, "");
  }
  byId("game-guide").hidden = true;
  byId("enter-game").hidden = true;
  byId("game-loading").hidden = false;
  const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 4000;
  gameTimer = setTimeout(showGameLevels, delay);
};

byId("different-entry").onclick = () => {
  clearTimeout(gameTimer);
  if (history.state?.photoRunScreen === "levels") history.back();
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
  if ((!endpoint && !testingMode) || !photoRunUnlocked) return;
  button.disabled = true;
  form.setAttribute("aria-busy", "true");
  const loadingStarted = performance.now();
  const photo = data.get("pass");
  const preview = testingMode && !photo?.size;
  status.textContent = preview ? "Opening the test game…" : "Checking your number and uploading your admit card photo…";
  try {
    const result = preview ? null : await request({action: "entry", phone: data.get("phone"), photo: await photoData(photo)});
    const remaining = Math.max(0, 3000 - (performance.now() - loadingStarted));
    if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    entry = {session: result?.session, completed: result?.reviews ? result.completed : [], reviews: result?.reviews || {}, preview};
    status.textContent = "";
    if (!preview) saveEntry();
    form.reset();
    openChallenges();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    form.removeAttribute("aria-busy");
    button.disabled = false;
  }
});

async function json(url) {
  const response = await fetch(url, {cache: "no-cache"});
  if (!response.ok) throw new Error("Challenge details could not load. Please refresh.");
  return response.json();
}

try {
  const photoInput = byId("verify").elements.pass;
  photoInput.required = !testingMode;
  photoInput.closest("label").hidden = testingMode;
  photoInput.disabled = testingMode;
  byId("testing-note").hidden = !testingMode;
  [catalog, {submissionUrl: endpoint}] = await Promise.all([
    json("challenge-questions.json?v=numbered-questions"), json("challenge-config.json")
  ]);
  byId("download").disabled = false;
  byId("download").onclick = downloadPDF;
  if (endpoint || testingMode) {
    byId("continue").disabled = false;
    if (photoRunUnlocked && entry?.session && Array.isArray(entry.completed)) openChallenges();
  } else {
    byId("entry-status").textContent = "Challenge uploads are opening soon.";
  }
} catch (error) {
  byId("entry-status").textContent = error.message;
}

byId("refresh-score")?.addEventListener("click", async () => {
  const currentEntry = entry;
  if (!currentEntry?.session || currentEntry.preview) return;
  const button = byId("refresh-score");
  const status = byId("review-refresh-status");
  button.disabled = true;
  status.textContent = "";
  try {
    const result = await request({action: "status", session: currentEntry.session});
    if (entry !== currentEntry) return;
    entry.reviews = result.reviews;
    entry.completed = result.completed;
    saveEntry();
    const selected = activeLevel;
    if (selected >= 0) {
      activeLevel = -1;
      displayLevel(selected);
    } else updateProgress();
    status.textContent = "Review status updated.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
