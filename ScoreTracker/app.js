// Score Tracker App
// Data persisted to localStorage under key "score-tracker-state-v2" (migrates from v1 if present)

// ---------- Storage Keys and Migration ----------
const STORAGE_KEY_V2 = "score-tracker-state-v2";
const STORAGE_KEY_V1 = "score-tracker-state-v1";

// ---------- State ----------
const defaultState = () => ({
  players: [], // {id, name, overall, color?:"#RRGGBB"|""}
  teams: [], // {id, name, members: [playerId], color?:"#RRGGBB"|""}
  ui: {
    mode: "team", // "solo" | "team"
    awardValue: 1,
    useGamePointsAward: false,
  },
  game: {
    mode: "team", // mirrors ui.mode
    solo: {
      active: {}, // {playerId: true}
      scores: {}, // {playerId: number}
    },
    team: {
      scores: {}, // {teamId: number}
    },
  },
});

let state = loadState();

// ---------- Utils ----------
function saveState() {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
}

function migrateV1toV2(v1) {
  // Add color fields to players and teams
  const withColors = {
    ...v1,
    players: (v1.players || []).map((p) => ({ ...p, color: p.color || "" })),
    teams: (v1.teams || []).map((t) => ({ ...t, color: t.color || "" })),
  };
  return withColors;
}

function loadState() {
  try {
    // Prefer v2
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      return normalizeState(parsed);
    }
    // Try v1 and migrate
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const parsedV1 = JSON.parse(rawV1);
      const migrated = migrateV1toV2(parsedV1);
      const normalized = normalizeState(migrated);
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(normalized));
      return normalized;
    }
    // Fresh
    return defaultState();
  } catch (e) {
    console.warn("Failed to load state; starting fresh.", e);
    return defaultState();
  }
}

function normalizeState(parsed) {
  return {
    ...defaultState(),
    ...parsed,
    players: (parsed.players || []).map((p) => ({
      id: p.id,
      name: p.name,
      overall: p.overall ?? 0,
      color: p.color || "",
    })),
    teams: (parsed.teams || []).map((t) => ({
      id: t.id,
      name: t.name,
      members: Array.isArray(t.members) ? t.members : [],
      color: t.color || "",
    })),
    ui: { ...defaultState().ui, ...(parsed.ui || {}) },
    game: {
      ...defaultState().game,
      ...(parsed.game || {}),
      solo: { ...defaultState().game.solo, ...((parsed.game || {}).solo || {}) },
      team: { ...defaultState().game.team, ...((parsed.game || {}).team || {}) },
    },
  };
}

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(2, 6);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getPlayer(id) {
  return state.players.find((p) => p.id === id);
}
function getTeam(id) {
  return state.teams.find((t) => t.id === id);
}

function playerInAnyTeam(playerId) {
  return state.teams.some((t) => t.members.includes(playerId));
}

function removePlayerFromAllTeams(playerId) {
  state.teams.forEach((t) => {
    t.members = t.members.filter((id) => id !== playerId);
  });
}

function ensureScoresExist() {
  // Initialize solo scores for active players
  state.players.forEach((p) => {
    if (state.game.solo.active[p.id]) {
      if (typeof state.game.solo.scores[p.id] !== "number") state.game.solo.scores[p.id] = 0;
    }
  });
  // Initialize team scores
  state.teams.forEach((t) => {
    if (typeof state.game.team.scores[t.id] !== "number") state.game.team.scores[t.id] = 0;
  });
}

