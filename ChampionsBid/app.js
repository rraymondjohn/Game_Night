const el = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "champions_bid_game_v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Topic Bank (curated)
const TOPIC_BANK = [
  {
    category: "Clothing",
    questions: [
      "How many shoe brands can you name?",
      "How many clothing brands can you list?",
      "How many luxury brands can you name?",
      "How many sportswear or athleisure brands can you name?",
      "How many watch brands can you list?",
    ],
  },
  {
    category: "Music",
    questions: [
      "How many artists have featured on bbno$ songs?",
      "How many music genres can you list?",
      "How many bands can you list?",
      "How many K-Pop boy or girl groups can you name?",
      "How many musical instruments can you list?",
      "How many rock subgenres or movements can you list?",
    ],
  },
  {
    category: "Youtube",
    questions: ["How many Youtubers can you name?", "How many YouTube channels have over 10 million subscribers?"],
  },
  {
    category: "Sports",
    questions: [
      "How many soccer teams can you name in the Premier League?",
      "How many sports featured in the Olympics can you list?",
      "How many NBA teams can you name?",
      "How many martial arts disciplines can you name?",
      "How many famous athletes can you name?",
    ],
  },
  {
    category: "History",
    questions: [
      "How many serial killers or notable criminals can you list?",
      "How many Presidents, Kings, or Queens can you list (specify country or any)?",
      "How many ancient civilizations can you name?",
      "How many famous landmarks or monuments can you list?",
    ],
  },
  {
    category: "Geography",
    questions: [
      "How many capital cities can you list?",
      "How many countries in Africa can you name?",
      "How many countries in Asia can you name?",
      "How many countries in Europe can you name?",
      "How many U.S. states can you name?",
    ],
  },
  {
    category: "Transport",
    questions: ["How many MRT or LRT lines in Singapore can you list?", "How many vehicle brands can you name?", "How many airline carriers can you list?", "How many motorcycle brands can you name?"],
  },
  {
    category: "Science",
    questions: ["How many elements from the periodic table can you list?"],
  },
  {
    category: "Food and Drinks",
    questions: [
      "How many alcoholic brands can you name?",
      "How many world cuisines can you list?",
      "How many fruits can you list?",
      "How many types of cheese can you name?",
      "How many fast food chains can you name?",
    ],
  },
  {
    category: "Cosmetics",
    questions: [
      "How many lipstick brands can you list?",
      "How many skincare brands can you name?",
      "How many makeup products or items can you list?",
      "How many perfume houses or fragrance brands can you name?",
      "How many beauty retailers can you list?",
    ],
  },
  {
    category: "Education",
    questions: [
      "List out Primary schools, Secondary schools, Universities, or All Schools (specify region).",
      "How many famous universities worldwide can you name?",
      "How many fields of study / academic disciplines / degree courses can you list?",
    ],
  },
  {
    category: "Movies & TV",
    questions: ["How many movie genres can you list?", "How many actors or actresses can you name?"],
  },
];

const initialState = () => ({
  phase: "setup", // setup | round | bidding | listing | result
  topic: "",
  question: "",
  timerEnabled: false,
  timerSeconds: 60,
  timerTick: 60,
  teams: [
    {
      id: uid(),
      name: "Team A",
      players: [
        { id: uid(), name: "Alice" },
        { id: uid(), name: "Ben" },
        { id: uid(), name: "Cara" },
      ],
      score: 0,
    },
    {
      id: uid(),
      name: "Team B",
      players: [
        { id: uid(), name: "Drew" },
        { id: uid(), name: "Eve" },
        { id: uid(), name: "Finn" },
      ],
      score: 0,
    },
  ],
  champions: {}, // { [teamId]: playerId }
  startingRotation: "round-robin", // "round-robin" | "fixed"
  roundNumber: 1,
  startingTeamIndex: 0,
  activeTeamIndex: 0,
  currentBid: null, // { teamId, amount }
  lastChallengerTeamId: null,
  listingTeamId: null,
  requiredCount: 0,
  listedItems: [],
  listingUseCounter: false,
  manualCount: 0,
  forfeits: [], // { round, losingTeamId, note }
});

