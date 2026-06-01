const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "rpg-engine-browser-v5";

let game = null;
let animFrame = 0;
let animId = null;
let facing = "down";
let resetPending = false;

function storyFor(jobId) {
  return window.HeroStories?.[jobId] || window.HeroStories?.warrior || null;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return RPG.deserialize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveState(g) {
  if (!g || g.gameOver) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(RPG.serialize(g)));
  } catch (e) {
    console.warn(e);
  }
}

function pct(cur, max) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((100 * cur) / max));
}

function jobLabel(jobId) {
  const s = storyFor(jobId);
  if (s) return `${s.name} · ${s.className}`;
  const j = WorldView?.getJob?.(jobId);
  return j?.name || "Hero";
}

function classifyFx(msg) {
  if (!msg || !String(msg).trim()) return null;
  const m = String(msg).toLowerCase();
  if (m.includes("game over")) return { icon: "💀", cls: "fx-warn" };
  if (m.includes("victory") || m.includes("quest:")) return { icon: "✨", cls: "fx-win" };
  if (m.includes(" hit ") || m.includes("attack ")) return { icon: "💥", cls: "fx-hit" };
  if (m.includes("no target") || m.includes("blocked")) return { icon: "🚫", cls: "fx-warn" };
  if (m.includes("level")) return { icon: "⬆️", cls: "fx-lvl" };
  return { icon: "✦", cls: "fx-neutral" };
}