// --------- Color Helpers ----------
function toHex6(hex) {
  if (!hex) return "";
  let h = hex.trim();
  if (h[0] !== "#") h = "#" + h;
  if (h.length === 4) {
    // #RGB -> #RRGGBB
    const r = h[1],
      g = h[2],
      b = h[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (h.length === 7) return h.toUpperCase();
  return ""; // unsupported
}
function hexToRgb(hex) {
  const h = toHex6(hex);
  if (!h) return null;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return { r, g, b };
}
function relativeLuminance({ r, g, b }) {
  // W3C formula
  const srgb = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}
function contrastTextColor(bgHex) {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return ""; // default
  const L = relativeLuminance(rgb);
  // Choose black text if background is light, else white
  return L > 0.179 ? "#000000" : "#FFFFFF";
}

// ---------- DOM ----------
const el = {
  modeSolo: document.getElementById("modeSolo"),
  modeTeam: document.getElementById("modeTeam"),
  awardValue: document.getElementById("awardValue"),
  useGamePointsAward: document.getElementById("useGamePointsAward"),
  resetGameBtn: document.getElementById("resetGameBtn"),
  awardWinnersBtn: document.getElementById("awardWinnersBtn"),

  // Sidebar players
  newPlayerName: document.getElementById("newPlayerName"),
  addPlayerBtn: document.getElementById("addPlayerBtn"),
  resetAllOverallBtn: document.getElementById("resetAllOverallBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importFile: document.getElementById("importFile"),
  playersList: document.getElementById("playersList"),

  // Solo
  soloPanel: document.getElementById("soloPanel"),
  soloToggleAll: document.getElementById("soloToggleAll"),
  soloGameList: document.getElementById("soloGameList"),

  // Teams
  teamPanel: document.getElementById("teamPanel"),
  newTeamName: document.getElementById("newTeamName"),
  addTeamBtn: document.getElementById("addTeamBtn"),
  reshuffleBtn: document.getElementById("reshuffleBtn"),
  teamsList: document.getElementById("teamsList"),
  teamGameList: document.getElementById("teamGameList"),
};

// ---------- Event Listeners: Header ----------
el.modeSolo.addEventListener("change", () => {
  if (el.modeSolo.checked) {
    state.ui.mode = "solo";
    state.game.mode = "solo";
    saveState();
    render();
  }
});
el.modeTeam.addEventListener("change", () => {
  if (el.modeTeam.checked) {
    state.ui.mode = "team";
    state.game.mode = "team";
    saveState();
    render();
  }
});
el.awardValue.addEventListener("change", () => {
  const v = parseInt(el.awardValue.value || "1", 10);
  state.ui.awardValue = clamp(v, 1, 1_000_000);
  el.awardValue.value = state.ui.awardValue;
  saveState();
});
el.useGamePointsAward.addEventListener("change", () => {
  state.ui.useGamePointsAward = !!el.useGamePointsAward.checked;
  saveState();
});
el.resetGameBtn.addEventListener("click", () => {
  if (!confirm("Reset current game's scores?")) return;
  resetGameScores();
  saveState();
  renderGame();
});
el.awardWinnersBtn.addEventListener("click", () => {
  awardWinners();
});

// ---------- Event Listeners: Sidebar Players ----------
el.addPlayerBtn.addEventListener("click", () => {
  const name = (el.newPlayerName.value || "").trim();
  if (!name) return alert("Enter a player name.");
  addPlayer(name);
  el.newPlayerName.value = "";
});
el.newPlayerName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") el.addPlayerBtn.click();
});
el.resetAllOverallBtn.addEventListener("click", () => {
  if (!state.players.length) return;
  if (!confirm("Set all players' overall scores to 0?")) return;
  state.players.forEach((p) => (p.overall = 0));
  saveState();
  renderPlayers();
});
el.exportBtn.addEventListener("click", () => {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "score-tracker-state.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
el.importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    // quick structural check
    if (!imported || typeof imported !== "object" || !Array.isArray(imported.players) || !imported.game) {
      alert("Invalid file format.");
      return;
    }
    if (!confirm("Importing will overwrite current data. Continue?")) return;
    const normalized = normalizeState(imported);
    state = normalized;
    saveState();
    render();
  } catch (err) {
    console.error(err);
    alert("Failed to import file.");
  } finally {
    e.target.value = "";
  }
});

