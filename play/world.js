/**
 * 固定地圖繪製、sprite、地圖魔物
 */
(function (global) {
  const TILE = 32;
  const COLS = 15;
  const ROWS = 10;

  function buildFixedMap(seed) {
    const map = [];
    let s = seed >>> 0 || 1;
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) row.push(2);
        else row.push(s % 7 === 0 ? 2 : s % 3 === 0 ? 1 : 0);
      }
      map.push(row);
    }
    map[1][1] = 0;
    return map;
  }

  function isWalkable(tiles, x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    return tiles[y][x] !== 2;
  }

  function drawTile(ctx, sx, sy, kind) {
    const px = sx * TILE;
    const py = sy * TILE;
    const g = ctx.createLinearGradient(px, py, px, py + TILE);
    if (kind === 2) {
      g.addColorStop(0, "#4a4038");
      g.addColorStop(1, "#2a2218");
    } else if (kind === 1) {
      g.addColorStop(0, "#2a4a38");
      g.addColorStop(1, "#1a3028");
    } else {
      g.addColorStop(0, "#243044");
      g.addColorStop(1, "#151c28");
    }
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    if (kind === 1) {
      ctx.fillStyle = "rgba(60, 140, 80, 0.35)";
      ctx.beginPath();
      ctx.arc(px + TILE / 2, py + TILE / 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (kind === 2) {
      ctx.fillStyle = "rgba(80, 70, 60, 0.5)";
      ctx.fillRect(px + 6, py + 6, TILE - 12, TILE - 12);
    }
  }

  function monsterGlyph(typeIndex) {
    const em = ["🫧", "👺", "🐺", "🗿"];
    return em[typeIndex] || "👾";
  }

  function drawMapMonster(ctx, sx, sy, m, frame) {
    const px = sx * TILE + TILE / 2;
    const py = sy * TILE + TILE / 2;
    const bob = Math.sin(frame * 0.2 + m.id) * 3;
    ctx.save();
    ctx.translate(px, py + bob);
    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(monsterGlyph(m.typeIndex), 0, 0);
    const w = 24;
    const hpPct = m.maxHp > 0 ? m.hp / m.maxHp : 0;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(-w / 2, 14, w, 4);
    ctx.fillStyle = "#ff5c3c";
    ctx.fillRect(-w / 2, 14, w * hpPct, 4);
    ctx.restore();
  }

  function drawHero(ctx, sx, sy, frame, dir) {
    const px = sx * TILE + TILE / 2;
    const py = sy * TILE + TILE / 2;
    const bob = Math.sin(frame * 0.25) * 2;
    ctx.save();
    ctx.translate(px, py + bob);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createLinearGradient(0, -14, 0, 12);
    body.addColorStop(0, "#7eb8ff");
    body.addColorStop(1, "#3a5fc0");
    ctx.fillStyle = body;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(-10, -12, 20, 22, 6);
      ctx.fill();
    } else {
      ctx.fillRect(-10, -12, 20, 22);
    }
    ctx.fillStyle = "#ffe8c8";
    ctx.beginPath();
    ctx.arc(0, -16, 8, 0, Math.PI * 2);
    ctx.fill();
    const off = { up: [0, -4], down: [0, 4], left: [-4, 0], right: [4, 0] }[dir] || [0, 0];
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(-3 + off[0], -8 + off[1], 6, 8);
    ctx.restore();
  }

  function drawMiniMap(canvas, tiles, mapX, mapY, monsters) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const scale = w / COLS;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const k = tiles[y][x];
        ctx.fillStyle = k === 2 ? "#3a3228" : k === 1 ? "#1e3830" : "#162030";
        ctx.fillRect(x * scale, y * scale, scale - 1, scale - 1);
      }
    }
    for (const m of monsters || []) {
      ctx.fillStyle = "#ff6b4a";
      ctx.fillRect(m.x * scale + 1, m.y * scale + 1, scale - 2, scale - 2);
    }
    ctx.fillStyle = "#7eb8ff";
    ctx.shadowColor = "#7eb8ff";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(mapX * scale + scale / 2, mapY * scale + scale / 2, scale * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function renderWorld(canvas, tiles, mapX, mapY, monsters, animFrame, facing) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const camX = Math.max(0, Math.min(COLS - Math.floor(w / TILE), mapX - 7));
    const camY = Math.max(0, Math.min(ROWS - Math.floor(h / TILE), mapY - 5));
    for (let y = 0; y < Math.ceil(h / TILE); y++) {
      for (let x = 0; x < Math.ceil(w / TILE); x++) {
        const tx = camX + x;
        const ty = camY + y;
        if (tx < COLS && ty < ROWS) drawTile(ctx, x, y, tiles[ty][tx]);
      }
    }
    for (const m of monsters || []) {
      const sx = m.x - camX;
      const sy = m.y - camY;
      if (sx >= 0 && sy >= 0 && sx < Math.ceil(w / TILE) && sy < Math.ceil(h / TILE)) {
        drawMapMonster(ctx, sx, sy, m, animFrame);
      }
    }
    const hx = mapX - camX;
    const hy = mapY - camY;
    drawHero(ctx, hx, hy, animFrame, facing || "down");
  }

  global.WorldView = {
    TILE,
    COLS,
    ROWS,
    buildFixedMap,
    isWalkable,
    monsterGlyph,
    renderWorld,
    drawMiniMap,
    clampPos(x, y) {
      return {
        x: Math.max(0, Math.min(COLS - 1, x)),
        y: Math.max(0, Math.min(ROWS - 1, y)),
      };
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