let state = loadState() || initialState();
let timerInterval = null;
let audioCtx = null;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setPhase(phase) {
  state.phase = phase;
  saveState();
  render();
}

function validateSetup() {
  const teams = state.teams.filter((t) => t.name.trim().length > 0);
  if (teams.length < 2) return { ok: false, msg: "You need at least 2 teams." };
  for (const t of teams) {
    const players = t.players.filter((p) => p.name.trim().length > 0);
    if (players.length < 3) return { ok: false, msg: `Team "${t.name}" must have at least 3 players.` };
  }
  return { ok: true };
}

function addTeam() {
  state.teams.push({
    id: uid(),
    name: `Team ${String.fromCharCode(65 + state.teams.length)}`,
    players: [
      { id: uid(), name: "" },
      { id: uid(), name: "" },
      { id: uid(), name: "" },
    ],
    score: 0,
  });
  saveState();
  renderTeamsEditor();
}

function removeTeam(teamId) {
  state.teams = state.teams.filter((t) => t.id !== teamId);
  saveState();
  renderTeamsEditor();
}

function addPlayer(teamId) {
  const team = state.teams.find((t) => t.id === teamId);
  team.players.push({ id: uid(), name: "" });
  saveState();
  renderTeamsEditor();
}

function removePlayer(teamId, playerId) {
  const team = state.teams.find((t) => t.id === teamId);
  team.players = team.players.filter((p) => p.id !== playerId);
  saveState();
  renderTeamsEditor();
}

function beginGame() {
  const val = validateSetup();
  if (!val.ok) {
    alert(val.msg);
    return;
  }
  state.phase = "round";
  state.roundNumber = 1;
  state.activeTeamIndex = state.startingTeamIndex;
  state.topic = "";
  state.question = "";
  state.champions = {};
  state.currentBid = null;
  state.requiredCount = 0;
  state.listedItems = [];
  state.listingUseCounter = false;
  state.manualCount = 0;
  state.lastChallengerTeamId = null;
  state.listingTeamId = null;
  stopTimer();
  state.timerTick = state.timerSeconds;
  saveState();
  render();
}

function renderTeamsEditor() {
  const container = el("#teams-editor");
  container.innerHTML = "";
  state.teams.forEach((team) => {
    const div = document.createElement("div");
    div.className = "team-editor";
    div.innerHTML = `
      <div class="team-editor-header">
        <input class="team-name-input" type="text" value="${escapeHtml(team.name)}" placeholder="Team name" data-team="${team.id}" />
        <button class="danger btn-remove-team" data-team="${team.id}">Remove</button>
      </div>
      <div class="players">
        ${team.players
          .map(
            (p) => `
          <div class="player-row">
            <input class="player-name-input" type="text" value="${escapeHtml(p.name)}" placeholder="Player name" data-team="${team.id}" data-player="${p.id}" />
            <button class="secondary btn-remove-player" data-team="${team.id}" data-player="${p.id}">Remove</button>
          </div>
        `
          )
          .join("")}
      </div>
      <div class="setup-actions">
        <button class="secondary btn-add-player" data-team="${team.id}">Add Player</button>
      </div>
    `;
    container.appendChild(div);
  });

  els(".team-name-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const team = state.teams.find((t) => t.id === e.target.dataset.team);
      team.name = e.target.value;
      saveState();
      renderScoreboard();
    });
  });
  els(".player-name-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const team = state.teams.find((t) => t.id === e.target.dataset.team);
      const player = team.players.find((p) => p.id === e.target.dataset.player);
      player.name = e.target.value;
      saveState();
    });
  });
  els(".btn-remove-team").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      removeTeam(e.target.dataset.team);
    })
  );
  els(".btn-add-player").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      addPlayer(e.target.dataset.team);
    })
  );
  els(".btn-remove-player").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      removePlayer(e.target.dataset.team, e.target.dataset.player);
    })
  );
}

