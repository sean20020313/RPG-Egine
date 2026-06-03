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

  const MONSTER_KINDS = ["slime", "goblin", "wolf", "gargoyle", "bat", "skeleton", "spider", "orc"];

  function fillPix(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  const MAP_CENTER = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };

  function getMapCenter() {
    return { x: MAP_CENTER.x, y: MAP_CENTER.y };
  }

  function labelWalkableRegions(map) {
    const ids = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    let nextId = 1;
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (map[y][x] === 2 || ids[y][x]) continue;
        const q = [[x, y]];
        ids[y][x] = nextId;
        while (q.length) {
          const [cx, cy] = q.pop();
          for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            if (map[ny][nx] === 2 || ids[ny][nx]) continue;
            ids[ny][nx] = nextId;
            q.push([nx, ny]);
          }
        }
        nextId++;
      }
    }
    return ids;
  }

  /** 打通孤島，避免障礙物形成無法到達的死路 */
  function ensureMapConnectivity(map, startX, startY) {
    const sx = Math.max(1, Math.min(COLS - 2, startX | 0));
    const sy = Math.max(1, Math.min(ROWS - 2, startY | 0));
    if (map[sy][sx] === 2) map[sy][sx] = 0;

    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];

    for (let pass = 0; pass < 96; pass++) {
      const regions = labelWalkableRegions(map);
      const startRegion = regions[sy][sx];
      let allOk = true;
      for (let y = 1; y < ROWS - 1 && allOk; y++) {
        for (let x = 1; x < COLS - 1; x++) {
          if (map[y][x] !== 2 && regions[y][x] !== startRegion) {
            allOk = false;
            break;
          }
        }
      }
      if (allOk) break;

      let opened = false;
      for (let y = 1; y < ROWS - 1 && !opened; y++) {
        for (let x = 1; x < COLS - 1; x++) {
          if (map[y][x] !== 2) continue;
          const regionIds = new Set();
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (map[ny][nx] === 2) continue;
            regionIds.add(regions[ny][nx]);
          }
          if (regionIds.size >= 2 && regionIds.has(startRegion)) {
            map[y][x] = 0;
            opened = true;
            break;
          }
        }
      }
      if (opened) continue;

      for (let y = 1; y < ROWS - 1 && !opened; y++) {
        for (let x = 1; x < COLS - 1; x++) {
          if (map[y][x] === 2 || regions[y][x] === startRegion) continue;
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (map[ny][nx] !== 2) continue;
            map[ny][nx] = 0;
            opened = true;
            break;
          }
          if (opened) break;
        }
      }
    }
  }

  function clearBossArena(map) {
    const { x: cx, y: cy } = MAP_CENTER;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) continue;
        map[y][x] = 0;
      }
    }
  }

  function buildFixedMap(seed) {
    const map = [];
    let s = seed >>> 0 || 1;
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) row.push(2);
        else if (x <= 2 && y <= 2) row.push(0);
        else row.push(s % 12 === 0 ? 2 : s % 6 === 0 ? 1 : 0);
      }
      map.push(row);
    }
    map[1][1] = 0;
    clearBossArena(map);
    ensureMapConnectivity(map, 1, 1);
    clearBossArena(map);
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

  /* —— Unique boss silhouettes (variant 0–4) —— */
  function drawBossAura(ctx, frame) {
    const pulse = 4 + Math.sin(frame * 0.12) * 3;
    ctx.fillStyle = "rgba(240, 160, 40, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 4, 22 + pulse, 10 + pulse * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 220, 100, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 18 + pulse * 0.6, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBossDemon(ctx, frame) {
    const bob = Math.sin(frame * 0.1) * 2;
    fillPix(ctx, -16, -8 + bob, 32, 22, "#4a1868");
    fillPix(ctx, -14, -20 + bob, 28, 14, "#6a28a0");
    fillPix(ctx, -10, -28 + bob, 20, 10, "#2a0838");
    fillPix(ctx, -18, -24 + bob, 6, 14, "#8a3030");
    fillPix(ctx, 12, -24 + bob, 6, 14, "#8a3030");
    fillPix(ctx, -6, -14 + bob, 4, 4, "#ff4040");
    fillPix(ctx, 2, -14 + bob, 4, 4, "#ff4040");
    fillPix(ctx, -4, -4 + bob, 8, 6, "#e8c040");
    fillPix(ctx, -8, 8 + bob, 6, 10, "#3a1850");
    fillPix(ctx, 2, 8 + bob, 6, 10, "#3a1850");
  }

  function drawBossGolem(ctx, frame) {
    const crack = frame % 20 < 10 ? 0 : 1;
    fillPix(ctx, -20, -6, 40, 26, "#5a5a68");
    fillPix(ctx, -18, -22, 36, 18, "#7a7a90");
    fillPix(ctx, -12, -18, 8, 6, "#a0a0b8");
    fillPix(ctx, 4, -18, 8, 6, "#a0a0b8");
    fillPix(ctx, -6, -8 + crack, 12, 8, "#c8c8e0");
    fillPix(ctx, -22, -2, 8, 16, "#484858");
    fillPix(ctx, 14, -2, 8, 16, "#484858");
    fillPix(ctx, -4, 14, 10, 8, "#404050");
    fillPix(ctx, -14, -28, 28, 6, "#e8c060");
  }

  function drawBossShrine(ctx, frame) {
    const float = Math.sin(frame * 0.14) * 3;
    fillPix(ctx, -14, -18 + float, 28, 20, "#1a3048");
    fillPix(ctx, -10, -28 + float, 20, 12, "#88e8ff");
    fillPix(ctx, -6, -22 + float, 12, 8, "#e0ffff");
    fillPix(ctx, -4, -8 + float, 8, 8, "#4080a0");
    fillPix(ctx, -20, -10 + float, 6, 18, "#60c0e8");
    fillPix(ctx, 14, -10 + float, 6, 18, "#60c0e8");
    fillPix(ctx, -3, -26 + float, 6, 4, "#ff6080");
  }

  function drawBossShadow(ctx, frame) {
    const wisp = Math.sin(frame * 0.2) * 4;
    fillPix(ctx, -18 + wisp, -12, 36, 28, "#181828");
    fillPix(ctx, -14, -20, 28, 14, "#303048");
    fillPix(ctx, -10, -14, 6, 5, "#c060ff");
    fillPix(ctx, 0, -14, 6, 5, "#c060ff");
    fillPix(ctx, 10, -12, 6, 5, "#c060ff");
    fillPix(ctx, -6, -6, 4, 4, "#ff80ff");
    fillPix(ctx, -20 - wisp, 0, 8, 20, "#202038");
    fillPix(ctx, 12 + wisp, 0, 8, 20, "#202038");
    fillPix(ctx, -8, 12, 16, 8, "#0a0a18");
  }

  function drawBossAbyss(ctx, frame) {
    const tent = Math.sin(frame * 0.16) * 2;
    fillPix(ctx, -16, -10, 32, 18, "#280838");
    fillPix(ctx, -12, -22, 24, 14, "#501070");
    fillPix(ctx, -8, -16, 16, 8, "#8020a8");
    fillPix(ctx, -20 - tent, 2, 8, 14, "#380850");
    fillPix(ctx, 12 + tent, 2, 8, 14, "#380850");
    fillPix(ctx, -24, 8, 6, 12, "#180428");
    fillPix(ctx, 18, 8, 6, 12, "#180428");
    fillPix(ctx, -4, -8, 8, 6, "#ff40a0");
    fillPix(ctx, -10, -30, 20, 4, "#e040c0");
  }

  function drawBossBody(ctx, variant, frame) {
    const v = variant % 5;
    if (v === 0) drawBossDemon(ctx, frame);
    else if (v === 1) drawBossGolem(ctx, frame);
    else if (v === 2) drawBossShrine(ctx, frame);
    else if (v === 3) drawBossShadow(ctx, frame);
    else drawBossAbyss(ctx, frame);
  }

  function drawBat(ctx, frame) {
    const wing = Math.sin(frame * 0.35) * 5;
    fillPix(ctx, -4, -2, 8, 6, "#4a3858");
    fillPix(ctx, -10 - wing, -8, 10, 6, "#685878");
    fillPix(ctx, 2 + wing, -8, 10, 6, "#685878");
    fillPix(ctx, -3, -6, 6, 4, "#887898");
    fillPix(ctx, -2, -4, 2, 2, "#ff6060");
    fillPix(ctx, 1, -4, 2, 2, "#ff6060");
  }

  function drawSkeleton(ctx, frame) {
    const bob = Math.sin(frame * 0.2) > 0 ? 0 : 1;
    fillPix(ctx, -6, -2 + bob, 12, 14, "#d8d8e8");
    fillPix(ctx, -5, -12 + bob, 10, 8, "#f0f0f8");
    fillPix(ctx, -4, -10 + bob, 3, 3, "#202028");
    fillPix(ctx, 1, -10 + bob, 3, 3, "#202028");
    fillPix(ctx, -8, 0 + bob, 3, 10, "#c0c0d0");
    fillPix(ctx, 5, 0 + bob, 3, 10, "#c0c0d0");
    fillPix(ctx, -3, 4 + bob, 6, 8, "#b0b0c0");
    fillPix(ctx, 8, -2 + bob, 12, 3, "#a0a0b0");
  }

  function drawSpider(ctx, frame) {
    const leg = Math.sin(frame * 0.3) * 2;
    fillPix(ctx, -8, -4, 16, 10, "#2a1810");
    fillPix(ctx, -6, -10, 12, 8, "#4a2820");
    fillPix(ctx, -3, -8, 6, 4, "#c03030");
    fillPix(ctx, -12, 0 + leg, 5, 4, "#3a2018");
    fillPix(ctx, 7, 0 - leg, 5, 4, "#3a2018");
    fillPix(ctx, -10, 4 - leg, 4, 5, "#3a2018");
    fillPix(ctx, 6, 4 + leg, 4, 5, "#3a2018");
    fillPix(ctx, -2, -2, 4, 3, "#ff4040");
  }

  function drawOrc(ctx, frame) {
    const bob = Math.sin(frame * 0.15) > 0 ? 0 : 1;
    fillPix(ctx, -10, -2 + bob, 20, 16, "#3a5828");
    fillPix(ctx, -8, -14 + bob, 16, 10, "#6a8850");
    fillPix(ctx, -6, -10 + bob, 4, 3, "#ffe040");
    fillPix(ctx, 2, -10 + bob, 4, 3, "#ffe040");
    fillPix(ctx, -12, 0 + bob, 5, 12, "#4a7038");
    fillPix(ctx, 7, 0 + bob, 5, 12, "#4a7038");
    fillPix(ctx, 10, -6 + bob, 14, 4, "#8a6040");
    fillPix(ctx, -4, -16 + bob, 8, 4, "#2a3820");
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
    else if (kind === "bat") drawBat(ctx, frame);
    else if (kind === "skeleton") drawSkeleton(ctx, frame);
    else if (kind === "spider") drawSpider(ctx, frame);
    else if (kind === "orc") drawOrc(ctx, frame);
    else drawGargoyle(ctx, frame);
  }

  function drawMapPickup(ctx, tx, ty, pickup, frame, catalog) {
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const bob = Math.sin(frame * 0.18 + (pickup.id || 0)) * 3;
    const meta = catalog?.[pickup.itemName] || { color: "#e8c040", icon: "?" };
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.fillStyle = "rgba(255, 220, 120, 0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    fillPix(ctx, -9, -4, 18, 11, "#7a5028");
    fillPix(ctx, -9, -7, 18, 4, "#a07038");
    fillPix(ctx, -7, -5, 14, 2, "#c09050");
    fillPix(ctx, -4, -2, 8, 5, meta.color || "#6a88e8");
    ctx.fillStyle = "#fff8e0";
    ctx.font = "bold 11px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(meta.icon || "?", 0, 2);
    ctx.restore();
  }

  function drawMonsterSprite(ctx, tx, ty, m, frame, monsterAttackFx) {
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const boss = !!(m.isBoss);
    const attacking = monsterAttackFx && monsterAttackFx.monsterId === m.id && monsterAttackFx.ttl > 0;
    let lungeX = 0;
    let lungeY = 0;
    if (attacking) {
      const t = 1 - monsterAttackFx.ttl / 18;
      const peak = t < 0.45 ? t / 0.45 : (1 - t) / 0.55;
      lungeX = (monsterAttackFx.toX - m.x) * TILE * 0.42 * peak;
      lungeY = (monsterAttackFx.toY - m.y) * TILE * 0.42 * peak;
    }
    ctx.save();
    ctx.translate(cx + lungeX, cy + lungeY);
    if (attacking) {
      ctx.fillStyle = "rgba(255, 60, 40, 0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    if (boss) {
      drawBossAura(ctx, frame + (m.id || 0));
      ctx.scale(1.95, 1.95);
      fillPix(ctx, -16, -34, 32, 7, "#2a1808");
      fillPix(ctx, -14, -32, 28, 3, "#ffd040");
      fillPix(ctx, -12, -36, 24, 3, "#ff9040");
    }
    drawEntityShadow(ctx, 0, 0, boss ? 20 : 12, boss ? 7 : 4);
    if (boss) drawBossBody(ctx, m.bossVariant ?? 0, frame + m.id * 2);
    else drawMonsterBody(ctx, m.typeIndex, frame + m.id);
    const w = boss ? 34 : 22;
    const barY = boss ? -38 : -22;
    const hpPct = m.maxHp > 0 ? Math.max(0, m.hp / m.maxHp) : 0;
    fillPix(ctx, -w / 2, barY, w, 5, "#1a1010");
    fillPix(ctx, -w / 2, barY, w * hpPct, 5, boss ? "#ffd050" : "#e85040");
    if (boss) {
      fillPix(ctx, -w / 2, barY - 6, w, 4, "#4a2808");
      fillPix(ctx, -w / 2 + 2, barY - 5, Math.max(4, w - 4), 2, "#ffcc66");
    }
    ctx.restore();
  }

  function drawCombatFx(ctx, fx, animFrame) {
    if (!fx || fx.ttl <= 0) return;
    const t = fx.ttl / 16;
    const x0 = fx.fromX * TILE + TILE / 2;
    const y0 = fx.fromY * TILE + TILE / 2;
    const x1 = fx.toX * TILE + TILE / 2;
    const y1 = fx.toY * TILE + TILE / 2;
    const prog = 1 - t;
    const cx = x0 + (x1 - x0) * prog;
    const cy = y0 + (y1 - y0) * prog;
    const kind = fx.kind || "slash";
    const col = fx.color || "#fff";

    if (kind === "buff" || kind === "heal") {
      ctx.save();
      ctx.translate(x0, y0);
      ctx.globalAlpha = 0.5 + prog * 0.4;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 14 + (1 - prog) * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (kind === "fireball" || kind === "bolt" || kind === "knife" || kind === "holy" || kind === "frost" || kind === "poison") {
      ctx.save();
      ctx.translate(cx, cy);
      const r = kind === "fireball" ? 10 : kind === "frost" ? 14 : 6;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      if (kind === "frost") {
        ctx.strokeStyle = "#e8ffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 18 + prog * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      if (prog > 0.2) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
      return;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.7 + prog * 0.3;
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(12, 8);
    ctx.moveTo(-8, 10);
    ctx.lineTo(10, -10);
    ctx.stroke();
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

  function drawMonsterAttackFx(ctx, fx, animFrame) {
    if (!fx || fx.ttl <= 0) return;
    const t = 1 - fx.ttl / 18;
    const x0 = fx.fromX * TILE + TILE / 2;
    const y0 = fx.fromY * TILE + TILE / 2;
    const x1 = fx.toX * TILE + TILE / 2;
    const y1 = fx.toY * TILE + TILE / 2;
    const mx = x0 + (x1 - x0) * Math.min(1, t * 1.2);
    const my = y0 + (y1 - y0) * Math.min(1, t * 1.2);

    ctx.save();
    ctx.strokeStyle = "rgba(255, 80, 50, 0.85)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(mx, my);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 200, 120, 0.9)";
    ctx.lineWidth = 2;
    const slash = 12 + t * 8;
    ctx.beginPath();
    ctx.moveTo(mx - slash, my - slash * 0.6);
    ctx.lineTo(mx + slash * 0.7, my + slash * 0.5);
    ctx.moveTo(mx - slash * 0.5, my + slash * 0.4);
    ctx.lineTo(mx + slash, my - slash * 0.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 40, 30, 0.55)";
    ctx.beginPath();
    ctx.arc(mx, my, 8 + t * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function renderWorld(
    canvas,
    tiles,
    mapX,
    mapY,
    monsters,
    animFrame,
    facing,
    heroJobId,
    combatFx,
    monsterAttackFx,
    pickups,
    itemCatalog
  ) {
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
      ctx.fillText("地圖載入中…", 24, 48);
      return;
    }

    const mx = Math.max(0, Math.min(COLS - 1, mapX | 0));
    const my = Math.max(0, Math.min(ROWS - 1, mapY | 0));

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        drawTileWorld(ctx, tx, ty, tiles[ty][tx]);
      }
    }

    for (const pk of pickups || []) {
      drawMapPickup(ctx, pk.x, pk.y, pk, animFrame, itemCatalog);
    }

    const sorted = [...(monsters || [])].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const m of sorted) {
      if (m.y === my && m.x === mx) continue;
      drawMonsterSprite(ctx, m.x, m.y, m, animFrame, monsterAttackFx);
    }

    drawHeroSprite(ctx, mx, my, animFrame, facing || "down", heroJobId);

    for (const m of monsters || []) {
      if (m.x === mx && m.y === my) {
        drawMonsterSprite(ctx, m.x, m.y, m, animFrame, monsterAttackFx);
      }
    }

    if (combatFx) drawCombatFx(ctx, combatFx, animFrame);
    if (monsterAttackFx) drawMonsterAttackFx(ctx, monsterAttackFx, animFrame);

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
    getMapCenter,
    MAP_CENTER,
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
