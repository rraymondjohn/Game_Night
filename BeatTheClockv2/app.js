// Beat the Clock - Multi-deck + "Show title before start" + Wikipedia image support
// - Multiple decks via decks/decks.json manifest
// - Deck selector + Random Deck
// - When a deck loads, show deck title; first item appears only after Start Game
// - Supports { type: "image", wiki: "Page Title" } to auto-fetch images from Wikipedia
// - 2+ teams, each with an independent timer that only counts during their turn
// - Eliminations: continue until all teams are out OR deck is finished
// - Keyboard: Enter=Correct/Next, Space=Pause/Start, Tab=Switch Turn, S=Skip, R=Reset, 1-9=Jump to team

const DEFAULT_TEAM_TIME_MS = 60_000; // 60 seconds per team
const WARN_THRESH_MS = 10_000; // 10s warning color + beep
const DANGER_THRESH_MS = 5_000; // 5s danger color

const els = {
  teams: document.getElementById("teams"),
  status: document.getElementById("status"),
  turnBanner: document.getElementById("turnBanner"),
  promptType: document.getElementById("promptType"),
  promptContent: document.getElementById("promptContent"),
  promptAnswer: document.getElementById("promptAnswer"),
  deckCounter: document.getElementById("deckCounter"),
  deckName: document.getElementById("deckName"),
  deckSelect: document.getElementById("deckSelect"),
  btnLoadDeck: document.getElementById("btnLoadDeck"),
  btnRandomDeck: document.getElementById("btnRandomDeck"),
  btnAddTeam: document.getElementById("btnAddTeam"),
  btnStart: document.getElementById("btnStart"),
  btnPause: document.getElementById("btnPause"),
  btnCorrect: document.getElementById("btnCorrect"),
  btnSwitch: document.getElementById("btnSwitch"),
  btnSkip: document.getElementById("btnSkip"),
  btnReset: document.getElementById("btnReset"),
};

let state = {
  teams: [],
  activeTeamIdx: -1,
  ticking: false,
  lastTick: 0,
  deck: [],
  deckLabel: "None",
  promptIdx: 0,
  warnedAt: new Set(),
  pingedSeconds: new Set(),
  gameOver: false,
  manifest: { decks: [] },
  awaitingStart: false, // When true: show deck title instead of first prompt until Start is pressed
};

function msToClock(ms) {
  ms = Math.max(0, Math.floor(ms));
  const s = Math.ceil(ms / 1000);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function createTeam(name, color) {
  return {
    id: crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    color,
    timeMs: DEFAULT_TEAM_TIME_MS,
    eliminated: false,
  };
}

function renderTeams() {
  els.teams.innerHTML = "";
  state.teams.forEach((team, idx) => {
    const card = document.createElement("div");
    card.className = "team-card";

    const row = document.createElement("div");
    row.className = "team-row";

    const color = document.createElement("div");
    color.className = "team-color";
    color.style.background = team.color;

    const name = document.createElement("input");
    name.className = "team-name";
    name.value = team.name;
    name.addEventListener("input", () => {
      team.name = name.value || `Team ${idx + 1}`;
      renderTurnBanner();
    });
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        name.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        name.value = team.name;
        name.blur();
      }
    });

    const timer = document.createElement("div");
    timer.className = "timer";
    timer.textContent = msToClock(team.timeMs);
    timer.classList.toggle("danger", team.timeMs <= DANGER_THRESH_MS);
    timer.classList.toggle("warn", team.timeMs <= WARN_THRESH_MS && team.timeMs > DANGER_THRESH_MS);

    row.append(color, name, timer);

    const badges = document.createElement("div");
    badges.className = "badges";
    const bActive = document.createElement("span");
    bActive.className = "badge" + (idx === state.activeTeamIdx && !team.eliminated ? " active" : "");
    bActive.textContent = idx === state.activeTeamIdx ? "Active" : "Waiting";
    const bStatus = document.createElement("span");
    bStatus.className = "badge" + (team.eliminated ? " eliminated" : "");
    bStatus.textContent = team.eliminated ? "Eliminated" : "In Play";
    badges.append(bActive, bStatus);

    const actions = document.createElement("div");
    actions.className = "team-actions";
    const plus5 = document.createElement("button");
    plus5.textContent = "+5s";
    plus5.title = "Add 5 seconds";
    plus5.onclick = () => {
      team.timeMs += 5000;
      renderTeams();
    };
    const minus5 = document.createElement("button");
    minus5.textContent = "-5s";
    minus5.title = "Remove 5 seconds";
    minus5.onclick = () => {
      team.timeMs = Math.max(0, team.timeMs - 5000);
      renderTeams();
    };
    const set60 = document.createElement("button");
    set60.textContent = "Set 60s";
    set60.onclick = () => {
      team.timeMs = 60_000;
      renderTeams();
    };
    const jump = document.createElement("button");
    jump.textContent = "Make Active";
    jump.onclick = () => switchToTeam(idx);
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.onclick = () => {
      const wasActive = state.activeTeamIdx === idx;
      if (wasActive) pauseTicking();
      state.teams.splice(idx, 1);
      if (state.activeTeamIdx >= state.teams.length) state.activeTeamIdx = state.teams.length - 1;
      renderAll();
    };

    actions.append(plus5, minus5, set60, jump, remove);

    card.append(row, badges, actions);
    els.teams.append(card);
  });
}