function renderScoreboard() {
  const sb = el("#scoreboard");
  sb.innerHTML = "";
  state.teams.forEach((t, idx) => {
    const div = document.createElement("div");
    div.className = "team";
    div.innerHTML = `
      <div class="team-header">
        <div class="team-name">${escapeHtml(t.name)}</div>
        <div class="team-score">${t.score}</div>
      </div>
      <div class="team-info">
        <small class="muted">Players: ${
          t.players
            .filter((p) => p.name.trim())
            .map((p) => escapeHtml(p.name))
            .join(", ") || "—"
        }</small>
      </div>
      <div class="team-actions" style="margin-top:8px; display:flex; gap:6px;">
        <button class="secondary btn-minus" data-team="${t.id}">-1</button>
        <button class="secondary btn-plus" data-team="${t.id}">+1</button>
        <span class="badge">${idx === state.startingTeamIndex ? "Starting" : ""}</span>
      </div>
    `;
    sb.appendChild(div);
  });
  els(".btn-minus").forEach((b) => b.addEventListener("click", () => adjustScore(b.dataset.team, -1)));
  els(".btn-plus").forEach((b) => b.addEventListener("click", () => adjustScore(b.dataset.team, 1)));
}

function adjustScore(teamId, delta) {
  const t = state.teams.find((t) => t.id === teamId);
  t.score = Math.max(0, t.score + delta);
  saveState();
  renderScoreboard();
}

function renderChampionsNomination() {
  const c = el("#champions-nomination");
  c.innerHTML = "";
  state.teams.forEach((t) => {
    const selected = state.champions[t.id] || "";
    const card = document.createElement("div");
    card.className = "champion-card";
    card.innerHTML = `
      <h3>${escapeHtml(t.name)} Champion</h3>
      <div class="line">
        <select class="champion-select" data-team="${t.id}">
          <option value="" ${selected === "" ? "selected" : ""}>Select player</option>
          ${t.players
            .filter((p) => p.name.trim().length > 0)
            .map(
              (p) => `
            <option value="${p.id}" ${selected === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>
          `
            )
            .join("")}
        </select>
        <button class="secondary btn-random-champion" data-team="${t.id}">Random</button>
      </div>
    `;
    c.appendChild(card);
  });
  els(".champion-select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const teamId = e.target.dataset.team;
      const value = e.target.value || null;
      if (value) state.champions[teamId] = value;
      else delete state.champions[teamId];
      saveState();
    });
  });
  els(".btn-random-champion").forEach((btn) => {
    btn.addEventListener("click", () => {
      const teamId = btn.dataset.team;
      const t = state.teams.find((t) => t.id === teamId);
      const candidates = t.players.filter((p) => p.name.trim().length > 0);
      if (candidates.length === 0) return;
      const pick = candidates[Math.floor(Math.random() * candidates.length)].id;
      state.champions[teamId] = pick;
      saveState();
      renderChampionsNomination();
    });
  });
}

function canStartBidding() {
  if (!state.topic.trim()) return { ok: false, msg: "Topic/Category is required." };
  for (const t of state.teams) {
    if (!state.champions[t.id]) return { ok: false, msg: `Please select a Champion for ${t.name}.` };
  }
  return { ok: true };
}

function startBidding() {
  const ok = canStartBidding();
  if (!ok.ok) {
    alert(ok.msg);
    return;
  }
  state.phase = "bidding";
  state.currentBid = null;
  state.activeTeamIndex = state.startingTeamIndex;
  state.listedItems = [];
  state.requiredCount = 0;
  state.listingUseCounter = false;
  state.manualCount = 0;
  state.lastChallengerTeamId = null;
  state.listingTeamId = null;
  stopTimer();
  state.timerTick = state.timerSeconds; // prepare default
  saveState();
  render();
}