function spawnFx(message, anchorEl) {
  const fx = classifyFx(message);
  if (!fx) return;
  const layer = $("fx-layer");
  const el = document.createElement("div");
  el.className = `fx-burst ${fx.cls}`;
  el.innerHTML = `<span class="fx-ico">${fx.icon}</span>`;
  if (anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top + r.height / 2}px`;
  } else {
    el.style.left = "50%";
    el.style.top = "42%";
  }
  layer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => el.remove(), 900);
  if (fx.cls === "fx-hit") {
    $("world-canvas")?.classList.add("shake-map");
    setTimeout(() => $("world-canvas")?.classList.remove("shake-map"), 300);
  }
}

function heroStatsHtml(p) {
  const hpp = pct(p.hp, p.max_hp);
  const mpp = pct(p.mp, p.max_mp);
  return `
    <p class="hero-class-tag">${jobLabel(p.job_id)}</p>
    <p class="hero-lv">Lv <b>${p.level}</b></p>
    <div class="vitals">
      <span class="bar-tag">HP</span>
      <div class="mega-bar hp"><div class="mega-fill" style="width:${hpp}%"></div></div>
      <span class="bar-tag">MP</span>
      <div class="mega-bar mp"><div class="mega-fill" style="width:${mpp}%"></div></div>
    </div>
    <div class="mic-stats">
      <span>ATK <b>${p.atk}</b></span>
      <span>DEF <b>${p.def}</b></span>
      <span>EXP <b>${p.exp}</b></span>
    </div>`;
}

function heroCardHtml(p) {
  return `
    <article class="portrait-card hero-card-single">
      <canvas class="hero-portrait-sm" data-job="${p.job_id || "warrior"}" width="72" height="72"></canvas>
      ${heroStatsHtml(p)}
    </article>`;
}

function paintHeroPortraits(root) {
  if (!WorldView?.drawHeroPortrait) return;
  (root || document).querySelectorAll(".hero-portrait-sm, .class-preview").forEach((c) => {
    const job = c.getAttribute("data-job") || c.closest(".class-pick")?.getAttribute("data-job");
    if (job) WorldView.drawHeroPortrait(c, job, animFrame);
  });
}

function updateSetupStory(jobId) {
  const s = storyFor(jobId);
  const title = $("setup-story-title");
  const intro = $("setup-story-intro");
  if (title) title.textContent = s?.title || "Adventure";
  if (intro) intro.textContent = s?.intro || "";
  document.querySelectorAll(".class-pick").forEach((btn) => {
    const canvas = btn.querySelector(".class-preview");
    if (canvas) {
      canvas.setAttribute("data-job", btn.getAttribute("data-job"));
      if (WorldView?.drawHeroPortrait) {
        WorldView.drawHeroPortrait(canvas, btn.getAttribute("data-job"), animFrame);
      }
    }
  });
}

function renderStory(view) {
  const title = $("story-title");
  const intro = $("story-intro");
  if (title) title.textContent = view.story_title || storyFor(view.hero_job_id)?.title || "—";
  if (intro) intro.textContent = view.story_intro || storyFor(view.hero_job_id)?.intro || "—";
}

function renderParty(view) {
  const el = $("party-list");
  const p = view.players[0];
  if (!p) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = heroCardHtml(p);
  paintHeroPortraits(el);
}

function renderQuests(view) {
  const el = $("quest-list");
  el.innerHTML = view.quests
    .map((q) => {
      const pc = pct(q.progress, q.target);
      const done = q.done ? "done" : "";
      return `<div class="quest-sigil ${done}">
        <div class="quest-shine" style="width:${pc}%"></div>
        <span class="q-title">${q.title || "Quest"}</span>
        <p class="q-desc">${q.desc || ""}</p>
        <div class="q-ring" style="background:conic-gradient(#d4b66a ${pc}%, rgba(255,255,255,0.06) 0)">
          <span class="q-ring-inner">${q.progress}<span class="q-slash">/</span>${q.target}</span>
        </div>
      </div>`;
    })
    .join("");
}

function heroJobId(view) {
  return view.hero_job_id || view.players[0]?.job_id || game?.heroJobId || "warrior";
}

function tilesOk(tiles) {
  if (!tiles || !WorldView) return false;
  return tiles.length === WorldView.ROWS && tiles[0]?.length === WorldView.COLS;
}

function rebuildWorld() {
  if (!game || !WorldView?.buildFixedMap) return;
  const seed = game.rngSeed >>> 0 || 1;
  game.worldTiles = WorldView.buildFixedMap(seed);
  game.mapMonsters = [];
  game.nextMonsterId = 1;
  game.mapX = 1;
  game.mapY = 1;
  game.inBattle = 0;
  game.engagedMonsterId = 0;
  RPG.ensureMapMonsters(game);
}

function ensureWorld() {
  if (!game) return;
  game.inBattle = 0;
  if (!tilesOk(game.worldTiles)) rebuildWorld();
  if (!game.mapMonsters?.length) {
    if (!game.nextMonsterId) game.nextMonsterId = 1;
    RPG.ensureMapMonsters(game);
  }
  if (game.mapX < 1) game.mapX = 1;
  if (game.mapY < 1) game.mapY = 1;
}

function renderWorldView(view) {
  if (!game) return;
  ensureWorld();
  const c = $("world-canvas");
  if (!c || !WorldView?.renderWorld) return;
  if (WorldView.prepareCanvas) WorldView.prepareCanvas(c);
  const tiles = game.worldTiles;
  const monsters = game.mapMonsters || [];
  const mx = game.mapX ?? 1;
  const my = game.mapY ?? 1;
  try {
    WorldView.renderWorld(c, tiles, mx, my, monsters, animFrame, facing, heroJobId(view));
  } catch (err) {
    console.error("Map render error:", err);
    rebuildWorld();
    try {
      WorldView.renderWorld(c, game.worldTiles, game.mapX, game.mapY, game.mapMonsters, animFrame, facing, heroJobId(view));
    } catch (e2) {
      const ctx = c.getContext("2d");
      if (ctx && c.width > 0) {
        ctx.fillStyle = "#3d7a48";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#fff";
        ctx.font = "14px sans-serif";
        ctx.fillText("Map error — press Restart", 40, 80);
      }
    }
  }
}

function paintMapAfterShow() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (game) renderView(RPG.toView(game));
    });
  });
}

function renderView(view, fxMsg) {
  renderStory(view);
  renderParty(view);
  renderQuests(view);
  renderWorldView(view);
  if (fxMsg) spawnFx(fxMsg, $("world-canvas"));
}

function startAnimLoop() {
  if (animId) return;
  const tick = () => {
    animFrame++;
    if (game && $("game") && !$("game").classList.contains("hidden")) {
      const view = RPG.toView(game);
      renderWorldView(view);
      paintHeroPortraits($("party-list"));
      paintHeroPortraits($("class-grid"));
    }
    animId = requestAnimationFrame(tick);
  };
  animId = requestAnimationFrame(tick);
}

function selectedJobId() {
  const on = document.querySelector(".class-pick.on");
  return on?.getAttribute("data-job") || "warrior";
}

function syncMapFromEngine() {
  if (!game || !WorldView) return;
  const p = WorldView.clampPos(game.mapX, game.mapY);
  game.mapX = p.x;
  game.mapY = p.y;
}

function moveHero(dx, dy) {
  if (!game || resetPending) return;
  ensureWorld();
  syncMapFromEngine();
  const nx = game.mapX + dx;
  const ny = game.mapY + dy;
  const tiles = game.worldTiles;
  if (!tilesOk(tiles) || !WorldView.isWalkable(tiles, nx, ny)) {
    spawnFx("Blocked", $("world-canvas"));
    return;
  }
  if (RPG.monsterAt(game, nx, ny)) {
    spawnFx("Blocked", $("world-canvas"));
    return;
  }
  if (dx < 0) facing = "left";
  else if (dx > 0) facing = "right";
  else if (dy < 0) facing = "up";
  else if (dy > 0) facing = "down";
  game.mapX = nx;
  game.mapY = ny;
  game.message = "";
  saveState(game);
  renderView(RPG.toView(game));
}

function goToHome() {
  game = null;
  resetPending = false;
  $("game").classList.add("hidden");
  $("setup").classList.remove("hidden");
}

function restartGame() {
  resetPending = false;
  localStorage.removeItem(STORAGE_KEY);
  game = RPG.newGame({ jobId: selectedJobId() });
  syncMapFromEngine();
  saveState(game);
  $("game").classList.remove("hidden");
  $("setup").classList.add("hidden");
  renderView(RPG.toView(game), game.message);
  startAnimLoop();
}

function scheduleResetAfterDeath() {
  if (resetPending) return;
  resetPending = true;
  spawnFx("Game Over", $("world-canvas"));
  setTimeout(() => restartGame(), 900);
}

function run(cmd, arg) {
  if (!game || resetPending) return;
  RPG.applyCommand(game, cmd, arg);
  const view = RPG.toView(game);
  renderView(view, game.message);
  if (game.gameOver || view.game_over || (view.players[0] && view.players[0].hp <= 0)) {
    scheduleResetAfterDeath();
    return;
  }
  saveState(game);
}

function mapAttack() {
  if (!game || resetPending) return;
  run("attack");
}

$("class-grid").addEventListener("click", (e) => {
  const btn = e.target.closest(".class-pick");
  if (!btn) return;
  document.querySelectorAll(".class-pick").forEach((b) => b.classList.remove("on"));
  btn.classList.add("on");
  updateSetupStory(btn.getAttribute("data-job"));
});

$("btnNew").addEventListener("click", () => {
  resetPending = false;
  game = RPG.newGame({ jobId: selectedJobId() });
  syncMapFromEngine();
  ensureWorld();
  saveState(game);
  $("game").classList.remove("hidden");
  $("setup").classList.add("hidden");
  paintMapAfterShow();
  startAnimLoop();
});

$("btnResume").addEventListener("click", () => {
  game = loadState();
  if (!game) {
    spawnFx("No save");
    return;
  }
  resetPending = false;
  ensureWorld();
  syncMapFromEngine();
  $("game").classList.remove("hidden");
  $("setup").classList.add("hidden");
  paintMapAfterShow();
  startAnimLoop();
});

$("btnClearSave").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  spawnFx("Cleared", $("btnClearSave"));
});

$("btn-home").addEventListener("click", () => {
  if (game) saveState(game);
  goToHome();
});

$("btn-restart").addEventListener("click", () => restartGame());

$("btn-map-atk").addEventListener("click", () => mapAttack());

$("dpad").addEventListener("click", (e) => {
  const btn = e.target.closest(".dpad-btn");
  if (!btn || !game) return;
  const dir = btn.getAttribute("data-dir");
  const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const d = map[dir];
  if (d) moveHero(d[0], d[1]);
});

document.addEventListener("keydown", (e) => {
  if (!$("game") || $("game").classList.contains("hidden") || !game || resetPending) return;
  const keys = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    KeyW: [0, -1],
    KeyS: [0, 1],
    KeyA: [-1, 0],
    KeyD: [1, 0],
  };
  if (e.code === "Space" || e.key === "j" || e.key === "J") {
    e.preventDefault();
    mapAttack();
    return;
  }
  const d = keys[e.code];
  if (d) {
    e.preventDefault();
    moveHero(d[0], d[1]);
  }
});

updateSetupStory("warrior");
paintHeroPortraits($("class-grid"));
startAnimLoop();