// Utilities for colors in banner (optional; safe defaults if not used)
function hexToRgb(hex) {
  if (!hex) return null;
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}
function getReadableTextColor(bgHex) {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "#ffffff";
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luminance > 186 ? "#111827" : "#ffffff";
}
function darkenHex(bgHex, factor = 0.25) {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "rgba(0,0,0,0.3)";
  const r = Math.max(0, Math.round(rgb.r * (1 - factor)));
  const g = Math.max(0, Math.round(rgb.g * (1 - factor)));
  const b = Math.max(0, Math.round(rgb.b * (1 - factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

function renderTurnBanner() {
  const t = state.teams[state.activeTeamIdx];
  if (t) {
    els.turnBanner.textContent = `${t.name}'s Turn`;
    // If team has a color, tint the banner
    if (t.color) {
      els.turnBanner.style.background = t.color;
      els.turnBanner.style.color = getReadableTextColor(t.color);
      els.turnBanner.style.borderColor = darkenHex(t.color, 0.35);
    } else {
      els.turnBanner.style.background = "";
      els.turnBanner.style.color = "";
      els.turnBanner.style.borderColor = "";
    }
  } else {
    els.turnBanner.textContent = "No active team";
    els.turnBanner.style.background = "";
    els.turnBanner.style.color = "";
    els.turnBanner.style.borderColor = "";
  }
}

function renderPrompt() {
  const deckSize = state.deck.length;
  const idxDisplay = state.awaitingStart ? (deckSize ? 1 : 0) : Math.min(state.promptIdx + 1, deckSize);
  els.deckCounter.textContent = `Prompt ${idxDisplay}/${deckSize}`;
  els.deckName.textContent = `Deck: ${state.deckLabel}`;

  els.promptType.textContent = "";
  els.promptContent.innerHTML = "";
  els.promptAnswer.textContent = "";

  if (state.awaitingStart) {
    els.promptType.textContent = "Deck";
    const div = document.createElement("div");
    div.className = "text";
    div.textContent = state.deckLabel || "No deck loaded";
    els.promptContent.append(div);
    return;
  }

  const item = state.deck[state.promptIdx];
  if (!item) {
    els.promptType.textContent = "Deck";
    const div = document.createElement("div");
    div.className = "text";
    div.textContent = deckSize ? "No more prompts." : "No deck loaded.";
    els.promptContent.append(div);
    return;
  }

  els.promptType.textContent = item.type === "image" ? "Image" : "Text";
  if (item.type === "image") {
    const img = document.createElement("img");
    img.src = item.src;
    img.alt = "Prompt image";
    els.promptContent.append(img);
  } else {
    const div = document.createElement("div");
    div.className = "text";
    div.textContent = item.text;
    els.promptContent.append(div);
  }
  if (item.answer) {
    els.promptAnswer.textContent = `Answer: ${item.answer}`;
    els.promptAnswer.style.visibility = "hidden";
  }
}

function renderStatus(msg = "") {
  els.status.textContent = msg;
}

function renderAll() {
  renderTeams();
  renderTurnBanner();
  renderPrompt();
}

// Audio cues
const audioCtx = typeof window.AudioContext !== "undefined" ? new AudioContext() : null;
function beep(freq = 880, durMs = 150, type = "sine") {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durMs / 1000);
  o.stop(audioCtx.currentTime + durMs / 1000 + 0.01);
}

function ensureAudioUnlocked() {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
}

// Game flow helpers
function nextAliveTeamIdx(fromIdx) {
  if (state.teams.length === 0) return -1;
  for (let i = 1; i <= state.teams.length; i++) {
    const idx = (fromIdx + i) % state.teams.length;
    if (!state.teams[idx].eliminated) return idx;
  }
  return -1;
}

function aliveTeamsRemaining() {
  return state.teams.filter((t) => !t.eliminated).length;
}

function finalizeGame(message = "Game over!") {
  pauseTicking();
  state.gameOver = true;
  els.turnBanner.textContent = "Game Over";
  els.turnBanner.style.background = "";
  els.turnBanner.style.color = "";
  els.turnBanner.style.borderColor = "";
  renderStatus(message);
  beep(220, 320, "sawtooth");
  beep(196, 320, "square");
}

function checkForGameCompletion() {
  // Deck finished?
  if (state.promptIdx >= state.deck.length && state.deck.length > 0) {
    finalizeGame("Deck complete! Game over.");
    return true;
  }
  // All teams eliminated?
  if (aliveTeamsRemaining() === 0) {
    finalizeGame("All teams have been eliminated. Game over!");
    return true;
  }
  return false;
}

function switchToTeam(idx) {
  pauseTicking();
  if (idx < 0 || idx >= state.teams.length) return;
  if (state.teams[idx].eliminated) {
    renderStatus(`${state.teams[idx].name} is eliminated.`);
    return;
  }
  state.activeTeamIdx = idx;
  state.warnedAt.delete(idx);
  state.pingedSeconds.clear();
  renderAll();
}

function startTurn() {
  if (state.gameOver) return;
  if (!state.deck.length) {
    renderStatus("No deck loaded. Choose a deck or click Random Deck.");
    return;
  }
  // If we’re on the deck title screen, reveal the first prompt now
  if (state.awaitingStart) {
    state.awaitingStart = false;
    state.promptIdx = 0;
    renderPrompt();
  }
  if (checkForGameCompletion()) return;

  if (state.activeTeamIdx < 0 || state.teams[state.activeTeamIdx]?.eliminated) {
    const idx = nextAliveTeamIdx(state.activeTeamIdx < 0 ? -1 : state.activeTeamIdx);
    if (idx === -1) {
      checkForGameCompletion();
      return;
    }
    state.activeTeamIdx = idx;
  }
  state.lastTick = performance.now();
  state.ticking = true;
  renderStatus("Running...");
  renderTurnBanner();
}

function pauseTicking() {
  if (!state.ticking) return;
  tickOnce(); // finalize elapsed time
  state.ticking = false;
  renderStatus("Paused.");
}

function togglePause() {
  if (state.ticking) pauseTicking();
  else {
    ensureAudioUnlocked();
    startTurn();
  }
}

function onCorrectNext() {
  if (state.gameOver) return;
  if (state.awaitingStart) {
    startTurn();
    return;
  }
  pauseTicking();
  state.promptIdx = Math.min(state.promptIdx + 1, state.deck.length);
  renderPrompt();

  if (checkForGameCompletion()) return;

  const nextIdx = nextAliveTeamIdx(state.activeTeamIdx);
  if (nextIdx !== -1) {
    state.activeTeamIdx = nextIdx;
    renderAll();
    startTurn();
  } else {
    checkForGameCompletion();
  }
}

function onSkipPrompt() {
  if (state.gameOver) return;
  if (state.awaitingStart) {
    renderStatus("Press Start Game to begin.");
    return;
  }
  state.promptIdx = Math.min(state.promptIdx + 1, state.deck.length);
  renderPrompt();
  checkForGameCompletion();
}

function onSwitchTurn() {
  if (state.gameOver) return;
  const nextIdx = nextAliveTeamIdx(state.activeTeamIdx);
  if (nextIdx === -1) return;
  const wasTicking = state.ticking;
  switchToTeam(nextIdx);
  if (wasTicking) startTurn();
}

function resetGame(hard = false) {
  pauseTicking();
  state.ticking = false;
  state.gameOver = false;

  // Return to title screen of current deck
  state.awaitingStart = true;
  state.promptIdx = 0;

  state.warnedAt.clear();
  state.pingedSeconds.clear();

  if (hard) {
    state.teams.forEach((t) => {
      t.timeMs = DEFAULT_TEAM_TIME_MS;
      t.eliminated = false;
    });
    const firstAlive = state.teams.findIndex((t) => !t.eliminated);
    state.activeTeamIdx = firstAlive !== -1 ? firstAlive : state.teams.length ? 0 : -1;
  } else {
    if (state.activeTeamIdx < 0 || state.activeTeamIdx >= state.teams.length || state.teams[state.activeTeamIdx]?.eliminated) {
      const firstAlive = state.teams.findIndex((t) => !t.eliminated);
      state.activeTeamIdx = firstAlive !== -1 ? firstAlive : state.teams.length ? 0 : -1;
    }
  }

  renderAll();
  renderStatus("Reset. Press Start Game to begin.");
}

function tickOnce() {
  const t = state.teams[state.activeTeamIdx];
  if (!t || t.eliminated) return;
  const now = performance.now();
  const delta = now - state.lastTick;
  state.lastTick = now;

  t.timeMs = Math.max(0, t.timeMs - delta);

  // Warnings
  if (t.timeMs <= WARN_THRESH_MS && !state.warnedAt.has(state.activeTeamIdx) && !state.gameOver) {
    state.warnedAt.add(state.activeTeamIdx);
    beep(880, 160, "square");
  }
  const secsLeft = Math.ceil(t.timeMs / 1000);
  [3, 2, 1].forEach((s) => {
    const key = `${state.activeTeamIdx}:${s}`;
    if (secsLeft === s && !state.pingedSeconds.has(key) && !state.gameOver) {
      state.pingedSeconds.add(key);
      beep(990, 120, "square");
    }
  });

  // Out of time -> eliminate team, but keep game going if others remain
  if (t.timeMs <= 0 && !state.gameOver) {
    t.eliminated = true;
    renderStatus(`${t.name} ran out of time and is eliminated.`);
    beep(300, 250, "sawtooth");

    const nextIdx = nextAliveTeamIdx(state.activeTeamIdx);
    if (nextIdx === -1) {
      // No alive teams left -> game over
      finalizeGame("All teams have been eliminated. Game over!");
      return;
    } else {
      // Move to next team and continue ticking
      state.activeTeamIdx = nextIdx;
      state.warnedAt.delete(nextIdx);
      state.pingedSeconds.clear();
      state.lastTick = now;
      renderAll();
    }
  }

  renderTeams();
}

// --- Wikipedia image support ---
async function hydrateWikiImages(items) {
  const tasks = items.map(async (item) => {
    if (item?.type === "image" && !item.src && typeof item.wiki === "string" && item.wiki.trim()) {
      try {
        const title = encodeURIComponent(item.wiki.trim());
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const src = (data.originalimage && data.originalimage.source) || (data.thumbnail && data.thumbnail.source);
        if (src) item.src = src;
        if (!item.answer) item.answer = item.wiki;
      } catch (e) {
        console.warn("Wiki image fetch failed for", item.wiki, e);
      }
    }
  });
  await Promise.allSettled(tasks);
}

// Decks: manifest + loading
function populateDeckSelect() {
  els.deckSelect.innerHTML = "";
  const decks = state.manifest.decks || [];
  if (!decks.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No decks found";
    els.deckSelect.append(opt);
    els.deckSelect.disabled = true;
    return;
  }
  els.deckSelect.disabled = false;

  decks.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.name;
    els.deckSelect.append(opt);
  });
  els.deckSelect.selectedIndex = 0;
}

async function loadManifest() {
  try {
    const res = await fetch("decks/decks.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.decks)) throw new Error('Invalid decks.json format: expected { "decks": [...] }');
    state.manifest = { decks: data.decks };
  } catch (e) {
    console.warn("Failed to load decks/decks.json, using fallback manifest.", e);
    state.manifest = {
      decks: [
        { id: "mixed", name: "Mixed Sampler", file: "decks/mixed.json" },
        { id: "logos", name: "Logos", file: "decks/logos.json" },
        { id: "artists", name: "Artists", file: "decks/artists.json" },
        { id: "flags", name: "Country Flags", file: "decks/flags.json" },
      ],
    };
  } finally {
    populateDeckSelect();
  }
}

async function loadDeckFrom(url, label = "Custom Deck") {
  try {
    pauseTicking();

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    if (!Array.isArray(raw)) throw new Error("Deck JSON must be an array of prompt items");

    // Allow image items to specify either src or wiki
    const items = raw.filter(
      (item) =>
        item &&
        (item.type === "text" || item.type === "image") &&
        ((item.type === "text" && typeof item.text === "string") || (item.type === "image" && (typeof item.src === "string" || typeof item.wiki === "string")))
    );

    // Resolve any wiki-based image entries to src URLs
    await hydrateWikiImages(items);

    // Final sanitize: ensure image items now have src
    const sanitized = items.filter((item) => (item.type === "text" && typeof item.text === "string") || (item.type === "image" && typeof item.src === "string"));

    state.deck = sanitized;
    state.deckLabel = label;
    state.promptIdx = 0;
    state.awaitingStart = true;
    state.gameOver = false;

    renderPrompt();
    renderStatus(`Loaded deck: ${label}. Press Start Game to begin.`);
  } catch (e) {
    console.error("Failed to load deck:", url, e);
    state.deck = [];
    state.deckLabel = "None";
    state.promptIdx = 0;
    state.awaitingStart = false;
    renderPrompt();
    renderStatus(`Failed to load deck (${label}). Check the file path/format.`);
  }
}

async function loadDeckById(id) {
  const d = (state.manifest.decks || []).find((x) => x.id === id);
  if (!d) {
    renderStatus("Deck not found in manifest.");
    return;
  }
  await loadDeckFrom(d.file, d.name);
}

function pickRandomDeckId() {
  const list = state.manifest.decks || [];
  if (!list.length) return "";
  const i = Math.floor(Math.random() * list.length);
  return list[i].id;
}

function loop() {
  if (state.ticking) tickOnce();
  requestAnimationFrame(loop);
}

// Events
els.btnAddTeam.addEventListener("click", () => {
  const idx = state.teams.length + 1;
  const palette = ["#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#ef4444"];
  const color = palette[(idx - 1) % palette.length];
  state.teams.push(createTeam(`Team ${idx}`, color));
  if (state.activeTeamIdx === -1) state.activeTeamIdx = 0;
  renderAll();
});

els.btnStart.addEventListener("click", () => {
  ensureAudioUnlocked();
  startTurn();
});

els.btnPause.addEventListener("click", togglePause);
els.btnCorrect.addEventListener("click", onCorrectNext);
els.btnSwitch.addEventListener("click", onSwitchTurn);
els.btnSkip.addEventListener("click", onSkipPrompt);
els.btnReset.addEventListener("click", () => resetGame(true));

els.btnLoadDeck.addEventListener("click", async () => {
  const id = els.deckSelect.value;
  if (!id) {
    renderStatus("No deck selected.");
    return;
  }
  await loadDeckById(id);
  resetGame(false);
});

els.btnRandomDeck.addEventListener("click", async () => {
  const id = pickRandomDeckId();
  if (!id) {
    renderStatus("No decks available for random selection.");
    return;
  }
  await loadDeckById(id);
  resetGame(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    e.preventDefault();
    togglePause();
  } else if (e.key === "Enter") {
    e.preventDefault();
    onCorrectNext();
  } else if (e.key === "Tab") {
    e.preventDefault();
    onSwitchTurn();
  } else if (e.key.toLowerCase() === "s") {
    e.preventDefault();
    onSkipPrompt();
  } else if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    resetGame(true);
  } else if (e.key >= "1" && e.key <= "9") {
    const idx = parseInt(e.key, 10) - 1;
    if (idx < state.teams.length) switchToTeam(idx);
  }
});

async function init() {
  // Default 2 teams
  state.teams = [createTeam("Team A", "#60a5fa"), createTeam("Team B", "#22d3ee")];
  state.activeTeamIdx = 0;

  await loadManifest();

  if ((state.manifest.decks || []).length) {
    await loadDeckById(state.manifest.decks[0].id);
  } else {
    renderStatus("Add decks to decks/decks.json or click Random Deck after adding.");
  }

  renderAll();
  if (!state.deck.length) renderStatus("Select a deck above or click Random Deck, then press Start Game.");
  loop();
}

init();