// ---------- Event Listeners: Solo ----------
el.soloToggleAll.addEventListener("change", () => {
  const checked = el.soloToggleAll.checked;
  state.players.forEach((p) => (state.game.solo.active[p.id] = checked));
  ensureScoresExist();
  saveState();
  renderSoloGame();
});

// ---------- Event Listeners: Teams ----------
el.addTeamBtn.addEventListener("click", () => {
  const name = (el.newTeamName.value || "").trim();
  if (!name) return alert("Enter a team name.");
  addTeam(name);
  el.newTeamName.value = "";
});
el.newTeamName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") el.addTeamBtn.click();
});
el.reshuffleBtn.addEventListener("click", () => {
  reshuffleTeams();
});

// ---------- Actions ----------
function addPlayer(name) {
  if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    if (!confirm(`Player "${name}" already exists. Add anyway?`)) return;
  }
  const p = { id: uid("p_"), name, overall: 0, color: "" };
  state.players.push(p);
  // default: activate in solo game
  state.game.solo.active[p.id] = true;
  ensureScoresExist();
  saveState();
  renderPlayers();
  renderGame();
}

function editPlayerName(id) {
  const p = getPlayer(id);
  if (!p) return;
  const newName = prompt("Edit player name:", p.name);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  p.name = trimmed;
  saveState();
  renderPlayers();
  renderGame();
}

function setPlayerOverall(id) {
  const p = getPlayer(id);
  if (!p) return;
  const val = prompt(`Set overall score for ${p.name}:`, String(p.overall));
  if (val === null) return;
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return alert("Invalid number.");
  p.overall = clamp(n, -1_000_000, 1_000_000);
  saveState();
  renderPlayers();
}

function removePlayer(id) {
  const p = getPlayer(id);
  if (!p) return;
  if (!confirm(`Remove player "${p.name}"? This also removes them from teams and game.`)) return;
  // Remove from teams
  removePlayerFromAllTeams(id);
  // Remove from solo active and scores
  delete state.game.solo.active[id];
  delete state.game.solo.scores[id];
  // Remove from players
  state.players = state.players.filter((x) => x.id !== id);
  saveState();
  render();
}

function adjustOverall(id, delta) {
  const p = getPlayer(id);
  if (!p) return;
  p.overall = clamp(p.overall + delta, -1_000_000, 1_000_000);
  saveState();
  renderPlayers();
}

function setPlayerColor(id, hex) {
  const p = getPlayer(id);
  if (!p) return;
  const norm = toHex6(hex);
  p.color = norm || "";
  saveState();
  renderPlayers();
  renderGame();
}
function clearPlayerColor(id) {
  const p = getPlayer(id);
  if (!p) return;
  p.color = "";
  saveState();
  renderPlayers();
  renderGame();
}

function toggleSoloActive(playerId, active) {
  state.game.solo.active[playerId] = !!active;
  if (active && typeof state.game.solo.scores[playerId] !== "number") {
    state.game.solo.scores[playerId] = 0;
  }
  saveState();
  renderSoloGame();
}

function soloScoreAdjust(playerId, delta) {
  const current = state.game.solo.scores[playerId] || 0;
  state.game.solo.scores[playerId] = clamp(current + delta, -1_000_000, 1_000_000);
  saveState();
  renderSoloGame();
}

function soloScoreSet(playerId) {
  const current = state.game.solo.scores[playerId] || 0;
  const val = prompt("Set game score:", String(current));
  if (val === null) return;
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return alert("Invalid number.");
  state.game.solo.scores[playerId] = clamp(n, -1_000_000, 1_000_000);
  saveState();
  renderSoloGame();
}

function resetGameScores() {
  if (state.game.mode === "solo") {
    Object.keys(state.game.solo.scores).forEach((id) => (state.game.solo.scores[id] = 0));
  } else {
    Object.keys(state.game.team.scores).forEach((id) => (state.game.team.scores[id] = 0));
  }
  saveState();
}

