const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "rpg-engine-browser-v2";
const SLOT_GLYPHS = ["◆", "◇", "○", "□"];
const DEFAULT_HUES = [210, 280, 160, 30];

let game = null;
let animFrame = 0;
let animId = null;
let facing = "down";

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

function monsterEmoji(name) {
  if (!name) return "👾";
  if (name.includes("史萊姆")) return "🫧";
  if (name.includes("哥布林")) return "👺";
  if (name.includes("狼")) return "🐺";
  if (name.includes("石像鬼")) return "🗿";
  return "👾";
}

function itemEmoji(name) {
  if (name.includes("藥草")) return "🌿";
  if (name.includes("強效")) return "💜";
  if (name.includes("藥水")) return "💧";
  return "✧";
}

function classifyFx(msg) {
  if (!msg || !String(msg).trim()) return null;
  const m = String(msg);
  if (m.includes("遭遇")) return { icon: "⚔️", cls: "fx-battle" };
  if (m.includes("擊敗")) return { icon: "✨", cls: "fx-win" };
  if (m.includes("反擊") || m.includes("傷害")) return { icon: "💥", cls: "fx-hit" };
  if (m.includes("成功逃離")) return { icon: "🏃", cls: "fx-flee" };
  if (m.includes("逃跑失敗")) return { icon: "❗", cls: "fx-warn" };
  if (m.includes("回溯")) return { icon: "↩️", cls: "fx-undo" };
  if (m.includes("撿到") || m.includes("藥草")) return { icon: "🧺", cls: "fx-loot" };
  if (m.includes("防禦")) return { icon: "🛡️", cls: "fx-def" };
  if (m.includes("回復") || m.includes("使用道具")) return { icon: "💚", cls: "fx-heal" };
  if (m.includes("任務")) return { icon: "📜", cls: "fx-quest" };
  if (m.includes("升級")) return { icon: "⬆️", cls: "fx-lvl" };
  if (m.includes("戰鬥中") || m.includes("不能") || m.includes("無效") || m.includes("此欄位"))
    return { icon: "🚫", cls: "fx-warn" };
  if (m.includes("冒險") || m.includes("角色")) return { icon: "🎴", cls: "fx-start" };
  if (m.includes("安靜") || m.includes("氣息")) return { icon: "🌙", cls: "fx-calm" };
  if (m.includes("沒有存檔") || m.includes("已清除")) return { icon: "📂", cls: "fx-save" };
  if (m.includes("攻擊")) return { icon: "⚔️", cls: "fx-atk" };
  if (m.includes("無目標") || m.includes("受阻")) return { icon: "🚫", cls: "fx-warn" };
  if (m.includes("出發")) return { icon: "🎴", cls: "fx-start" };
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
  if (fx.cls === "fx-hit" || fx.cls === "fx-battle") {
    $("foe-frame")?.classList.add("shake");
    setTimeout(() => $("foe-frame")?.classList.remove("shake"), 400);
  }
  if (fx.cls === "fx-heal") {
    document.querySelector(".arena-ally")?.classList.add("glow-heal");
    setTimeout(() => document.querySelector(".arena-ally")?.classList.remove("glow-heal"), 500);
  }
}

function heroCardHtml(p, { compact = false, active = false, selectable = false, hidePartyIndex = false } = {}) {
  const hue = DEFAULT_HUES[p.index % DEFAULT_HUES.length] ?? hueFromName(p.name);
  const glyph = SLOT_GLYPHS[p.index % SLOT_GLYPHS.length] || "◆";
  const hpp = pct(p.hp, p.max_hp);
  const mpp = pct(p.mp, p.max_mp);
  const cls = ["portrait-card", compact && "compact", active && "is-active", selectable && "is-selectable"]
    .filter(Boolean)
    .join(" ");
  const dataIdx = hidePartyIndex ? "" : ` data-party-index="${p.index}"`;
  return `
    <article class="${cls}"${dataIdx}>
      <div class="ring-avatar" style="--hue:${hue}"><span>${glyph}</span></div>
      <span class="lv-badge">${p.level}</span>
      <div class="vitals">
        <div class="mega-bar hp"><div class="mega-fill" style="width:${hpp}%"></div></div>
        <div class="mega-bar mp"><div class="mega-fill" style="width:${mpp}%"></div></div>
      </div>
      <div class="mic-stats">
        <span>⚔<b>${p.atk}</b></span>
        <span>🛡<b>${p.def}</b></span>
        <span>✧<b>${p.exp}</b></span>
      </div>
    </article>`;
}

function hueFromName(name) {
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return h % 360;
}

function renderParty(view) {
  const el = $("party-list");
  const inExplore = view.phase === "explore";
  el.innerHTML = view.players
    .map((p) =>
      heroCardHtml(p, {
        compact: false,
        active: p.index === view.active_player,
        selectable: inExplore && view.players.length > 1,
      }),
    )
    .join("");
  el.querySelectorAll("[data-party-index]").forEach((card) => {
    if (!inExplore || view.players.length <= 1) return;
    card.addEventListener("click", () => {
      const idx = Number(card.getAttribute("data-party-index"));
      if (!Number.isNaN(idx)) run("switch", idx);
    });
  });
}

