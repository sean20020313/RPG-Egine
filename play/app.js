const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "rpg-engine-browser-v8";

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
  return j?.name || "英雄";
}

function classifyFx(msg) {
  if (!msg || !String(msg).trim()) return null;
  const m = String(msg);
  if (m.includes("遊戲結束")) return { icon: "💀", cls: "fx-warn" };
  if (m.includes("任務完成") || m.includes("首領擊敗") || m.includes("掉落") || m.includes("擊敗")) return { icon: "✨", cls: "fx-win" };
  if (m.includes("使用道具") || m.includes("自癒")) return { icon: "💚", cls: "fx-heal" };
  if (m.includes("傷害") || m.includes("暴擊") || m.includes("重劈") || m.includes("火球") || m.includes("聖擊") || m.includes("暗襲")) return { icon: "💥", cls: "fx-hit" };
  if (m.includes("沒有目標") || m.includes("無法") || m.includes("魔力不足")) return { icon: "🚫", cls: "fx-warn" };
  if (m.includes("升級")) return { icon: "⬆️", cls: "fx-lvl" };
  if (m.includes("反擊")) return { icon: "💢", cls: "fx-hit" };
  if (m.includes("首領出現") || m.includes("關：") || m.includes("盾牆") || m.includes("治療術")) return { icon: "👹", cls: "fx-win" };
  if (m.includes("火球") || m.includes("冰霜") || m.includes("飛刀")) return { icon: "🔥", cls: "fx-hit" };
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

function heroStatsHtml(p, view) {
  const hpp = pct(p.hp, p.max_hp);
  const mpp = pct(p.mp, p.max_mp);
  const atkName = view?.attack_name || "";
  const atkDesc = view?.attack_desc || "";
  const rangeLabel =
    view?.attack_range_type === "ranged"
      ? `遠程 ${view.attack_range || 3} 格`
      : "近戰";
  const maxS = view?.max_stages || 5;
  const themeName = view?.map_theme_name ? `【${view.map_theme_name}】` : "";
  const stageLine = view
    ? view.all_stages_clear
      ? `全 ${maxS} 關通關！`
      : view.boss_active
        ? `第 ${view.stage}/${maxS} 關${themeName} · 首領戰`
        : `第 ${view.stage}/${maxS} 關${themeName} · 剩 ${view.normals_left ?? "?"} 隻`
    : "";
  return `
    <p class="hero-class-tag">${jobLabel(p.job_id)}</p>
    ${stageLine ? `<p class="hero-stage">${stageLine}</p>` : ""}
    <p class="hero-lv">等級 <b>${p.level}</b></p>
    ${atkName ? `<p class="hero-skill" title="${atkDesc}">普攻：<b>${atkName}</b> <span class="range-tag">${rangeLabel}</span></p>` : ""}
    ${renderSkillBarHtml(view)}
    <div class="vitals">
      <span class="bar-tag">生命</span>
      <div class="mega-bar hp"><div class="mega-fill" style="width:${hpp}%"></div></div>
      <span class="bar-tag">魔力</span>
      <div class="mega-bar mp"><div class="mega-fill" style="width:${mpp}%"></div></div>
    </div>
    <div class="mic-stats">
      <span>攻擊 <b>${p.atk}</b></span>
      <span>防禦 <b>${p.def}</b></span>
      <span>經驗 <b>${p.exp}</b></span>
    </div>`;
}

function renderSkillBarHtml(view) {
  const skills = view?.skills || [];
  if (!skills.length) return "";
  const p = view.players?.[0];
  const mp = p?.mp ?? 0;
  return `<div class="skill-bar">${skills
    .map(
      (sk) => {
        const ok = mp >= (sk.mp_cost || 0);
        return `<button type="button" class="skill-btn ${ok ? "" : "disabled"}" data-skill="${sk.index}" title="${sk.desc || ""}">
          <span class="skill-key">${sk.key}</span>
          <span class="skill-label">${sk.name}</span>
          <span class="skill-mp">${sk.mp_cost ? sk.mp_cost + " MP" : "—"}</span>
        </button>`;
      }
    )
    .join("")}</div>`;
}

function heroCardHtml(p, view) {
  return `
    <article class="portrait-card hero-card-single">
      <canvas class="hero-portrait-sm" data-job="${p.job_id || "warrior"}" width="72" height="72"></canvas>
      ${heroStatsHtml(p, view)}
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
  if (title) title.textContent = s?.title || "冒險";
  if (intro) intro.textContent = s?.intro || "";
  document.querySelectorAll(".class-pick").forEach((btn) => {
    const job = btn.getAttribute("data-job");
    const st = storyFor(job);
    const cn = btn.querySelector(".class-name");
    const hn = btn.querySelector(".class-hero-name");
    if (cn && st?.className) cn.textContent = st.className;
    if (hn && st?.name) hn.textContent = st.name;
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
  el.innerHTML = heroCardHtml(p, view);
  paintHeroPortraits(el);
  el.querySelectorAll(".skill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-skill"));
      if (!Number.isNaN(idx)) useSkill(idx);
    });
  });
}

function renderMapHint(view) {
  const el = $("map-hint");
  if (!el || !view) return;
  const theme = view.map_theme_name ? `【${view.map_theme_name}】` : "";
  const maxS = view.max_stages || 5;
  if (view.all_stages_clear) {
    el.textContent = `全 ${maxS} 關通關！按重新開始再玩一次`;
    return;
  }
  const phase = view.boss_active ? "首領戰" : `小怪 ${view.normals_left ?? 0}/8`;
  el.textContent = `第 ${view.stage}/${maxS} 關${theme} · ${phase} · WASD · 空白鍵攻擊 · 1/2 技能`;
}

function itemMeta(name) {
  return window.ItemCatalog?.[name] || { label: name, desc: "", color: "#5a7a9a", icon: "?" };
}

function questKindLabel(kind) {
  if (kind === 1) return "通關";
  if (kind === 2) return "首領";
  if (kind === 3) return "成長";
  if (kind === 4) return "技能";
  return "討伐";
}

function renderQuestCompact(q) {
  const pc = pct(q.progress, q.target);
  const done = q.done ? "done" : "";
  const locked = q.locked ? "locked" : "";
  const ico = q.done ? "✓" : q.locked ? "🔒" : "○";
  const meta = q.done ? "完成" : q.locked ? "未解鎖" : `${q.progress}/${q.target}`;
  return `<div class="quest-compact ${done} ${locked}" title="${q.desc || q.title || ""}">
    <span class="qc-ico">${ico}</span>
    <span class="qc-title">${q.title || "任務"}</span>
    <span class="qc-meta">${meta}</span>
  </div>`;
}

function renderQuestActive(q) {
  const pc = pct(q.progress, q.target);
  const kindTag = questKindLabel(q.kind);
  return `<div class="quest-sigil active">
    <div class="quest-shine" style="width:${pc}%"></div>
    <div class="quest-body">
      <span class="q-kind">${kindTag}</span>
      <span class="q-badge">進行中</span>
      <span class="q-title">${q.title || "任務"}</span>
      <p class="q-desc">${q.desc || ""}</p>
      <p class="q-reward">獎勵：${q.reward_text || "—"}</p>
      <div class="q-progress-row">
        <div class="q-bar"><div class="q-bar-fill" style="width:${pc}%"></div></div>
        <span class="q-count">${q.progress} / ${q.target}</span>
      </div>
    </div>
  </div>`;
}

function renderQuests(view) {
  const el = $("quest-list");
  const banner = $("quest-complete-banner");
  if (banner) {
    banner.classList.toggle("hidden", !view.all_quests_done);
  }
  if (!view.quests?.length) {
    el.innerHTML = `<p class="quest-empty">目前沒有進行中的任務。</p>`;
    return;
  }
  const doneCount = view.quests.filter((q) => q.done).length;
  const header = `<p class="quest-summary">任務 ${doneCount} / ${view.quests.length} 完成 · 僅展開進行中</p>`;
  const activeQ = view.quests.find((q) => q.active && !q.done);
  const parts = [];
  if (activeQ) parts.push(renderQuestActive(activeQ));
  const others = view.quests.filter((q) => q !== activeQ);
  if (others.length) parts.push(others.map(renderQuestCompact).join(""));
  el.innerHTML = header + parts.join("");
}

function renderBag(view) {
  const list = $("bag-list");
  const empty = $("bag-empty");
  const p = view.players[0];
  const items = p?.inventory || [];
  if (!items.length) {
    if (list) list.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  list.innerHTML = items
    .map((it) => {
      const meta = itemMeta(it.name);
      const effect =
        it.heal > 0 && it.mp > 0
          ? `+${it.heal} 生命、+${it.mp} 魔力`
          : it.heal > 0
            ? `+${it.heal} 生命`
            : it.mp > 0
              ? `+${it.mp} 魔力`
              : meta.desc;
      return `<button type="button" class="bag-slot" data-item-slot="${it.slot}" title="${meta.desc || effect}">
        <span class="bag-icon" style="--item-color:${meta.color}">${meta.icon}</span>
        <span class="bag-name">${meta.label || it.name}</span>
        <span class="bag-effect">${effect}</span>
        <span class="bag-qty">×${it.quantity}</span>
      </button>`;
    })
    .join("");
  list.querySelectorAll(".bag-slot").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = Number(btn.getAttribute("data-item-slot"));
      if (!Number.isNaN(slot)) useItem(slot);
    });
  });
}

function useItem(slot) {
  if (!game || resetPending) return;
  run("use", slot);
}

function setSidebarTab(tab) {
  const quests = tab === "quests";
  $("panel-quests")?.classList.toggle("hidden", !quests);
  $("panel-bag")?.classList.toggle("hidden", quests);
  document.querySelectorAll(".pill-tab").forEach((b) => {
    b.classList.toggle("on", b.getAttribute("data-tab") === tab);
  });
}

function heroJobId(view) {
  return view.hero_job_id || view.players[0]?.job_id || game?.heroJobId || "warrior";
}

function tilesOk(tiles) {
  if (!tiles || !WorldView) return false;
  return tiles.length === WorldView.ROWS && tiles[0]?.length === WorldView.COLS;
}

function rebuildWorld() {
  if (!game || !RPG?.applyMapForStage) return;
  RPG.applyMapForStage(game);
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
    WorldView.renderWorld(
      c,
      tiles,
      mx,
      my,
      monsters,
      animFrame,
      facing,
      heroJobId(view),
      game.combatFx,
      game.monsterAttackFx,
      game.mapTheme
    );
  } catch (err) {
    console.error("Map render error:", err);
    rebuildWorld();
    try {
      WorldView.renderWorld(
        c,
        game.worldTiles,
        game.mapX,
        game.mapY,
        game.mapMonsters,
        animFrame,
        facing,
        heroJobId(view),
        game.combatFx,
        game.monsterAttackFx,
        game.mapTheme
      );
    } catch (e2) {
      const ctx = c.getContext("2d");
      if (ctx && c.width > 0) {
        ctx.fillStyle = "#3d7a48";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#fff";
        ctx.font = "14px sans-serif";
        ctx.fillText("地圖錯誤 — 請按重新開始", 40, 80);
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
  renderBag(view);
  renderMapHint(view);
  renderWorldView(view);
  if (fxMsg) spawnFx(fxMsg, $("world-canvas"));
}

function startAnimLoop() {
  if (animId) return;
  const tick = () => {
    animFrame++;
    if (game && $("game") && !$("game").classList.contains("hidden")) {
      if (game.combatFx && RPG.tickCombatFx) RPG.tickCombatFx(game);
      if (game.monsterAttackFx && RPG.tickMonsterAttackFx) RPG.tickMonsterAttackFx(game);
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
    spawnFx("無法通過", $("world-canvas"));
    return;
  }
  if (RPG.monsterAt(game, nx, ny)) {
    spawnFx("無法通過", $("world-canvas"));
    return;
  }
  if (dx < 0) facing = "left";
  else if (dx > 0) facing = "right";
  else if (dy < 0) facing = "up";
  else if (dy > 0) facing = "down";
  game.mapX = nx;
  game.mapY = ny;
  game.facing = facing;
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
  game.facing = facing;
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
  spawnFx("遊戲結束", $("world-canvas"));
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
  game.facing = facing;
  run("attack");
}

function useSkill(index) {
  if (!game || resetPending) return;
  game.facing = facing;
  run("skill", index);
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
  game.facing = facing;
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
  if (game) game.facing = game.facing || facing;
  if (!game) {
    spawnFx("沒有存檔");
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
  spawnFx("已清除存檔", $("btnClearSave"));
});

$("btn-home").addEventListener("click", () => {
  if (game) saveState(game);
  goToHome();
});

$("btn-restart").addEventListener("click", () => restartGame());

$("tab-quests")?.addEventListener("click", () => setSidebarTab("quests"));
$("tab-bag")?.addEventListener("click", () => setSidebarTab("bag"));

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
  if (e.code === "Digit1" || e.key === "1") {
    e.preventDefault();
    useSkill(0);
    return;
  }
  if (e.code === "Digit2" || e.key === "2") {
    e.preventDefault();
    useSkill(1);
    return;
  }
  if (e.key === "b" || e.key === "B") {
    e.preventDefault();
    setSidebarTab("bag");
    return;
  }
  if (e.key === "q" || e.key === "Q") {
    e.preventDefault();
    setSidebarTab("quests");
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