function advanceActiveTeam() {
  state.activeTeamIndex = (state.activeTeamIndex + 1) % state.teams.length;
}

function submitBid(amount) {
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount < 1) {
    alert("Bid must be at least 1.");
    return;
  }
  const current = state.currentBid?.amount ?? 0;
  if (amount <= current) {
    alert(`Bid must be greater than ${current}.`);
    return;
  }
  const team = state.teams[state.activeTeamIndex];
  state.currentBid = { teamId: team.id, amount };
  saveState();
  advanceActiveTeam();
  renderBidding();
}

function challenge() {
  if (!state.currentBid) {
    alert("You need an initial bid before you can challenge.");
    return;
  }
  const challenger = state.teams[state.activeTeamIndex];
  const listingTeamId = state.currentBid.teamId;
  state.lastChallengerTeamId = challenger.id;
  state.listingTeamId = listingTeamId;
  state.requiredCount = state.currentBid.amount;
  state.phase = "listing";
  state.listedItems = [];
  state.listingUseCounter = false;
  state.manualCount = 0;
  // Manual timer: do not auto-start
  stopTimer();
  state.timerTick = state.timerSeconds;
  saveState();
  render();
}

function startTimer() {
  // Create audio context on user interaction if needed
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {}
  }
  // Ensure not already running
  if (timerInterval) return;

  // If timerTick out of sync, clamp
  if (!Number.isFinite(state.timerTick) || state.timerTick < 0) {
    state.timerTick = state.timerSeconds;
  }
  renderTimerDisplays();

  timerInterval = setInterval(() => {
    state.timerTick -= 1;
    if (state.timerTick <= 10) {
      beepSquare();
    }
    renderTimerDisplays();
    if (state.timerTick <= 0) {
      stopTimer();
      const count = currentCount();
      completeRound(count >= state.requiredCount);
    }
  }, 1000);
}

function pauseTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    renderTimerDisplays();
  }
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  renderTimerDisplays();
}

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function renderTimerDisplays() {
  // Scoreboard small display (default/current)
  const d1 = el("#timer-display");
  if (d1) d1.textContent = fmtTime(state.timerTick ?? state.timerSeconds);

  // Listing small badge
  const d2 = el("#timer-live");
  if (d2) {
    if (state.phase === "listing") {
      d2.classList.remove("hidden");
      d2.textContent = fmtTime(state.timerTick ?? state.timerSeconds);
    } else {
      d2.classList.add("hidden");
    }
  }

  // Listing large display
  const big = el("#timer-display-large");
  if (big) big.textContent = fmtTime(state.timerTick ?? state.timerSeconds);

  // Update Pause button label
  const pauseBtn = el("#btn-timer-pause");
  if (pauseBtn) pauseBtn.textContent = timerInterval ? "Pause" : "Resume";
}

