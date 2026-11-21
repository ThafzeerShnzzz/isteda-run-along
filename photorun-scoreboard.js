const body = document.getElementById("photorun-ranking");
const status = document.getElementById("photorun-ranking-status");
const refresh = document.getElementById("photorun-ranking-refresh");

function ordinal(position) {
  const ending = position % 100;
  return position + (ending >= 11 && ending <= 13 ? "th" : ({1:"st",2:"nd",3:"rd"}[position % 10] || "th"));
}

async function loadScores() {
  refresh.disabled = true;
  status.textContent = "Loading scores…";
  try {
    const config = await fetch("./challenge-config.json", {cache: "no-store"});
    if (!config.ok) throw new Error("PhotoRun configuration unavailable.");
    const {submissionUrl} = await config.json();
    if (!submissionUrl) throw new Error("Scoreboard unavailable.");
    const response = await fetch(submissionUrl, {
      method: "POST",
      body: JSON.stringify({action:"leaderboard"}),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("Scoreboard unavailable.");
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.rankings)) throw new Error("Scoreboard unavailable.");
    body.replaceChildren(...data.rankings.map(player => {
      const row = document.createElement("tr");
      for (const value of [ordinal(player.position), player.name, player.score, player.completed + "/" + data.total]) {
        row.insertCell().textContent = value;
      }
      return row;
    }));
    status.textContent = data.rankings.length ? "" : "Scores will appear after the first photo approvals.";
  } catch {
    status.textContent = "Scores are currently unavailable. Try Refresh.";
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", loadScores);
loadScores();
