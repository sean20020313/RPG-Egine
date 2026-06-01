/**
 * HD-2D style: retro pixel sprites + modern lighting (vignette, bloom, depth)
 */
(function (global) {
  const TILE = 32;
  const COLS = 15;
  const ROWS = 10;

  const JOBS = [
    { id: "warrior", name: "Warrior", hue: 220, accent: "#6b8cff", cape: "#3a4a8a" },
    { id: "mage", name: "Mage", hue: 280, accent: "#c78bff", cape: "#4a2868" },
    { id: "priest", name: "Priest", hue: 48, accent: "#ffe08a", cape: "#8a7030" },
    { id: "thief", name: "Thief", hue: 160, accent: "#5ee8a8", cape: "#1a5040" },
  ];

  const MONSTER_KINDS = ["slime", "goblin", "wolf", "gargoyle"];

  function fillPix(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  function buildFixedMap(seed) {
    const map = [];
    let s = seed >>> 0 || 1;
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) row.push(2);
        else row.push(s % 7 === 0 ? 2 : s % 5 === 0 ? 1 : 0);
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

  function getJob(jobId) {
    return JOBS.find((j) => j.id === jobId) || JOBS[0];
  }

  /* —— HD-2D tiles (flat top + side depth) —— */
  function drawGrassTile(ctx, px, py, tx, ty) {
    const base = (tx + ty) % 2 === 0 ? "#4a8a52" : "#3d7a48";
    fillPix(ctx, px, py, TILE, TILE, base);
    fillPix(ctx, px + 2, py + 2, TILE - 4, 2, "#5a9a62");
    fillPix(ctx, px + 4 + ((tx * 3) % 12), py + 10 + ((ty * 2) % 8), 2, 3, "#6ab86a");
    fillPix(ctx, px + 14 + ((ty * 2) % 10), py + 6, 2, 2, "#7acc7a");
  }

  function drawForestTile(ctx, px, py) {
    fillPix(ctx, px, py, TILE, TILE, "#2d5a3a");
    fillPix(ctx, px + 4, py + 18, TILE - 8, 10, "#1a3828");
    fillPix(ctx, px + 10, py + 4, 12, 12, "#3d8a50");
    fillPix(ctx, px + 8, py + 2, 16, 8, "#52a868");
    fillPix(ctx, px + 12, py + 8, 6, 6, "#2a6040");
  }

  function drawWallTile(ctx, px, py) {
    const top = "#8a8278";
    const side = "#5a5248";
    const front = "#6a6258";
    fillPix(ctx, px, py, TILE, TILE, side);
    fillPix(ctx, px, py, TILE, 6, top);
    fillPix(ctx, px, py + 6, TILE, TILE - 6, front);
    fillPix(ctx, px + 2, py + 2, TILE - 4, 3, "#a09888");
    fillPix(ctx, px + 4, py + 10, TILE - 8, 2, "#4a443c");
    fillPix(ctx, px + 8, py + 14, 4, 4, "#3a342c");
  }

  function drawTileWorld(ctx, tx, ty, kind) {
    const px0 = tx * TILE;
    const py0 = ty * TILE;
    if (kind === 2) drawWallTile(ctx, px0, py0);
    else if (kind === 1) drawForestTile(ctx, px0, py0);
    else drawGrassTile(ctx, px0, py0, tx, ty);
  }

  function drawEntityShadow(ctx, cx, cy, w, h) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* —— Distinct hero sprites per class —— */
  function drawWarriorBody(ctx, bob, dir) {
    const skin = "#e8b898";
    fillPix(ctx, -9, -2 + bob, 18, 14, "#4a5080");
    fillPix(ctx, -8, 0 + bob, 16, 12, "#6b8cff");
    fillPix(ctx, -6, -11 + bob, 12, 9, skin);
    fillPix(ctx, -7, -14 + bob, 14, 4, "#3a2818");
    fillPix(ctx, -12, -3 + bob, 5, 11, "#a0a8c0");
    fillPix(ctx, 7, -3 + bob, 5, 11, "#a0a8c0");
    fillPix(ctx, 10, -10 + bob, 4, 16, "#d0d8f0");
    if (dir !== "up") fillPix(ctx, -14, -1 + bob, 5, 14, "#9098b0");
    fillPix(ctx, -5, -7 + bob, 10, 3, "#8a2020");
  }

  function drawMageBody(ctx, bob) {
    const skin = "#f0c0a0";
    fillPix(ctx, -8, 0 + bob, 16, 14, "#3a1860");
    fillPix(ctx, -7, 2 + bob, 14, 12, "#9a5ae8");
    fillPix(ctx, -5, -10 + bob, 10, 8, skin);
    fillPix(ctx, -8, -20 + bob, 16, 8, "#4a2868");
    fillPix(ctx, -6, -22 + bob, 12, 3, "#c78bff");
    fillPix(ctx, 10, -12 + bob, 3, 16, "#5a3890");
    fillPix(ctx, 11, -14 + bob, 8, 8, "#b8f0ff");
    fillPix(ctx, 13, -12 + bob, 3, 3, "#ffffff");
    fillPix(ctx, -11, 4 + bob, 3, 6, skin);
    fillPix(ctx, 8, 4 + bob, 3, 6, skin);
  }

  function drawPriestBody(ctx, bob) {
    const skin = "#f0d0b0";
    fillPix(ctx, -9, -1 + bob, 18, 15, "#f8f0d8");
    fillPix(ctx, -8, 1 + bob, 16, 13, "#fffef5");
    fillPix(ctx, -5, -10 + bob, 10, 8, skin);
    fillPix(ctx, -9, -16 + bob, 18, 5, "#e8d880");
    fillPix(ctx, -3, -20 + bob, 6, 8, "#fff8c0");
    fillPix(ctx, -10, 2 + bob, 3, 7, skin);
    fillPix(ctx, 7, 2 + bob, 3, 7, skin);
    fillPix(ctx, -2, -6 + bob, 4, 8, "#c9a227");
  }

  function drawThiefBody(ctx, bob, dir) {
    const skin = "#d8a888";
    fillPix(ctx, -7, -1 + bob, 14, 13, "#0a2820");
    fillPix(ctx, -6, 1 + bob, 12, 11, "#1a5040");
    fillPix(ctx, -5, -9 + bob, 10, 7, skin);
    fillPix(ctx, -8, -13 + bob, 16, 5, "#1a1810");
    fillPix(ctx, -9, -11 + bob, 6, 3, "#1a1810");
    fillPix(ctx, 3, -11 + bob, 6, 3, "#1a1810");
    fillPix(ctx, -4, -8 + bob, 3, 2, "#202020");
    fillPix(ctx, 1, -8 + bob, 3, 2, "#202020");
    fillPix(ctx, 9, -5 + bob, 10, 3, "#889898");
    fillPix(ctx, 10, -7 + bob, 2, 5, "#606870");
    if (dir !== "up") fillPix(ctx, -12, 3 + bob, 4, 2, skin);
  }

  function drawHeroBody(ctx, jobId, dir, frame) {
    const bob = Math.sin(frame * 0.2) > 0 ? 1 : 0;
    const id = jobId || "warrior";
    if (id === "mage") drawMageBody(ctx, bob);
    else if (id === "priest") drawPriestBody(ctx, bob);
    else if (id === "thief") drawThiefBody(ctx, bob, dir);
    else drawWarriorBody(ctx, bob, dir);
  }

  function drawHeroSprite(ctx, tx, ty, frame, dir, jobId) {
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    ctx.save();
    ctx.translate(cx, cy);
    drawEntityShadow(ctx, 0, 0, 11, 4);
    const flip = dir === "left" ? -1 : 1;
    ctx.scale(flip, 1);
    drawHeroBody(ctx, jobId || "warrior", dir, frame);
    ctx.restore();
  }

  function drawHeroPortrait(canvas, jobId, frame) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 + 8);
    ctx.scale(2.2, 2.2);
    drawEntityShadow(ctx, 0, 0, 10, 3);
    drawHeroBody(ctx, jobId || "warrior", "down", frame || 0);
    ctx.restore();
    applyPortraitLighting(ctx, canvas.width, canvas.height);
  }

  /* —— Distinct monster pixel art —— */
  function drawSlime(ctx, frame) {
    const wob = Math.sin(frame * 0.15) * 2;
    fillPix(ctx, -12, -4 + wob, 24, 16, "#4a98b8");
    fillPix(ctx, -10, -8 + wob, 20, 12, "#7ec8e8");
    fillPix(ctx, -6, -4 + wob, 4, 4, "#1a3040");
    fillPix(ctx, 2, -4 + wob, 4, 4, "#1a3040");
    fillPix(ctx, -4, 2 + wob, 8, 4, "#9ae0ff");
  }

  function drawGoblin(ctx, frame) {
    const bob = Math.sin(frame * 0.18) > 0 ? 0 : 1;
    fillPix(ctx, -8, -6 + bob, 16, 10, "#5a9a4a");
    fillPix(ctx, -6, -14 + bob, 12, 8, "#6abf6a");
    fillPix(ctx, -8, -12 + bob, 4, 3, "#3a5828");
    fillPix(ctx, 4, -12 + bob, 4, 3, "#3a5828");
    fillPix(ctx, -5, -8 + bob, 3, 3, "#f0c040");
    fillPix(ctx, 2, -8 + bob, 3, 3, "#f0c040");
    fillPix(ctx, -10, 0 + bob, 4, 8, "#4a8840");
    fillPix(ctx, 6, 0 + bob, 4, 8, "#4a8840");
    fillPix(ctx, 8, -4 + bob, 10, 3, "#8a6040");
  }

  function drawWolf(ctx, frame) {
    const leg = Math.sin(frame * 0.25) > 0 ? 0 : 2;
    fillPix(ctx, -14, 0, 28, 10, "#6a5040");
    fillPix(ctx, -12, -8, 20, 12, "#a08060");
    fillPix(ctx, 8, -6, 10, 8, "#a08060");
    fillPix(ctx, 10, -10, 8, 6, "#806050");
    fillPix(ctx, -10, -6, 3, 3, "#ffe080");
    fillPix(ctx, -6, 6 + leg, 4, 6, "#504030");
    fillPix(ctx, 4, 6 - leg, 4, 6, "#504030");
    fillPix(ctx, -2, -4, 8, 4, "#c0a080");
  }

  function drawGargoyle(ctx, frame) {
    const wing = Math.sin(frame * 0.12) * 3;
    fillPix(ctx, -18 - wing, -6, 8, 14, "#686878");
    fillPix(ctx, 10 + wing, -6, 8, 14, "#686878");
    fillPix(ctx, -10, -4, 20, 16, "#8888a8");
    fillPix(ctx, -8, -12, 16, 10, "#9898b8");
    fillPix(ctx, -5, -8, 4, 4, "#e8c040");
    fillPix(ctx, 1, -8, 4, 4, "#e8c040");
    fillPix(ctx, -4, 0, 8, 6, "#606070");
    fillPix(ctx, -6, 10, 5, 8, "#505060");
    fillPix(ctx, 1, 10, 5, 8, "#505060");
  }

  function drawMonsterBody(ctx, typeIndex, frame) {
    const kind = MONSTER_KINDS[typeIndex % MONSTER_KINDS.length];
    if (kind === "slime") drawSlime(ctx, frame);
    else if (kind === "goblin") drawGoblin(ctx, frame);
    else if (kind === "wolf") drawWolf(ctx, frame);
    else drawGargoyle(ctx, frame);
  }

  function drawMonsterSprite(ctx, tx, ty, m, frame) {
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    ctx.save();
    ctx.translate(cx, cy);
    drawEntityShadow(ctx, 0, 0, 12, 4);
    drawMonsterBody(ctx, m.typeIndex, frame + m.id);
    const w = 22;
    const hpPct = m.maxHp > 0 ? Math.max(0, m.hp / m.maxHp) : 0;
    fillPix(ctx, -w / 2, -22, w, 4, "#1a1010");
    fillPix(ctx, -w / 2, -22, w * hpPct, 4, "#e85040");
    ctx.restore();
  }

  function drawMonsterPortrait(canvas, typeIndex, frame) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 + 10);
    ctx.scale(2.4, 2.4);
    drawEntityShadow(ctx, 0, 0, 12, 4);
    drawMonsterBody(ctx, typeIndex, frame || 0);
    ctx.restore();
    applyPortraitLighting(ctx, canvas.width, canvas.height);
  }

  function applyPortraitLighting(ctx, w, h) {
    const g = ctx.createRadialGradient(w * 0.35, h * 0.2, 4, w / 2, h / 2, w * 0.7);
    g.addColorStop(0, "rgba(255, 240, 200, 0.35)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* —— HD-2D post-process on full map —— */
  function applyHd2dLighting(ctx, w, h, mapX, mapY) {
    const sunX = mapX * TILE + TILE / 2;
    const sunY = mapY * TILE + TILE / 2;
    const light = ctx.createRadialGradient(sunX, sunY, 30, sunX, sunY, Math.max(w, h) * 0.75);
    light.addColorStop(0, "rgba(255, 230, 180, 0.18)");
    light.addColorStop(0.5, "rgba(80, 120, 160, 0.04)");
    light.addColorStop(1, "rgba(0, 0, 0, 0.22)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.9);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  function drawMiniMap(canvas, tiles, mapX, mapY, monsters) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const scale = w / COLS;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const k = tiles[y][x];
        ctx.fillStyle = k === 2 ? "#6a6258" : k === 1 ? "#2d5a3a" : "#4a8a52";
        ctx.fillRect(x * scale, y * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }
    for (const m of monsters || []) {
      ctx.fillStyle = "#e85040";
      ctx.fillRect(m.x * scale + 1, m.y * scale + 1, scale - 2, scale - 2);
    }
    ctx.fillStyle = "#7ec8ff";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mapX * scale + scale / 2, mapY * scale + scale / 2, scale * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function tilesValid(tiles) {
    if (!tiles || tiles.length !== ROWS) return false;
    for (let y = 0; y < ROWS; y++) {
      if (!tiles[y] || tiles[y].length !== COLS) return false;
    }
    return true;
  }

  const MAP_W = COLS * TILE;
  const MAP_H = ROWS * TILE;

  function prepareCanvas(canvas) {
    if (!canvas) return false;
    if (canvas.width !== MAP_W || canvas.height !== MAP_H) {
      canvas.width = MAP_W;
      canvas.height = MAP_H;
    }
    return true;
  }

  function renderWorld(canvas, tiles, mapX, mapY, monsters, animFrame, facing, heroJobId) {
    if (!canvas || !prepareCanvas(canvas)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#1a2838";
    ctx.fillRect(0, 0, w, h);

    if (!tilesValid(tiles)) {
      ctx.fillStyle = "#4a8a52";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e8ecff";
      ctx.font = "bold 14px system-ui,sans-serif";
      ctx.fillText("Map loading…", 24, 48);
      return;
    }

    const mx = Math.max(0, Math.min(COLS - 1, mapX | 0));
    const my = Math.max(0, Math.min(ROWS - 1, mapY | 0));

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        drawTileWorld(ctx, tx, ty, tiles[ty][tx]);
      }
    }

    const sorted = [...(monsters || [])].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const m of sorted) {
      if (m.y === my && m.x === mx) continue;
      drawMonsterSprite(ctx, m.x, m.y, m, animFrame);
    }

    drawHeroSprite(ctx, mx, my, animFrame, facing || "down", heroJobId);

    for (const m of monsters || []) {
      if (m.x === mx && m.y === my) {
        drawMonsterSprite(ctx, m.x, m.y, m, animFrame);
      }
    }

    applyHd2dLighting(ctx, w, h, mx, my);

    ctx.strokeStyle = "rgba(255, 220, 140, 0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(mx * TILE + 1, my * TILE + 1, TILE - 2, TILE - 2);
  }

  global.WorldView = {
    TILE,
    COLS,
    ROWS,
    MAP_W,
    MAP_H,
    JOBS,
    MONSTER_KINDS,
    buildFixedMap,
    isWalkable,
    getJob,
    prepareCanvas,
    drawHeroPortrait,
    drawMonsterPortrait,
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
