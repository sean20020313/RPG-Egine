const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "rpg-engine-browser-v1";

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(RPG.serialize(g)));
  } catch (e) {
    console.warn(e);
  }
}

function monsterEmoji(name) {
  if (!name) return "👾";
  if (name.includes("史萊姆")) return "🫧";
  if (name.includes("哥布林")) return "👺";
  if (name.includes("狼")) return "🐺";
  if (name.includes("石像鬼")) return "🗿";
  return "👾";
}

function pct(cur, max) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((100 * cur) / max));
}

function heroCardHtml(p, { compact = false, active = false, selectable = false, hidePartyIndex = false } = {}) {
  const cls = ["hero-card", compact && "compact", active && "is-active", selectable && "is-selectable"]
    .filter(Boolean)
    .join(" ");
  const dataIdx = hidePartyIndex ? "" : ` data-party-index="${p.index}"`;
  return `
    <div class="${cls}"${dataIdx}>
      <div class="hero-top">
        <span class="hero-name">${escapeHtml(p.name)}</span>
        <span class="hero-lv">Lv.${p.level}</span>
      </div>
      <div class="stat-row small">
        <span>ATK <strong>${p.atk}</strong></span>
        <span>DEF <strong>${p.def}</strong></span>
        <span>EXP <strong>${p.exp}</strong>/100</span>
      </div>
      <div class="bar-wrap">
        <div class="bar-label"><span>HP</span><span>${p.hp} / ${p.max_hp}</span></div>
        <div class="bar"><div class="bar-fill hp" style="width:${pct(p.hp, p.max_hp)}%"></div></div>
      </div>
      <div class="bar-wrap">
        <div class="bar-label"><span>MP</span><span>${p.mp} / ${p.max_mp}</span></div>
        <div class="bar"><div class="bar-fill mp" style="width:${pct(p.mp, p.max_mp)}%"></div></div>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      if (Number.isNaN(idx)) return;
      run("switch", idx);
    });
  });
}

function renderQuests(view) {
  const el = $("quest-list");
  el.innerHTML = view.quests
    .map(
      (q) => `
      <div class="quest-card ${q.done ? "done" : ""}">
        <div class="quest-title">${escapeHtml(q.title)}</div>
        <div class="quest-desc">${escapeHtml(q.desc)}</div>
        <div class="bar-wrap">
          <div class="bar-label"><span>進度</span><span>${q.progress} / ${q.target}</span></div>
          <div class="bar"><div class="bar-fill mp" style="width:${pct(q.progress, q.target)}%"></div></div>
        </div>
      </div>`,
    )
    .join("");
}

function renderItemDock(el, view, { interactive } = { interactive: false }) {
  const p = view.players[view.active_player];
  if (!p || !p.inventory || p.inventory.length === 0) {
    el.innerHTML = `<span style="color:#6b7f95;font-size:0.88rem;">（空背包）</span>`;
    return;
  }
  el.innerHTML = p.inventory
    .map((it) => {
      const disabled = !interactive || it.quantity <= 0;
      return `<button type="button" class="item-chip" data-item-slot="${it.slot}" ${disabled ? "disabled" : ""}>
        <span>${escapeHtml(it.name)}</span>
        <span class="qty">×${it.quantity}</span>
        ${it.heal > 0 ? `<span class="heal-tag">+${it.heal} HP</span>` : ""}
      </button>`;
    })
    .join("");

  if (interactive) {
    el.querySelectorAll("[data-item-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const slot = Number(btn.getAttribute("data-item-slot"));
        run("use", slot);
      });
    });
  }
}

function renderBattleScene(view) {
  const b = view.battle;
  if (!b) return;
  $("monster-emoji").textContent = monsterEmoji(b.name);
  $("monster-name").textContent = b.name;
  $("monster-atk").textContent = String(b.atk);
  $("monster-def").textContent = String(b.def);
  $("monster-hp-text").textContent = `${b.hp} / ${b.max_hp}`;
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

  $("skill-grid").querySelectorAll("button[data-skill]").forEach((btn) => {
    const sk = btn.getAttribute("data-skill");
    if (!battle) {
      btn.disabled = true;
      return;
    }
    if (sk === "undo") btn.disabled = !view.battle || !view.battle.can_undo;
    else btn.disabled = false;
  });
}

function render(view) {
  $("banner").textContent = view.message || "—";
  $("hud-map").textContent = `(${view.map.x}, ${view.map.y})`;
  $("raw-json").textContent = pretty(view);

  renderParty(view);
  renderQuests(view);
  renderItemDock($("item-dock-explore"), view, { interactive: false });
  renderItemDock($("item-dock-battle"), view, { interactive: view.phase === "battle" });

  if (view.phase === "battle") renderBattleScene(view);

  applyScene(view);
}

let game = null;

function run(cmd, arg) {
  if (!game) return;
  RPG.applyCommand(game, cmd, arg);
  saveState(game);
  render(RPG.toView(game));
}

$("btnNew").addEventListener("click", () => {
  const raw = $("names").value || "勇者";
  const names = raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  game = RPG.newGame(names);
  saveState(game);
  $("game").classList.remove("hidden");
  render(RPG.toView(game));
});

$("btnResume").addEventListener("click", () => {
  game = loadState();
  if (!game) {
    alert("沒有找到已儲存的進度。");
    return;
  }
  $("game").classList.remove("hidden");
  render(RPG.toView(game));
});

$("btnClearSave").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  alert("已清除本機存檔。");
});

$("btnExploreBig").addEventListener("click", () => run("explore"));

$("skill-grid").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-skill]");
  if (!btn || btn.disabled) return;
  run(btn.getAttribute("data-skill"));
});

window.addEventListener("DOMContentLoaded", () => {
  game = loadState();
  if (game) {
    $("game").classList.remove("hidden");
    render(RPG.toView(game));
  }
});
