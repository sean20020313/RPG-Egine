const $ = (id) => document.getElementById(id);

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

async function api(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || r.statusText);
  return data;
}

function applyPhase(data) {
  const battle = data.phase === "battle";
  document.querySelectorAll(".battle-only").forEach((el) => {
    el.classList.toggle("hidden", !battle);
  });
  document.querySelectorAll(".explore-only").forEach((el) => {
    el.classList.toggle("hidden", battle);
  });
}

function render(data) {
  $("log").textContent = pretty(data);
  applyPhase(data);
}

$("btnNew").addEventListener("click", async () => {
  const raw = $("names").value || "勇者";
  const names = raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const data = await api("/api/session", { names });
    $("sid").textContent = data.session;
    $("game").classList.remove("hidden");
    render(data);
  } catch (e) {
    alert(e.message || String(e));
  }
});

async function act(action, arg) {
  const sid = $("sid").textContent.trim();
  if (!sid) return;
  try {
    const payload = { session: sid, action };
    if (arg !== undefined && arg !== null) payload.arg = arg;
    const data = await api("/api/action", payload);
    render(data);
  } catch (e) {
    alert(e.message || String(e));
  }
}

document.querySelectorAll("button[data-act]").forEach((btn) => {
  btn.addEventListener("click", () => act(btn.getAttribute("data-act")));
});

$("btnUse").addEventListener("click", () => {
  const slot = Number($("useSlot").value || 0);
  act("use", slot);
});

$("btnSwitch").addEventListener("click", () => {
  const idx = Number($("swIdx").value || 0);
  act("switch", idx);
});
