const byId = id => document.getElementById(id);
const make = (tag, text) => Object.assign(document.createElement(tag), {textContent: text});
let catalog, endpoint, activeLevel = 0;
let session = sessionStorage.getItem("run-along-entry") || "";

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

function displayLevel(index) {
  activeLevel = index;
  const level = catalog[index];
  const section = byId("tasks");
  for (const [i, button] of [...byId("levels").children].entries()) {
    button.setAttribute("aria-pressed", String(i === index));
  }
  section.replaceChildren(make("h2", level.title));
  if (level.rule) section.append(make("p", level.rule));
  if (!level.tasks.length) section.append(make("p", "Tasks coming soon."));
  for (const task of level.tasks) {
    const card = document.createElement("article");
    const form = document.createElement("form");
    const label = make("label", "Attach task photo");
    const photo = Object.assign(document.createElement("input"), {type: "file", accept: "image/*", required: true});
    const caption = Object.assign(document.createElement("input"), {type: "text", maxLength: 160, required: true});
    const button = make("button", "Submit Photo");
    const status = make("output", "");
    status.setAttribute("role", "status");
    label.append(photo);
    form.append(label);
    if (task.caption) {
      const captionLabel = make("label", "Caption");
      captionLabel.append(caption);
      form.append(captionLabel);
    }
    form.append(button, status);
    card.append(make("h3", task.title), make("p", task.text), form);
    section.append(card);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      button.disabled = true;
      status.textContent = "Uploading…";
      try {
        const photo = form.querySelector('input[type="file"]').files[0];
        const result = await request({
          action: "task", session, id: task.id, title: task.title,
          caption: caption.value.trim(), photo: await photoData(photo)
        });
        form.reset();
        status.textContent = result.already ? "Already submitted for review." : "Photo submitted for review.";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }
}

function openTasks() {
  byId("entry").hidden = true;
  byId("play").hidden = false;
  byId("levels").replaceChildren(...catalog.map((level, i) => {
    const button = make("button", level.title);
    button.onclick = () => displayLevel(i);
    return button;
  }));
  const switchEntry = make("button", "Use a different entry");
  switchEntry.onclick = () => {
    sessionStorage.removeItem("run-along-entry");
    session = "";
    byId("play").hidden = true;
    byId("entry").hidden = false;
    byId("entry-status").textContent = "";
  };
  byId("levels").append(switchEntry);
  displayLevel(activeLevel);
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
    "RUN ALONG. | ISTEDA x EL FORSA", "Dubai Run Challenge Card", "",
    "Take your photos offline. Return to the Challenges page to upload later.", ""
  ];
  for (const level of catalog) {
    lines.push(level.title.toUpperCase());
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
  const link = Object.assign(document.createElement("a"), {href: url, download: "RUN_ALONG_Challenge_Card.pdf"});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

byId("verify").addEventListener("submit", async event => {
  event.preventDefault();
  const button = byId("continue");
  const status = byId("entry-status");
  const data = new FormData(event.currentTarget);
  button.disabled = true;
  status.textContent = "Verifying and uploading…";
  try {
    const result = await request({action: "entry", phone: data.get("phone"), photo: await photoData(data.get("pass"))});
    session = result.session;
    sessionStorage.setItem("run-along-entry", session);
    openTasks();
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
  catalog = await json("challenge-questions.json");
  byId("download").disabled = false;
  byId("download").onclick = downloadPDF;
  ({submissionUrl: endpoint} = await json("challenge-config.json"));
  if (endpoint) {
    byId("continue").disabled = false;
    if (session) openTasks();
  } else {
    byId("entry-status").textContent = "Photo uploads are opening soon.";
  }
} catch (error) {
  byId("catalog-status").textContent = error.message;
}