function addTeam(name) {
  if (state.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    if (!confirm(`Team "${name}" already exists. Add anyway?`)) return;
  }
  const t = { id: uid("t_"), name, members: [], color: "" };
  state.teams.push(t);
  // init game score
  state.game.team.scores[t.id] = 0;
  saveState();
  renderTeams();
  renderTeamGame();
}

function renameTeam(teamId) {
  const t = getTeam(teamId);
  if (!t) return;
  const newName = prompt("Rename team:", t.name);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  t.name = trimmed;
  saveState();
  renderTeams();
  renderTeamGame();
}

function setTeamColor(teamId, hex) {
  const t = getTeam(teamId);
  if (!t) return;
  t.color = toHex6(hex) || "";
  saveState();
  renderTeams();
  renderTeamGame();
}
function clearTeamColor(teamId) {
  const t = getTeam(teamId);
  if (!t) return;
  t.color = "";
  saveState();
  renderTeams();
  renderTeamGame();
}

function deleteTeam(teamId) {
  const t = getTeam(teamId);
  if (!t) return;
  if (!confirm(`Delete team "${t.name}"?`)) return;
  delete state.game.team.scores[teamId];
  state.teams = state.teams.filter((x) => x.id !== teamId);
  saveState();
  renderTeams();
  renderTeamGame();
}

function addMember(teamId, playerId) {
  const t = getTeam(teamId);
  if (!t) return;
  if (playerInAnyTeam(playerId)) {
    // Remove from current team first
    removePlayerFromAllTeams(playerId);
  }
  t.members.push(playerId);
  saveState();
  renderTeams();
}

function removeMember(teamId, playerId) {
  const t = getTeam(teamId);
  if (!t) return;
  t.members = t.members.filter((id) => id !== playerId);
  saveState();
  renderTeams();
}

function teamScoreAdjust(teamId, delta) {
  const current = state.game.team.scores[teamId] || 0;
  state.game.team.scores[teamId] = clamp(current + delta, -1_000_000, 1_000_000);
  saveState();
  renderTeamGame();
}

function teamScoreSet(teamId) {
  const current = state.game.team.scores[teamId] || 0;
  const val = prompt("Set team game score:", String(current));
  if (val === null) return;
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return alert("Invalid number.");
  state.game.team.scores[teamId] = clamp(n, -1_000_000, 1_000_000);
  saveState();
  renderTeamGame();
}

function reshuffleTeams() {
  if (state.teams.length < 2) {
    alert("Create at least two teams to reshuffle.");
    return;
  }
  const allPlayers = [...state.players];
  if (!allPlayers.length) {
    alert("No players to reshuffle.");
    return;
  }
  // Shuffle players
  const shuffled = allPlayers.map((p) => p.id).sort(() => Math.random() - 0.5);
  // Clear all teams
  state.teams.forEach((t) => (t.members = []));
  // Distribute evenly
  let i = 0;
  for (const pid of shuffled) {
    const team = state.teams[i % state.teams.length];
    team.members.push(pid);
    i++;
  }
  saveState();
  renderTeams();
}

