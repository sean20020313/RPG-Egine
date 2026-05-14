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

function applyPhase(view) {
  const battle = view.phase === "battle";
  document.querySelectorAll(".battle-only").forEach((el) => {
    el.classList.toggle("hidden", !battle);
  });
  document.querySelectorAll(".explore-only").forEach((el) => {
    el.classList.toggle("hidden", battle);
  });
}

function render(view) {
  $("log").textContent = pretty(view);
  applyPhase(view);
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

document.querySelectorAll("button[data-act]").forEach((btn) => {
  btn.addEventListener("click", () => run(btn.getAttribute("data-act")));
});

$("btnUse").addEventListener("click", () => {
  const slot = Number($("useSlot").value || 0);
  run("use", slot);
});

$("btnSwitch").addEventListener("click", () => {
  const idx = Number($("swIdx").value || 0);
  run("switch", idx);
});

window.addEventListener("DOMContentLoaded", () => {
  game = loadState();
  if (game) {
    $("game").classList.remove("hidden");
    render(RPG.toView(game));
  }
});