function renderQuests(view) {
  const el = $("quest-list");
  el.innerHTML = view.quests
    .map((q) => {
      const pc = pct(q.progress, q.target);
      const done = q.done ? "done" : "";
      return `<div class="quest-sigil ${done}">
        <div class="quest-shine" style="width:${pc}%"></div>
        <span class="q-ico" aria-hidden="true">📜</span>
        <div class="q-ring" style="background:conic-gradient(#d4b66a ${pc}%, rgba(255,255,255,0.06) 0)">
          <span class="q-ring-inner">${q.progress}<span class="q-slash">/</span>${q.target}</span>
        </div>
      </div>`;
    })
    .join("");
}

function renderItemDock(el, view, { interactive } = { interactive: false }) {
  const p = view.players[view.active_player];
  if (!p?.inventory?.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = p.inventory
    .map((it) => {
      const disabled = !interactive || it.quantity <= 0;
      const em = itemEmoji(it.name);
      return `<button type="button" class="potion" data-item-slot="${it.slot}" data-emoji="${em}" ${
        disabled ? "disabled" : ""
      }"><span class="stk">${it.quantity}</span></button>`;
    })
    .join("");
  if (interactive) {
    el.querySelectorAll("[data-item-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!btn.disabled) run("use", Number(btn.getAttribute("data-item-slot")));
      });
    });
  }
}

function renderBattleScene(view) {
  const b = view.battle;
  if (!b) return;
  $("monster-emoji").textContent = monsterEmoji(b.name);
  $("monster-atk").textContent = String(b.atk);
  $("monster-def").textContent = String(b.def);
  $("monster-hp-fill").style.width = `${pct(b.hp, b.max_hp)}%`;
  const p = view.players[view.active_player];
  $("battle-hero-card").innerHTML = p
    ? heroCardHtml(p, { compact: true, active: true, selectable: false, hidePartyIndex: true })
    : "";
}

function applyScene(view) {
  const battle = view.phase === "battle";
  $("scene-explore").classList.toggle("hidden", battle);
  $("scene-battle").classList.toggle("hidden", !battle);
  $("scene-explore-footer").classList.toggle("hidden", battle);
  $("hud-mode-explore").classList.toggle("hidden", battle);
  $("hud-mode-battle").classList.toggle("hidden", !battle);
  $("dpad").classList.toggle("hidden", battle);

  $("skill-grid").querySelectorAll(".sigil").forEach((btn) => {
    const sk = btn.getAttribute("data-skill");
    if (!battle) {
      btn.disabled = true;
      return;
    }
    if (sk === "undo") btn.disabled = !view.battle?.can_undo;
    else btn.disabled = false;
  });

  const midAtk = document.querySelector(".d-mid");
  if (midAtk) midAtk.disabled = battle;
}

function renderWorldView(view) {
  if (!game || view.phase === "battle") return;
  const c = $("world-canvas");
  const tiles = game.worldTiles;
  const monsters = game.mapMonsters || [];
  if (c && WorldView && tiles?.length) {
    WorldView.renderWorld(c, tiles, view.map.x, view.map.y, monsters, animFrame, facing);
  }
  const mini = $("mini-map");
  if (mini && WorldView && tiles?.length) {
    WorldView.drawMiniMap(mini, tiles, view.map.x, view.map.y, monsters);
  }
}

function renderView(view, fxMsg) {
  renderParty(view);
  renderQuests(view);
  renderItemDock($("item-dock-explore"), view, { interactive: false });
  renderItemDock($("item-dock-battle"), view, { interactive: view.phase === "battle" });
  if (view.phase === "battle") renderBattleScene(view);
  applyScene(view);
  renderWorldView(view);
  if (fxMsg) spawnFx(fxMsg, view.phase === "battle" ? $("foe-frame") : $("world-canvas"));
}

function startAnimLoop() {
  if (animId) return;
  const tick = () => {
    animFrame++;
    if (game && $("game") && !$("game").classList.contains("hidden")) {
      const view = RPG.toView(game);
      if (view.phase === "explore") renderWorldView(view);
    }
    animId = requestAnimationFrame(tick);
  };
  animId = requestAnimationFrame(tick);
}

function selectedHeroNames() {
  const picks = document.querySelectorAll(".slot-pick.on");
  const names = [];
  picks.forEach((btn) => {
    const i = Number(btn.getAttribute("data-slot"));
    names.push(SLOT_GLYPHS[i] || `H${i + 1}`);
  });
  return names.length ? names : [SLOT_GLYPHS[0]];
}

function syncMapFromEngine() {
  if (!game) return;
  const p = WorldView.clampPos(game.mapX, game.mapY);
  game.mapX = p.x;
  game.mapY = p.y;
}