// Award winners: update players' overall and reset game scores
function awardWinners() {
  if (state.game.mode === "solo") {
    const activeIds = state.players.filter((p) => state.game.solo.active[p.id]).map((p) => p.id);
    if (!activeIds.length) return alert("No active players in this game.");
    let maxScore = -Infinity;
    activeIds.forEach((id) => {
      const s = state.game.solo.scores[id] || 0;
      if (s > maxScore) maxScore = s;
    });
    const winners = activeIds.filter((id) => (state.game.solo.scores[id] || 0) === maxScore);
    if (!winners.length) return alert("No winners determined.");
    let awardMap = {};
    if (state.ui.useGamePointsAward) {
      // award equal to their own game score
      winners.forEach((id) => {
        awardMap[id] = state.game.solo.scores[id] || 0;
      });
    } else {
      winners.forEach((id) => (awardMap[id] = state.ui.awardValue || 1));
    }
    // Apply awards
    for (const [pid, inc] of Object.entries(awardMap)) {
      const p = getPlayer(pid);
      if (p) p.overall = clamp(p.overall + (inc || 0), -1_000_000, 1_000_000);
    }
    // Reset game scores
    Object.keys(state.game.solo.scores).forEach((id) => (state.game.solo.scores[id] = 0));
    saveState();
    renderPlayers();
    renderSoloGame();
    alert(`Awarded winners: ${winners.map((id) => getPlayer(id)?.name).join(", ")}`);
  } else {
    if (!state.teams.length) return alert("No teams available.");
    let maxScore = -Infinity;
    state.teams.forEach((t) => {
      const s = state.game.team.scores[t.id] || 0;
      if (s > maxScore) maxScore = s;
    });
    const winningTeams = state.teams.filter((t) => (state.game.team.scores[t.id] || 0) === maxScore);
    if (!winningTeams.length) return alert("No winners determined.");
    // Compute award per player
    const perPlayerInc = {};
    if (state.ui.useGamePointsAward) {
      // Each player's award equals their team's game score
      winningTeams.forEach((t) => {
        const teamPoints = state.game.team.scores[t.id] || 0;
        t.members.forEach((pid) => {
          perPlayerInc[pid] = (perPlayerInc[pid] || 0) + teamPoints;
        });
      });
    } else {
      winningTeams.forEach((t) => {
        t.members.forEach((pid) => {
          perPlayerInc[pid] = (perPlayerInc[pid] || 0) + (state.ui.awardValue || 1);
        });
      });
    }
    // Apply
    Object.entries(perPlayerInc).forEach(([pid, inc]) => {
      const p = getPlayer(pid);
      if (p) p.overall = clamp(p.overall + inc, -1_000_000, 1_000_000);
    });
    // Reset game team scores
    Object.keys(state.game.team.scores).forEach((id) => (state.game.team.scores[id] = 0));
    saveState();
    renderPlayers();
    renderTeamGame();
    const teamNames = winningTeams.map((t) => t.name).join(", ");
    alert(`Awarded winning team(s): ${teamNames}`);
  }
}

// ---------- Rendering ----------
function applyColoring(containerEl, bgHex) {
  const hex = toHex6(bgHex);
  if (!hex) {
    containerEl.classList.remove("colored");
    containerEl.style.backgroundColor = "";
    containerEl.style.color = "";
    containerEl.style.borderColor = "";
    return;
  }
  const fg = contrastTextColor(hex);
  containerEl.classList.add("colored");
  containerEl.style.backgroundColor = hex;
  containerEl.style.color = fg;
  // Subtle border based on contrast
  containerEl.style.borderColor = fg === "#000000" ? "#00000020" : "#FFFFFF20";
}

function render() {
  // Header controls
  el.modeSolo.checked = state.ui.mode === "solo";
  el.modeTeam.checked = state.ui.mode === "team";
  el.awardValue.value = state.ui.awardValue;
  el.useGamePointsAward.checked = state.ui.useGamePointsAward;

  // Panels
  el.soloPanel.hidden = state.ui.mode !== "solo";
  el.teamPanel.hidden = state.ui.mode !== "team";

  ensureScoresExist();

  renderPlayers();
  renderGame();
}