function beepSquare() {
  if (!audioCtx) return; // Will be created on first Start click
  try {
    const duration = 0.12; // seconds
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    // Subtle pitch ramp towards the end (optional)
    const freq = 880; // Hz
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    // Envelope to avoid clicks
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.linearRampToValueAtTime(0.0, now + duration);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // ignore audio errors (e.g., autoplay restrictions)
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function renderSpotlights() {
  // Bidding
  const sbT = el("#spotlight-topic-bidding");
  const sbQ = el("#spotlight-question-bidding");
  if (sbT) sbT.textContent = state.topic || "—";
  if (sbQ) sbQ.textContent = state.question || "—";

  // Listing
  const slT = el("#spotlight-topic-listing");
  const slQ = el("#spotlight-question-listing");
  if (slT) slT.textContent = state.topic || "—";
  if (slQ) slQ.textContent = state.question || "—";

  // Result
  const srT = el("#spotlight-topic-result");
  const srQ = el("#spotlight-question-result");
  if (srT) srT.textContent = state.topic || "—";
  if (srQ) srQ.textContent = state.question || "—";
}

function render() {
  el("#setup-section").classList.toggle("hidden", state.phase !== "setup");
  const showGame = state.phase !== "setup";
  el("#score-section").classList.toggle("hidden", !showGame);
  el("#round-section").classList.toggle("hidden", state.phase !== "round");
  el("#bidding-section").classList.toggle("hidden", state.phase !== "bidding");
  el("#listing-section").classList.toggle("hidden", state.phase !== "listing");
  el("#result-section").classList.toggle("hidden", state.phase !== "result");

  if (state.phase === "setup") {
    renderTeamsEditor();
  } else {
    renderScoreboard();
    el("#starting-rotation").value = state.startingRotation;
    el("#timer-enabled").checked = state.timerEnabled;
    renderTimerDisplays();

    if (state.phase === "round") {
      el("#topic-input").value = state.topic || "";
      el("#question-input").value = state.question || "";
      renderChampionsNomination();
      renderTopicBank();
    }

    if (state.phase === "bidding") {
      el("#bidding-topic").textContent = state.topic || "—";
      el("#bidding-question").textContent = state.question || "—";
      const current = state.currentBid;
      el("#current-bid-amount").textContent = current ? String(current.amount) : "—";
      el("#current-bid-team").textContent = current ? teamById(current.teamId).name : "—";
      el("#badge-starting-team").textContent = `Starting: ${state.teams[state.startingTeamIndex].name}`;
      el("#badge-active-team").textContent = `Turn: ${state.teams[state.activeTeamIndex].name}`;
      const bidInput = el("#bid-custom");
      const min = Math.max(1, (state.currentBid?.amount ?? 0) + 1);
      bidInput.min = String(min);
      if (Number(bidInput.value) < min) bidInput.value = String(min);
      renderSpotlights();
    }

    if (state.phase === "listing") {
      el("#listing-team").textContent = teamById(state.listingTeamId).name;
      el("#listing-required").textContent = String(state.requiredCount);
      el("#listing-topic").textContent = state.topic || "—";
      // Timer controls input + displays
      const secInput = el("#timer-seconds-input");
      if (secInput) {
        secInput.value = String(state.timerSeconds);
      }
      renderListedItems();
      renderListingUI();
      renderSpotlights();
      renderTimerDisplays();
    }

    if (state.phase === "result") {
      renderSpotlights();
    }
  }
}

function teamById(id) {
  return state.teams.find((t) => t.id === id);
}

function renderListedItems() {
  el("#listed-count").textContent = String(currentCount());
  const ul = el("#listed-items");
  ul.innerHTML = "";
  state.listedItems.forEach((it, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `${escapeHtml(it)} <span class="x" data-idx="${idx}" title="Remove">✕</span>`;
    ul.appendChild(li);
  });
  els("#listed-items .x").forEach((x) => {
    x.addEventListener("click", () => {
      const i = Number(x.dataset.idx);
      state.listedItems.splice(i, 1);
      saveState();
      renderListedItems();
    });
  });
}

function renderListingUI() {
  const chk = el("#counter-enabled");
  if (chk) chk.checked = !!state.listingUseCounter;

  const panel = el("#counter-panel");
  if (panel) panel.classList.toggle("hidden", !state.listingUseCounter);

  const typingArea = el("#listing-typing-area");
  if (typingArea) typingArea.classList.toggle("hidden", !!state.listingUseCounter);

  const disp = el("#counter-display");
  if (disp) disp.textContent = String(state.manualCount);

  const countEl = el("#listed-count");
  if (countEl) countEl.textContent = String(currentCount());
}

function uniqueCount() {
  const set = new Set(state.listedItems.map((n) => normalizeItem(n)));
  return set.size;
}
function currentCount() {
  return state.listingUseCounter ? state.manualCount : uniqueCount();
}
function normalizeItem(s) {
  return s.trim().toLowerCase();
}

function nextRoundSetup() {
  if (state.startingRotation === "round-robin") {
    state.startingTeamIndex = (state.startingTeamIndex + 1) % state.teams.length;
  }
  state.activeTeamIndex = state.startingTeamIndex;
  state.roundNumber += 1;
  state.topic = "";
  state.question = "";
  state.currentBid = null;
  state.requiredCount = 0;
  state.listedItems = [];
  state.listingUseCounter = false;
  state.manualCount = 0;
  state.lastChallengerTeamId = null;
  state.listingTeamId = null;
  state.champions = {};
  stopTimer();
  state.timerTick = state.timerSeconds;
  state.phase = "round";
  saveState();
  render();
}

function completeRound(successHit) {
  stopTimer();
  const listingTeam = teamById(state.listingTeamId);
  const challengerTeam = teamById(state.lastChallengerTeamId);
  let winner, loser, summary;
  if (successHit) {
    winner = listingTeam;
    loser = challengerTeam;
    summary = `${listingTeam.name}'s Champion hit ${state.requiredCount}. ${listingTeam.name} scores 1 point.`;
    listingTeam.score += 1;
  } else {
    winner = challengerTeam;
    loser = listingTeam;
    summary = `${listingTeam.name}'s Champion failed to reach ${state.requiredCount}. ${challengerTeam.name} scores 1 point.`;
    challengerTeam.score += 1;
  }
  state.lastResult = { winnerId: winner.id, loserId: loser.id, summary };
  state.phase = "result";
  saveState();
  render();

  el("#result-summary").textContent = summary;
}

function exportGame() {
  const data = deepClone(state);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `champions_bid_export_round_${state.roundNumber}.json`;
  a.click();
}

function importGameFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state = data;
      stopTimer();
      saveState();
      render();
    } catch (e) {
      alert("Invalid file.");
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm("Reset the entire game? This will clear local data.")) return;
  stopTimer();
  state = initialState();
  saveState();
  render();
}