function moveHero(dx, dy) {
  if (!game || game.inBattle) return;
  syncMapFromEngine();
  const nx = game.mapX + dx;
  const ny = game.mapY + dy;
  const tiles = game.worldTiles;
  if (!tiles?.length || !WorldView.isWalkable(tiles, nx, ny)) {
    spawnFx("受阻", $("world-canvas"));
    return;
  }
  if (RPG.monsterAt(game, nx, ny)) {
    spawnFx("無目標", $("world-canvas"));
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
  if (game?.inBattle) {
    game.inBattle = 0;
    game.engagedMonsterId = 0;
    game.undo = [];
  }
  game = null;
  $("game").classList.add("hidden");
  $("setup").classList.remove("hidden");
  $("menu-overlay").classList.add("hidden");
}

function restartGame() {
  localStorage.removeItem(STORAGE_KEY);
  game = RPG.newGame(selectedHeroNames());
  syncMapFromEngine();
  saveState(game);
  $("game").classList.remove("hidden");
  $("setup").classList.add("hidden");
  renderView(RPG.toView(game), game.message);
  startAnimLoop();
}

function run(cmd, arg, anchor) {
  if (!game) return;
  const battleCmd = cmd === "attack" && game.inBattle;
  RPG.applyCommand(game, battleCmd ? "battle_attack" : cmd, arg);
  saveState(game);
  const view = RPG.toView(game);
  renderView(view, game.message);
}

$("hero-slots").addEventListener("click", (e) => {
  const btn = e.target.closest(".slot-pick");
  if (!btn) return;
  const onCount = document.querySelectorAll(".slot-pick.on").length;
  if (btn.classList.contains("on") && onCount <= 1) return;
  btn.classList.toggle("on");
});

$("btnNew").addEventListener("click", () => {
  game = RPG.newGame(selectedHeroNames());
  syncMapFromEngine();
  saveState(game);
  $("game").classList.remove("hidden");
  $("setup").classList.add("hidden");
  const view = RPG.toView(game);
  renderView(view, game.message);
  startAnimLoop();
});

$("btnResume").addEventListener("click", () => {
  game = loadState();
  if (!game) {
    spawnFx("沒有存檔");
    return;
  }
  syncMapFromEngine();
  $("game").classList.remove("hidden");
  $("setup").classList.add("hidden");
  renderView(RPG.toView(game));
  startAnimLoop();
});

$("btnClearSave").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  spawnFx("已清除", $("btnClearSave"));
});

$("btn-home").addEventListener("click", () => {
  if (game) saveState(game);
  goToHome();
});

$("btn-restart").addEventListener("click", () => {
  restartGame();
});

$("btn-menu").addEventListener("click", () => $("menu-overlay").classList.remove("hidden"));
$("menu-close").addEventListener("click", () => $("menu-overlay").classList.add("hidden"));
$("menu-overlay").addEventListener("click", (e) => {
  if (e.target === $("menu-overlay")) $("menu-overlay").classList.add("hidden");
});

document.querySelectorAll(".menu-cell").forEach((btn) => {
  btn.addEventListener("click", () => {
    const m = btn.getAttribute("data-menu");
    $("menu-overlay").classList.add("hidden");
    $("rail-party").classList.toggle("hidden", m !== "party" && m !== "items");
    $("rail-quests").classList.toggle("hidden", m !== "quests");
    if (m === "save") saveState(game);
    if (m === "home") {
      if (game) saveState(game);
      goToHome();
      return;
    }
    if (m === "restart") {
      restartGame();
      return;
    }
    spawnFx(m === "save" ? "存檔" : "", btn);
  });
});

$("dpad").addEventListener("click", (e) => {
  const btn = e.target.closest(".dpad-btn");
  if (!btn || !game || btn.disabled) return;
  const dir = btn.getAttribute("data-dir");
  if (dir === "attack") {
    run("attack", null, $("world-canvas"));
    return;
  }
  const dmap = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const d = dmap[dir];
  if (d) moveHero(d[0], d[1]);
});

$("skill-grid").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-skill]");
  if (!btn || btn.disabled) return;
  run(btn.getAttribute("data-skill"), null, btn);
});

window.addEventListener("keydown", (e) => {
  if (!game || $("game").classList.contains("hidden")) return;
  const view = RPG.toView(game);
  if (view.phase === "battle") {
    const kmap = { j: "attack", z: "attack", a: "attack", s: "defend", f: "flee", r: "undo", "1": "use" };
    const k = e.key.toLowerCase();
    if (kmap[k]) {
      if (k === "1") run("use", 0);
      else run(kmap[k]);
      e.preventDefault();
    }
    return;
  }
  const moves = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0],
  };
  const m = moves[e.key];
  if (m) {
    moveHero(m[0], m[1]);
    e.preventDefault();
  }
  if (e.key === " " || e.key === "j" || e.key === "z") {
    run("attack", null, $("world-canvas"));
    e.preventDefault();
  }
});

window.addEventListener("DOMContentLoaded", () => {
  game = loadState();
  if (game) {
    $("game").classList.remove("hidden");
    $("setup").classList.add("hidden");
    syncMapFromEngine();
    renderView(RPG.toView(game));
    startAnimLoop();
  }
});