function renderPlayers() {
  const container = el.playersList;
  container.innerHTML = "";
  if (!state.players.length) {
    const div = document.createElement("div");
    div.className = "small";
    div.textContent = "No players yet. Add some above.";
    container.appendChild(div);
    return;
  }
  state.players
    .slice()
    .sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name))
    .forEach((p) => {
      const row = document.createElement("div");
      row.className = "row";

      // Apply coloring if set
      if (p.color) applyColoring(row, p.color);
      else applyColoring(row, "");

      const left = document.createElement("div");
      left.className = "row-content";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name;
      const score = document.createElement("span");
      score.className = "badge";
      score.textContent = `Overall: ${p.overall}`;
      left.appendChild(name);
      left.appendChild(score);

      const right = document.createElement("div");
      right.className = "row-actions";

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "color-input";
      colorInput.value = p.color || "#666666";
      colorInput.title = "Set player color";
      colorInput.addEventListener("input", () => setPlayerColor(p.id, colorInput.value));

      const clearColorBtn = document.createElement("button");
      clearColorBtn.textContent = "Clear";
      clearColorBtn.title = "Clear player color";
      clearColorBtn.addEventListener("click", () => clearPlayerColor(p.id));

      const minus = document.createElement("button");
      minus.textContent = "-1";
      minus.title = "Decrease overall";
      minus.addEventListener("click", () => adjustOverall(p.id, -1));
      const plus = document.createElement("button");
      plus.textContent = "+1";
      plus.title = "Increase overall";
      plus.addEventListener("click", () => adjustOverall(p.id, +1));
      const setBtn = document.createElement("button");
      setBtn.textContent = "Set";
      setBtn.title = "Set overall score";
      setBtn.addEventListener("click", () => setPlayerOverall(p.id));
      const edit = document.createElement("button");
      edit.className = "link";
      edit.textContent = "Rename";
      edit.addEventListener("click", () => editPlayerName(p.id));
      const remove = document.createElement("button");
      remove.className = "danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => removePlayer(p.id));

      right.append(colorInput, clearColorBtn, minus, plus, setBtn, edit, remove);

      row.append(left, right);
      container.appendChild(row);
    });
}

function renderGame() {
  if (state.ui.mode === "solo") {
    renderSoloGame();
  } else {
    renderTeams();
    renderTeamGame();
  }
}

function renderSoloGame() {
  el.soloGameList.innerHTML = "";
  const players = state.players.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!players.length) {
    const div = document.createElement("div");
    div.className = "small";
    div.textContent = "No players. Add players in the sidebar.";
    el.soloGameList.appendChild(div);
    el.soloToggleAll.checked = false;
    return;
  }
  const activeCount = players.filter((p) => state.game.solo.active[p.id]).length;
  el.soloToggleAll.checked = activeCount === players.length && players.length > 0;

  players.forEach((p) => {
    const active = !!state.game.solo.active[p.id];
    const score = state.game.solo.scores[p.id] || 0;

    const row = document.createElement("div");
    row.className = "row";
    if (p.color) applyColoring(row, p.color);
    else applyColoring(row, "");

    const left = document.createElement("div");
    left.className = "row-content";
    const chkLabel = document.createElement("label");
    chkLabel.className = "checkbox";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = active;
    chk.addEventListener("change", () => toggleSoloActive(p.id, chk.checked));
    const name = document.createElement("span");
    name.textContent = p.name;
    chkLabel.append(chk, name);

    const overall = document.createElement("span");
    overall.className = "badge";
    overall.textContent = `Overall: ${p.overall}`;

    left.append(chkLabel, overall);

    const right = document.createElement("div");
    right.className = "row-actions";
    const minus = document.createElement("button");
    minus.textContent = "-";
    minus.title = "Decrease game score";
    minus.disabled = !active;
    minus.addEventListener("click", () => soloScoreAdjust(p.id, -1));
    const sc = document.createElement("span");
    sc.className = "score";
    sc.textContent = String(score);
    sc.title = "Click to set score";
    sc.style.cursor = "pointer";
    sc.addEventListener("click", () => soloScoreSet(p.id));
    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.title = "Increase game score";
    plus.disabled = !active;
    plus.addEventListener("click", () => soloScoreAdjust(p.id, +1));

    right.append(minus, sc, plus);

    row.append(left, right);
    el.soloGameList.appendChild(row);
  });
}