/* ---------- Topic Bank UI ---------- */

let bankFilter = { text: "", category: "__all__" };

function renderTopicBank() {
  const catSel = el("#bank-category-filter");
  if (catSel && catSel.options.length <= 1) {
    for (const c of TOPIC_BANK) {
      const opt = document.createElement("option");
      opt.value = c.category;
      opt.textContent = c.category;
      catSel.appendChild(opt);
    }
  }
  const list = el("#bank-list");
  if (!list) return;
  list.innerHTML = "";

  const qText = bankFilter.text.trim().toLowerCase();
  const cat = bankFilter.category;

  const bank = TOPIC_BANK.map((c) => {
    let qs = c.questions;
    if (qText) {
      qs = qs.filter((q) => q.toLowerCase().includes(qText) || c.category.toLowerCase().includes(qText));
    }
    return { category: c.category, questions: qs };
  }).filter((c) => (cat === "__all__" ? true : c.category === cat));

  bank.forEach((c) => {
    if (c.questions.length === 0) return;
    const details = document.createElement("details");
    details.className = "bank-category";
    details.open = true;
    details.innerHTML = `
      <summary>
        <span>${escapeHtml(c.category)}</span>
        <span class="count">${c.questions.length} question${c.questions.length === 1 ? "" : "s"}</span>
      </summary>
    `;
    const ul = document.createElement("ul");
    c.questions.forEach((q) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = "q";
      span.textContent = q;
      const btn = document.createElement("button");
      btn.className = "secondary use-btn";
      btn.textContent = "Use";
      btn.addEventListener("click", () => {
        setTopicAndQuestion(c.category, q);
      });
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    details.appendChild(ul);
    list.appendChild(details);
  });
}

function setTopicAndQuestion(topic, question) {
  state.topic = topic;
  state.question = question;
  saveState();
  const t = el("#topic-input");
  const q = el("#question-input");
  if (t) t.value = topic;
  if (q) q.value = question;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function bankRandomAny() {
  const qText = bankFilter.text.trim().toLowerCase();
  const cat = bankFilter.category;
  const pool = [];

  TOPIC_BANK.forEach((c) => {
    if (cat !== "__all__" && c.category !== cat) return;
    c.questions.forEach((q) => {
      if (!qText || q.toLowerCase().includes(qText) || c.category.toLowerCase().includes(qText)) {
        pool.push({ category: c.category, question: q });
      }
    });
  });

  if (pool.length === 0) {
    alert("No questions match your current search/filter.");
    return;
  }
  const pick = randomFrom(pool);
  setTopicAndQuestion(pick.category, pick.question);
}

/* ---------- Events ---------- */

function wireGlobalEvents() {
  // Setup buttons
  el("#btn-add-team").addEventListener("click", addTeam);
  el("#btn-start").addEventListener("click", beginGame);

  // Scoreboard controls
  el("#starting-rotation").addEventListener("change", (e) => {
    state.startingRotation = e.target.value;
    saveState();
  });
  el("#timer-enabled").addEventListener("change", (e) => {
    state.timerEnabled = e.target.checked;
    saveState();
  });

  el("#btn-edit-teams").addEventListener("click", () => {
    setPhase("setup");
  });

  // Round inputs
  el("#topic-input").addEventListener("input", (e) => {
    state.topic = e.target.value;
    saveState();
  });
  el("#question-input").addEventListener("input", (e) => {
    state.question = e.target.value;
    saveState();
  });
  el("#btn-start-bidding").addEventListener("click", startBidding);

  // Topic Bank events
  const search = el("#bank-search");
  const catSel = el("#bank-category-filter");
  const randomAny = el("#btn-bank-random-any");
  const randomCat = el("#btn-bank-random-cat");

  if (search) {
    search.addEventListener("input", (e) => {
      bankFilter.text = e.target.value || "";
      renderTopicBank();
    });
  }
  if (catSel) {
    catSel.addEventListener("change", (e) => {
      bankFilter.category = e.target.value;
      renderTopicBank();
    });
  }
  if (randomAny) {
    randomAny.addEventListener("click", () => bankRandomAny());
  }
  if (randomCat) {
    randomCat.addEventListener("click", () => {
      const prev = bankFilter.category;
      if (prev === "__all__") {
        alert("Select a category first to randomize within it.");
        return;
      }
      bankRandomAny();
    });
  }

  // Bidding controls
  el("#btn-bid-plus1").addEventListener("click", () => {
    const next = (state.currentBid?.amount ?? 0) + 1;
    submitBid(next);
  });
  el("#btn-bid-custom").addEventListener("click", () => {
    const amt = Number(el("#bid-custom").value);
    submitBid(amt);
  });
  el("#btn-challenge").addEventListener("click", challenge);

  // Listing controls (typing)
  const listingInput = el("#listing-input");
  listingInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = listingInput.value.trim();
      if (val) {
        const norm = normalizeItem(val);
        const exists = new Set(state.listedItems.map(normalizeItem));
        if (!exists.has(norm)) {
          state.listedItems.push(val.trim());
          saveState();
          renderListedItems();
        }
        listingInput.value = "";
      }
    }
  });

  // Undo/Clear respect counter mode
  el("#btn-clear-last").addEventListener("click", () => {
    if (state.listingUseCounter) {
      state.manualCount = Math.max(0, state.manualCount - 1);
    } else {
      state.listedItems.pop();
    }
    saveState();
    renderListedItems();
    renderListingUI();
  });
  el("#btn-clear-all").addEventListener("click", () => {
    if (confirm("Clear all?")) {
      if (state.listingUseCounter) {
        state.manualCount = 0;
      } else {
        state.listedItems = [];
      }
      saveState();
      renderListedItems();
      renderListingUI();
    }
  });

  // Counter toggle + buttons
  el("#counter-enabled").addEventListener("change", (e) => {
    const enabled = e.target.checked;
    state.listingUseCounter = enabled;
    if (enabled) {
      state.manualCount = Math.max(state.manualCount, uniqueCount());
    }
    saveState();
    renderListingUI();
  });
  el("#btn-counter-plus").addEventListener("click", () => {
    state.manualCount += 1;
    saveState();
    renderListingUI();
  });
  el("#btn-counter-minus").addEventListener("click", () => {
    state.manualCount = Math.max(0, state.manualCount - 1);
    saveState();
    renderListingUI();
  });
  el("#btn-counter-reset").addEventListener("click", () => {
    state.manualCount = 0;
    saveState();
    renderListingUI();
  });

  // Timer controls
  el("#timer-seconds-input").addEventListener("change", (e) => {
    const val = Math.max(5, Math.min(3600, Number(e.target.value) || 60));
    state.timerSeconds = val;
    // Only update tick if not running (avoid jump while counting)
    if (!timerInterval) {
      state.timerTick = state.timerSeconds;
    }
    saveState();
    renderTimerDisplays();
  });
  el("#btn-timer-start").addEventListener("click", () => {
    // Sync tick to current seconds if not started yet
    if (!timerInterval && (state.timerTick == null || state.timerTick <= 0)) {
      state.timerTick = state.timerSeconds;
    }
    startTimer();
  });
  el("#btn-timer-pause").addEventListener("click", () => {
    if (timerInterval) pauseTimer();
    else startTimer();
  });
  el("#btn-timer-reset").addEventListener("click", () => {
    stopTimer();
    state.timerTick = state.timerSeconds;
    renderTimerDisplays();
  });

  el("#btn-complete-success").addEventListener("click", () => completeRound(true));
  el("#btn-complete-fail").addEventListener("click", () => completeRound(false));

  // Result controls
  el("#btn-next-round").addEventListener("click", () => {
    const note = el("#forfeit-input").value.trim();
    if (state.lastResult?.loserId && note) {
      state.forfeits.push({ round: state.roundNumber, losingTeamId: state.lastResult.loserId, note });
    }
    el("#forfeit-input").value = "";
    nextRoundSetup();
  });

  // Header actions
  el("#btn-export").addEventListener("click", exportGame);
  el("#btn-import").addEventListener("click", () => el("#import-file").click());
  el("#import-file").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importGameFile(file);
    e.target.value = "";
  });
  el("#btn-reset").addEventListener("click", resetAll);

  // Accessibility: keyboard help
  window.addEventListener("keydown", (e) => {
    if (state.phase === "bidding") {
      if (e.key === "+") {
        e.preventDefault();
        const next = (state.currentBid?.amount ?? 0) + 1;
        submitBid(next);
      } else if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        challenge();
      }
    } else if (state.phase === "listing") {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const success = currentCount() >= state.requiredCount;
        completeRound(success);
      } else if (state.listingUseCounter && e.key === " ") {
        e.preventDefault();
        state.manualCount += 1;
        saveState();
        renderListingUI();
      } else if (e.key.toLowerCase() === "s") {
        // S to start/pause timer
        e.preventDefault();
        if (timerInterval) pauseTimer();
        else startTimer();
      } else if (e.key.toLowerCase() === "r") {
        // R to reset timer
        e.preventDefault();
        stopTimer();
        state.timerTick = state.timerSeconds;
        renderTimerDisplays();
      }
    }
  });
}

function renderBidding() {
  const current = state.currentBid;
  el("#current-bid-amount").textContent = current ? String(current.amount) : "—";
  el("#current-bid-team").textContent = current ? teamById(current.teamId).name : "—";
  el("#badge-active-team").textContent = `Turn: ${state.teams[state.activeTeamIndex].name}`;
  const bidInput = el("#bid-custom");
  const min = Math.max(1, (state.currentBid?.amount ?? 0) + 1);
  bidInput.min = String(min);
  if (Number(bidInput.value) < min) bidInput.value = String(min);
  renderSpotlights();
}

function init() {
  wireGlobalEvents();
  render();
}
init();