function renderTeams() {
  const container = el.teamsList;
  container.innerHTML = "";
  if (!state.teams.length) {
    const div = document.createElement("div");
    div.className = "small";
    div.textContent = "No teams yet. Create teams on the left, then add members.";
    container.appendChild(div);
    return;
  }

  // Build set of assigned players to disable duplicate add in select
  const assigned = new Set(state.teams.flatMap((t) => t.members));

  state.teams.forEach((t) => {
    const card = document.createElement("div");
    card.className = "team-card";
    if (t.color) applyColoring(card, t.color);
    else applyColoring(card, "");

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "8px";

    const leftHeader = document.createElement("div");
    leftHeader.style.display = "flex";
    leftHeader.style.alignItems = "center";
    leftHeader.style.gap = "8px";

    const title = document.createElement("h4");
    title.textContent = t.name;

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "color-input";
    colorInput.value = t.color || "#666666";
    colorInput.title = "Set team color";
    colorInput.addEventListener("input", () => setTeamColor(t.id, colorInput.value));

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.title = "Clear team color";
    clearBtn.addEventListener("click", () => clearTeamColor(t.id));

    leftHeader.append(title, colorInput, clearBtn);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const renameBtn = document.createElement("button");
    renameBtn.className = "link";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", () => renameTeam(t.id));
    const removeBtn = document.createElement("button");
    removeBtn.className = "danger";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", () => deleteTeam(t.id));

    actions.append(renameBtn, removeBtn);
    header.append(leftHeader, actions);

    const membersWrap = document.createElement("div");
    membersWrap.className = "team-members";
    if (!t.members.length) {
      const span = document.createElement("span");
      span.className = "small";
      span.textContent = "No members";
      membersWrap.appendChild(span);
    } else {
      t.members
        .map((id) => getPlayer(id))
        .filter(Boolean)
        .forEach((p) => {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = p.name;
          const x = document.createElement("button");
          x.title = "Remove from team";
          x.textContent = "×";
          x.addEventListener("click", () => removeMember(t.id, p.id));
          tag.appendChild(x);
          membersWrap.appendChild(tag);
        });
    }

    const addWrap = document.createElement("div");
    addWrap.className = "controls";
    const select = document.createElement("select");
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Add member…";
    select.appendChild(defaultOpt);

    // options = players not already in current team, show if in another team
    const options = state.players.filter((p) => !t.members.includes(p.id)).map((p) => ({ p, assigned: assigned.has(p.id) }));

    options.forEach(({ p, assigned }) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = assigned ? `${p.name} (in another team)` : p.name;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const pid = select.value;
      if (!pid) return;
      addMember(t.id, pid);
    });
    addWrap.appendChild(select);

    card.append(header, membersWrap, addWrap);
    container.appendChild(card);
  });
}

function renderTeamGame() {
  const container = el.teamGameList;
  container.innerHTML = "";
  if (!state.teams.length) {
    const div = document.createElement("div");
    div.className = "small";
    div.textContent = "Create teams to start a team game.";
    container.appendChild(div);
    return;
  }
  state.teams.forEach((t) => {
    const score = state.game.team.scores[t.id] || 0;

    const row = document.createElement("div");
    row.className = "row";
    if (t.color) applyColoring(row, t.color);
    else applyColoring(row, "");

    const left = document.createElement("div");
    left.className = "row-content";
    const name = document.createElement("span");
    name.textContent = t.name;
    const membersCount = document.createElement("span");
    membersCount.className = "badge";
    membersCount.textContent = `${t.members.length} member${t.members.length === 1 ? "" : "s"}`;
    left.append(name, membersCount);

    const right = document.createElement("div");
    right.className = "row-actions";
    const minus = document.createElement("button");
    minus.textContent = "-";
    minus.title = "Decrease game score";
    minus.addEventListener("click", () => teamScoreAdjust(t.id, -1));
    const sc = document.createElement("span");
    sc.className = "score";
    sc.textContent = String(score);
    sc.title = "Click to set score";
    sc.style.cursor = "pointer";
    sc.addEventListener("click", () => teamScoreSet(t.id));
    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.title = "Increase game score";
    plus.addEventListener("click", () => teamScoreAdjust(t.id, +1));

    right.append(minus, sc, plus);

    row.append(left, right);
    container.appendChild(row);
  });
}

// ---------- Init ----------
render();
