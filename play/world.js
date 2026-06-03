/**
 * HD-2D style: retro pixel sprites + modern lighting (vignette, bloom, depth)
 */
(function (global) {
  const TILE = 64;
  const COLS = 15;
  const ROWS = 10;

  /** 0 草地 1 造景 2 障礙 3 河流 4 村莊地面 5 建築 6 橋 */
  const T = { FLOOR: 0, PROP: 1, WALL: 2, WATER: 3, VILLAGE: 4, BUILDING: 5, BRIDGE: 6 };

  function isBlockingTile(k) {
    return k === T.WALL || k === T.WATER || k === T.BUILDING;
  }

  function inMap(x, y) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS;
  }

  function isBossCell(x, y) {
    const { x: cx, y: cy } = MAP_CENTER;
    return Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1;
  }

  function isSpawnCell(x, y) {
    return x <= 2 && y <= 2;
  }

  function mapRand(seed) {
    return (Math.imul(seed >>> 0, 1103515245) + 12345) >>> 0;
  }

  function setTile(map, x, y, val) {
    if (!inMap(x, y)) return;
    if (isBossCell(x, y) || isSpawnCell(x, y)) return;
    if (map[y][x] === T.WALL) return;
    map[y][x] = val;
  }

  function setBridge(map, x, y) {
    if (!inMap(x, y) || isBossCell(x, y) || isSpawnCell(x, y)) return;
    if (map[y][x] === T.WALL) return;
    map[y][x] = T.BRIDGE;
  }

  function carveRiverH(map, y, x0, x1) {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) setTile(map, x, y, T.WATER);
  }

  function carveRiverV(map, x, y0, y1) {
    const a = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    for (let y = a; y <= b; y++) setTile(map, x, y, T.WATER);
  }

  const JOBS = [
    { id: "warrior", name: "Warrior", hue: 220, accent: "#6b8cff", cape: "#3a4a8a" },
    { id: "mage", name: "Mage", hue: 280, accent: "#c78bff", cape: "#4a2868" },
    { id: "priest", name: "Priest", hue: 48, accent: "#ffe08a", cape: "#8a7030" },
    { id: "thief", name: "Thief", hue: 160, accent: "#5ee8a8", cape: "#1a5040" },
  ];

  const MONSTER_KINDS = [
    "slime",
    "goblin",
    "wolf",
    "gargoyle",
    "bat",
    "skeleton",
    "spider",
    "orc",
    "meadow_fairy",
    "snow_yeti",
    "lava_imp",
    "ruin_wraith",
    "crystal_shard",
  ];

  /** 各關卡專屬怪物池（僅該關出現的種類與名稱） */
  global.STAGE_MONSTER_POOLS = [
    {
      theme: "meadow",
      entries: [
        { typeIndex: 0, name: "草原史萊姆" },
        { typeIndex: 1, name: "野草哥布林" },
        { typeIndex: 2, name: "疾風野狼" },
        { typeIndex: 8, name: "花蔓妖" },
      ],
    },
    {
      theme: "snow",
      entries: [
        { typeIndex: 4, name: "冰霜蝙蝠" },
        { typeIndex: 5, name: "凍骨士兵" },
        { typeIndex: 2, name: "雪原狼" },
        { typeIndex: 9, name: "霜雪人" },
      ],
    },
    {
      theme: "volcano",
      entries: [
        { typeIndex: 6, name: "熔岩蜘蛛" },
        { typeIndex: 7, name: "炎獸人" },
        { typeIndex: 3, name: "焦土石像" },
        { typeIndex: 10, name: "火焰小鬼" },
      ],
    },
    {
      theme: "ruins",
      entries: [
        { typeIndex: 5, name: "遺跡骷髏" },
        { typeIndex: 3, name: "斷垣石像" },
        { typeIndex: 7, name: "遊蕩獸人" },
        { typeIndex: 11, name: "古代幽靈" },
      ],
    },
    {
      theme: "crystal",
      entries: [
        { typeIndex: 0, name: "晶化史萊姆" },
        { typeIndex: 4, name: "棱光蝙蝠" },
        { typeIndex: 6, name: "晶網蜘蛛" },
        { typeIndex: 12, name: "水晶碎靈" },
      ],
    },
  ];

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
        if (isBlockingTile(map[y][x]) || ids[y][x]) continue;
        const q = [[x, y]];
        ids[y][x] = nextId;
        while (q.length) {
          const [cx, cy] = q.pop();
          for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            if (isBlockingTile(map[ny][nx]) || ids[ny][nx]) continue;
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
    if (isBlockingTile(map[sy][sx])) map[sy][sx] = T.FLOOR;

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
          if (!isBlockingTile(map[y][x]) && regions[y][x] !== startRegion) {
            allOk = false;
            break;
          }
        }
      }
      if (allOk) break;

      let opened = false;
      for (let y = 1; y < ROWS - 1 && !opened; y++) {
        for (let x = 1; x < COLS - 1; x++) {
          if (!isBlockingTile(map[y][x])) continue;
          const regionIds = new Set();
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (isBlockingTile(map[ny][nx])) continue;
            regionIds.add(regions[ny][nx]);
          }
          if (regionIds.size >= 2 && regionIds.has(startRegion)) {
            map[y][x] = T.FLOOR;
            opened = true;
            break;
          }
        }
      }
      if (opened) continue;

      for (let y = 1; y < ROWS - 1 && !opened; y++) {
        for (let x = 1; x < COLS - 1; x++) {
          if (!isBlockingTile(map[y][x]) || regions[y][x] === startRegion) continue;
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (!isBlockingTile(map[ny][nx])) continue;
            map[ny][nx] = T.FLOOR;
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
        map[y][x] = T.FLOOR;
      }
    }
  }

  const MAX_MAP_STAGES = 5;

  const MAP_THEMES = [
    {
      id: "meadow",
      name: "草原",
      wallMod: 13,
      decorMod: 5,
      floorA: "#4a9a55",
      floorB: "#3d8a48",
      floorHi: "#7acc7a",
      decorBase: "#2d6a38",
      wallSide: "#6a7a50",
      wallTop: "#9aaa70",
      wallFront: "#7a8a58",
      light: "rgba(255, 240, 200, 0.2)",
      vignette: "rgba(20, 50, 30, 0.2)",
      bg: "#243828",
    },
    {
      id: "snow",
      name: "雪原",
      wallMod: 12,
      decorMod: 6,
      floorA: "#d0e4f0",
      floorB: "#b8d0e0",
      floorHi: "#f0f8ff",
      decorBase: "#90b0c8",
      wallSide: "#8098a8",
      wallTop: "#e0eef8",
      wallFront: "#a8b8c8",
      light: "rgba(230, 245, 255, 0.25)",
      vignette: "rgba(30, 50, 90, 0.2)",
      bg: "#2a3848",
    },
    {
      id: "volcano",
      name: "熔岩",
      wallMod: 11,
      decorMod: 6,
      floorA: "#5a3028",
      floorB: "#4a2018",
      floorHi: "#c06040",
      decorBase: "#3a1810",
      wallSide: "#4a2018",
      wallTop: "#8a4838",
      wallFront: "#602820",
      light: "rgba(255, 120, 60, 0.24)",
      vignette: "rgba(50, 10, 0, 0.35)",
      bg: "#301008",
    },
    {
      id: "ruins",
      name: "遺跡",
      wallMod: 10,
      decorMod: 7,
      floorA: "#7a7878",
      floorB: "#686666",
      floorHi: "#a0a0a8",
      decorBase: "#484850",
      wallSide: "#505058",
      wallTop: "#a8a8b0",
      wallFront: "#787880",
      light: "rgba(255, 235, 200, 0.12)",
      vignette: "rgba(0, 0, 0, 0.35)",
      bg: "#1c1c24",
    },
    {
      id: "crystal",
      name: "水晶",
      wallMod: 12,
      decorMod: 5,
      floorA: "#5848a0",
      floorB: "#483888",
      floorHi: "#b0a0f0",
      decorBase: "#302070",
      wallSide: "#403080",
      wallTop: "#9080d8",
      wallFront: "#6050a8",
      light: "rgba(200, 180, 255, 0.26)",
      vignette: "rgba(30, 0, 60, 0.3)",
      bg: "#1a1030",
    },
  ];

  function getThemeForStage(stage) {
    const s = Math.max(1, Math.min(MAX_MAP_STAGES, stage | 0));
    return MAP_THEMES[s - 1];
  }

  function generateMapTiles(seed, stage) {
    const theme = getThemeForStage(stage);
    const map = [];
    let s = seed >>> 0 || 1;
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) row.push(2);
        else if (x <= 2 && y <= 2) row.push(0);
        else if (s % theme.wallMod === 0) row.push(2);
        else if (s % theme.decorMod === 0) row.push(1);
        else row.push(0);
      }
      map.push(row);
    }
    map[1][1] = 0;
    clearBossArena(map);
    ensureMapConnectivity(map, 1, 1);
    clearBossArena(map);
    applyStageFeatures(map, s, theme);
    return { tiles: map, theme };
  }

  function placeVillageLayout(map, cells) {
    for (const [x, y, kind] of cells) setTile(map, x, y, kind);
  }

  function applyThemeRiver(map, theme) {
    if (theme.id === "meadow") {
      carveRiverH(map, 8, 3, 12);
      setBridge(map, 9, 8);
    } else if (theme.id === "snow") {
      carveRiverV(map, 12, 2, 7);
      setBridge(map, 12, 5);
      carveRiverH(map, 2, 8, 11);
    } else if (theme.id === "volcano") {
      carveRiverV(map, 3, 2, 8);
      setBridge(map, 3, 5);
      carveRiverH(map, 8, 2, 6);
    } else if (theme.id === "ruins") {
      carveRiverH(map, 8, 2, 12);
      setBridge(map, 10, 8);
      carveRiverV(map, 2, 4, 7);
    } else if (theme.id === "crystal") {
      carveRiverH(map, 2, 2, 9);
      setBridge(map, 7, 2);
      carveRiverV(map, 11, 3, 7);
    }
  }

  function applyThemeVillage(map, theme) {
    if (theme.id === "meadow") {
      placeVillageLayout(map, [
        [2, 2, T.BUILDING],
        [3, 2, T.BUILDING],
        [2, 3, T.VILLAGE],
        [3, 3, T.VILLAGE],
        [4, 2, T.PROP],
        [4, 3, T.PROP],
        [2, 4, T.PROP],
      ]);
    } else if (theme.id === "snow") {
      placeVillageLayout(map, [
        [3, 2, T.BUILDING],
        [4, 2, T.BUILDING],
        [3, 3, T.VILLAGE],
        [4, 3, T.VILLAGE],
        [5, 2, T.PROP],
        [2, 3, T.PROP],
        [5, 3, T.PROP],
      ]);
    } else if (theme.id === "volcano") {
      placeVillageLayout(map, [
        [10, 2, T.BUILDING],
        [11, 2, T.BUILDING],
        [10, 3, T.VILLAGE],
        [11, 3, T.VILLAGE],
        [12, 2, T.PROP],
        [9, 3, T.PROP],
      ]);
    } else if (theme.id === "ruins") {
      placeVillageLayout(map, [
        [2, 2, T.BUILDING],
        [3, 2, T.VILLAGE],
        [2, 3, T.VILLAGE],
        [4, 2, T.BUILDING],
        [3, 3, T.PROP],
        [2, 4, T.PROP],
      ]);
    } else if (theme.id === "crystal") {
      placeVillageLayout(map, [
        [12, 2, T.BUILDING],
        [13, 2, T.BUILDING],
        [12, 3, T.VILLAGE],
        [13, 3, T.VILLAGE],
        [11, 2, T.PROP],
        [12, 4, T.PROP],
      ]);
    }
  }

  function sprinkleExtraProps(map, seed, theme) {
    let s = seed >>> 0;
    const baseSpots = [
      [5, 2],
      [9, 2],
      [2, 6],
      [12, 6],
      [5, 7],
      [9, 7],
      [6, 3],
      [8, 3],
      [4, 5],
      [10, 5],
      [2, 5],
      [13, 4],
      [6, 8],
      [8, 8],
      [3, 5],
      [11, 4],
    ];
    const themeSpots = {
      meadow: [
        [8, 2],
        [12, 3],
        [6, 7],
        [10, 7],
        [4, 7],
      ],
      snow: [
        [7, 2],
        [8, 7],
        [2, 7],
        [6, 6],
        [13, 2],
      ],
      volcano: [
        [7, 3],
        [9, 6],
        [2, 7],
        [13, 7],
        [6, 2],
      ],
      ruins: [
        [5, 3],
        [10, 3],
        [6, 5],
        [11, 6],
        [4, 6],
      ],
      crystal: [
        [5, 5],
        [9, 2],
        [7, 6],
        [3, 6],
        [11, 7],
      ],
    };
    const spots = baseSpots.concat(themeSpots[theme.id] || []);
    for (const [x, y] of spots) {
      s = mapRand(s);
      const k = map[y][x];
      if (k === T.FLOOR && s % 4 !== 0) setTile(map, x, y, T.PROP);
      else if (k === T.VILLAGE && s % 5 === 0) setTile(map, x, y, T.PROP);
    }
  }

  /** 河流、村莊、大量主題造景（橋可通行） */
  function applyStageFeatures(map, seed, theme) {
    applyThemeRiver(map, theme);
    applyThemeVillage(map, theme);
    sprinkleExtraProps(map, seed, theme);
    ensureMapConnectivity(map, 1, 1);
    clearBossArena(map);
  }

  function buildStageMap(seed, stage) {
    return generateMapTiles(seed, stage);
  }

  function buildFixedMap(seed, stage) {
    return generateMapTiles(seed, stage || 1).tiles;
  }

  function isWalkable(tiles, x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    const k = tiles[y][x];
    return k === T.FLOOR || k === T.PROP || k === T.VILLAGE || k === T.BRIDGE;
  }

  function getJob(jobId) {
    return JOBS.find((j) => j.id === jobId) || JOBS[0];
  }

  /* —— 五關主題：地板／牆／造景 —— */
  function drawFloorTile(ctx, px, py, tx, ty, theme) {
    const t = theme || MAP_THEMES[0];
    const base = (tx + ty) % 2 === 0 ? t.floorA : t.floorB;
    fillPix(ctx, px, py, TILE, TILE, base);
    fillPix(ctx, px + 2, py + 2, TILE - 4, 2, t.floorHi);
    if (t.id === "meadow") {
      if ((tx + ty) % 4 === 0) fillPix(ctx, px + 8, py + 12, 3, 4, "#f0e060");
      if ((tx * ty) % 5 === 0) fillPix(ctx, px + 18, py + 8, 4, 3, "#88d070");
    } else if (t.id === "snow") {
      if ((tx + ty) % 3 === 0) fillPix(ctx, px + 6, py + 14, 4, 3, "#ffffff");
    } else if (t.id === "volcano") {
      if ((tx + ty) % 4 === 0) fillPix(ctx, px + 10, py + 14, 6, 2, "#ff6020");
    } else if (t.id === "ruins") {
      if ((tx + ty) % 5 === 0) fillPix(ctx, px + 12, py + 20, 4, 2, "#505058");
    } else if (t.id === "crystal") {
      if ((tx + ty) % 3 === 0) fillPix(ctx, px + 8, py + 10, 2, 4, "#d0c0ff");
    }
  }

  function drawWallTile(ctx, px, py, theme) {
    const t = theme || MAP_THEMES[0];
    fillPix(ctx, px, py, TILE, TILE, t.wallSide);
    fillPix(ctx, px, py, TILE, 6, t.wallTop);
    fillPix(ctx, px, py + 6, TILE, TILE - 6, t.wallFront);
    if (t.id === "snow") fillPix(ctx, px + 4, py, TILE - 8, 4, "#e8f4ff");
    if (t.id === "volcano") fillPix(ctx, px + 6, py + 20, 8, 3, "#ff8040");
    if (t.id === "ruins") fillPix(ctx, px + 2, py + 4, 6, 8, "#606068");
    if (t.id === "crystal") fillPix(ctx, px + 8, py + 2, 4, 10, "#a090e8");
  }

  function drawDecorTile(ctx, px, py, theme) {
    const t = theme || MAP_THEMES[0];
    fillPix(ctx, px, py, TILE, TILE, t.decorBase);
  }

  function drawWaterTile(ctx, px, py, theme, frame) {
    const wave = frame % 24 < 12;
    if (theme.id === "meadow") {
      fillPix(ctx, px, py, TILE, TILE, wave ? "#2878b8" : "#2068a8");
      fillPix(ctx, px + 4, py + 8, TILE - 8, 6, wave ? "#48a8e8" : "#3898d8");
      fillPix(ctx, px + 10, py + 14, 8, 4, "#60c0f0");
    } else if (theme.id === "snow") {
      fillPix(ctx, px, py, TILE, TILE, wave ? "#a8c8e8" : "#90b8d8");
      fillPix(ctx, px + 6, py + 10, TILE - 12, 4, "#e8f4ff");
      fillPix(ctx, px + 2, py + 18, 10, 3, "#c0d8f0");
    } else if (theme.id === "volcano") {
      fillPix(ctx, px, py, TILE, TILE, wave ? "#c04018" : "#902810");
      fillPix(ctx, px + 4, py + 6, TILE - 8, 10, wave ? "#ff7030" : "#e05020");
      fillPix(ctx, px + 12, py + 16, 8, 6, "#ffcc40");
    } else if (theme.id === "ruins") {
      fillPix(ctx, px, py, TILE, TILE, wave ? "#486878" : "#384858");
      fillPix(ctx, px + 2, py + 12, TILE - 4, 4, "#608898");
      fillPix(ctx, px + 14, py + 6, 4, 14, "#506070");
    } else {
      fillPix(ctx, px, py, TILE, TILE, wave ? "#5040a8" : "#403090");
      fillPix(ctx, px + 6, py + 8, TILE - 12, 8, wave ? "#a090f0" : "#8070e0");
      fillPix(ctx, px + 4, py + 20, 12, 3, "#d0c0ff");
    }
  }

  function drawBridgeTile(ctx, px, py, theme) {
    drawFloorTile(ctx, px, py, 0, 0, theme);
    if (theme.id === "meadow") {
      fillPix(ctx, px + 4, py + 10, TILE - 8, 10, "#8a6848");
      fillPix(ctx, px + 6, py + 12, TILE - 12, 2, "#6a5038");
      fillPix(ctx, px + 8, py + 8, 4, 14, "#5a4030");
    } else if (theme.id === "snow") {
      fillPix(ctx, px + 4, py + 12, TILE - 8, 8, "#b0c0d0");
      fillPix(ctx, px + 6, py + 14, TILE - 12, 3, "#90a8b8");
    } else if (theme.id === "volcano") {
      fillPix(ctx, px + 4, py + 10, TILE - 8, 12, "#4a3028");
      fillPix(ctx, px + 6, py + 12, TILE - 12, 4, "#c06030");
    } else if (theme.id === "ruins") {
      fillPix(ctx, px + 2, py + 10, TILE - 4, 10, "#787880");
      fillPix(ctx, px + 8, py + 12, 6, 8, "#909098");
    } else {
      fillPix(ctx, px + 4, py + 10, TILE - 8, 10, "#7060c0");
      fillPix(ctx, px + 8, py + 12, 8, 6, "#c0b0ff");
    }
  }

  function drawVillageFloorTile(ctx, px, py, theme) {
    if (theme.id === "meadow") {
      fillPix(ctx, px, py, TILE, TILE, "#c8a868");
      fillPix(ctx, px + 4, py + 4, TILE - 8, TILE - 8, "#b89858");
      fillPix(ctx, px + 8, py + 20, 6, 4, "#9a7848");
    } else if (theme.id === "snow") {
      fillPix(ctx, px, py, TILE, TILE, "#d8e4f0");
      fillPix(ctx, px + 2, py + 2, TILE - 4, TILE - 4, "#c8d8e8");
    } else if (theme.id === "volcano") {
      fillPix(ctx, px, py, TILE, TILE, "#5a4038");
      fillPix(ctx, px + 4, py + 4, TILE - 8, TILE - 8, "#4a3028");
    } else if (theme.id === "ruins") {
      fillPix(ctx, px, py, TILE, TILE, "#8a8888");
      fillPix(ctx, px + 2, py + 2, TILE - 4, TILE - 4, "#7a7878");
      fillPix(ctx, px + 6, py + 6, 4, 4, "#686870");
    } else {
      fillPix(ctx, px, py, TILE, TILE, "#5848a0");
      fillPix(ctx, px + 4, py + 4, TILE - 8, TILE - 8, "#6858b0");
    }
  }

  function drawBuildingTile(ctx, px, py, theme, tx, ty) {
    const v = (tx + ty) % 2;
    if (theme.id === "meadow") {
      fillPix(ctx, px + 6, py + 18, TILE - 12, 10, "#6a5038");
      fillPix(ctx, px + 4, py + 6, TILE - 8, 14, v ? "#c87848" : "#b06840");
      fillPix(ctx, px + 2, py + 2, TILE - 4, 6, "#a05030");
      fillPix(ctx, px + 10, py + 10, 6, 6, "#f0e8c0");
    } else if (theme.id === "snow") {
      fillPix(ctx, px + 8, py + 20, TILE - 16, 8, "#8090a0");
      fillPix(ctx, px + 4, py + 10, TILE - 8, 12, "#e8f0f8");
      fillPix(ctx, px + 2, py + 4, TILE - 4, 8, "#d0e0f0");
      fillPix(ctx, px + 10, py + 14, 8, 8, "#90a8c0");
    } else if (theme.id === "volcano") {
      fillPix(ctx, px + 6, py + 20, TILE - 12, 8, "#3a2018");
      fillPix(ctx, px + 4, py + 8, TILE - 8, 14, "#5a4038");
      fillPix(ctx, px + 2, py + 2, TILE - 4, 8, "#4a3028");
      fillPix(ctx, px + 12, py + 4, 6, 4, "#ff8040");
    } else if (theme.id === "ruins") {
      fillPix(ctx, px + 4, py + 14, TILE - 8, 14, "#686870");
      fillPix(ctx, px + 2, py + 2, TILE - 4, 14, "#909098");
      fillPix(ctx, px + 8, py + 0, 8, 6, "#b0b0b8");
      fillPix(ctx, px + 0, py + 8, 4, 10, "#585860");
    } else {
      fillPix(ctx, px + 6, py + 18, TILE - 12, 10, "#403080");
      fillPix(ctx, px + 4, py + 6, TILE - 8, 14, "#8070d0");
      fillPix(ctx, px + 2, py + 0, TILE - 4, 8, "#a090f0");
      fillPix(ctx, px + 10, py + 8, 8, 10, "#e0d8ff");
    }
  }

  function drawMeadowTree(ctx, variant) {
    fillPix(ctx, -3, 6, 6, 8, "#5a4030");
    fillPix(ctx, -12, -14, 24, 16, "#3a8a48");
    fillPix(ctx, -8, -20, 16, 10, "#52a858");
    if (variant % 2 === 0) fillPix(ctx, 6, -10, 8, 10, "#48a050");
    fillPix(ctx, -6, -8, 4, 4, "#f0e878");
  }

  function drawSnowPine(ctx, frame) {
    fillPix(ctx, -3, 8, 6, 6, "#607080");
    fillPix(ctx, -10, -4, 20, 10, "#d8ecf8");
    fillPix(ctx, -7, -14, 14, 12, "#b0d0e8");
    fillPix(ctx, -4, -22, 8, 8, "#e8f4ff");
    if (frame % 20 < 10) fillPix(ctx, 8, -18, 3, 3, "#ffffff");
  }

  function drawLavaRock(ctx, frame) {
    fillPix(ctx, -14, 0, 28, 12, "#3a1810");
    fillPix(ctx, -10, -8, 20, 10, "#5a3028");
    const glow = frame % 16 < 8;
    fillPix(ctx, -6, 4, 12, 4, glow ? "#ff9040" : "#c04020");
    fillPix(ctx, 4, 2, 8, 3, "#ff6020");
    fillPix(ctx, -12, -4, 4, 4, "#ffcc40");
  }

  function drawRuinPillar(ctx) {
    fillPix(ctx, -6, 4, 12, 14, "#686870");
    fillPix(ctx, -5, -16, 10, 18, "#909098");
    fillPix(ctx, -3, -20, 6, 4, "#b0b0b8");
    fillPix(ctx, -8, 0, 3, 6, "#505058");
    fillPix(ctx, 5, 8, 10, 4, "#585860");
  }

  function drawCrystalCluster(ctx, frame) {
    const pulse = frame % 12 < 6;
    fillPix(ctx, -4, 8, 8, 6, "#403080");
    fillPix(ctx, -10, -8, 8, 16, pulse ? "#c0b0ff" : "#9080e0");
    fillPix(ctx, 0, -12, 10, 18, pulse ? "#e8e0ff" : "#b0a0f0");
    fillPix(ctx, 6, -4, 6, 12, "#8070d0");
    fillPix(ctx, -14, 0, 6, 10, "#7060c8");
  }

  function drawMeadowBush(ctx) {
    fillPix(ctx, -10, 0, 20, 10, "#3a7a42");
    fillPix(ctx, -6, -6, 12, 8, "#52a858");
    fillPix(ctx, 4, -4, 8, 6, "#48a050");
  }

  function drawMeadowWell(ctx) {
    fillPix(ctx, -8, 2, 16, 10, "#8a7868");
    fillPix(ctx, -5, -6, 10, 8, "#6a5848");
    fillPix(ctx, -3, -2, 6, 4, "#3898d8");
    fillPix(ctx, -10, -8, 4, 12, "#5a4030");
    fillPix(ctx, 6, -8, 4, 12, "#5a4030");
  }

  function drawHayBale(ctx) {
    fillPix(ctx, -10, 2, 20, 10, "#d8b060");
    fillPix(ctx, -8, 0, 16, 4, "#c8a050");
    fillPix(ctx, -6, 4, 3, 6, "#b09040");
    fillPix(ctx, 0, 4, 3, 6, "#b09040");
  }

  function drawIgloo(ctx) {
    fillPix(ctx, -12, 4, 24, 10, "#e8f4ff");
    fillPix(ctx, -10, -4, 20, 10, "#d0e8f8");
    fillPix(ctx, -4, 0, 8, 6, "#90a8c0");
  }

  function drawSnowLamp(ctx, frame) {
    fillPix(ctx, -2, 4, 4, 12, "#708090");
    fillPix(ctx, -6, -8, 12, 10, frame % 20 < 10 ? "#fff8e0" : "#e8e0c0");
    fillPix(ctx, -4, -4, 8, 4, "#c0d0e0");
  }

  function drawCharredStump(ctx) {
    fillPix(ctx, -8, 4, 16, 8, "#3a2018");
    fillPix(ctx, -5, -4, 10, 8, "#2a1810");
    fillPix(ctx, -2, 0, 4, 4, "#ff6020");
  }

  function drawEmberVent(ctx, frame) {
    fillPix(ctx, -10, 6, 20, 8, "#4a2018");
    const g = frame % 14 < 7;
    fillPix(ctx, -6, -6, 12, 10, g ? "#ff9040" : "#c04020");
    fillPix(ctx, -2, -12, 4, 6, g ? "#ffcc60" : "#ff8040");
  }

  function drawRuinRubble(ctx) {
    fillPix(ctx, -12, 4, 10, 8, "#686870");
    fillPix(ctx, 0, 6, 12, 6, "#585860");
    fillPix(ctx, -4, -2, 8, 6, "#787880");
  }

  function drawRuinArch(ctx) {
    fillPix(ctx, -12, 0, 6, 16, "#909098");
    fillPix(ctx, 6, 0, 6, 16, "#909098");
    fillPix(ctx, -12, -12, 24, 6, "#a0a0a8");
    fillPix(ctx, -6, -6, 12, 8, "#484850");
  }

  function drawGlowPool(ctx, frame) {
    const p = frame % 16 < 8;
    fillPix(ctx, -12, 4, 24, 8, p ? "#8070e8" : "#6050c8");
    fillPix(ctx, -8, 0, 16, 6, p ? "#c0b0ff" : "#9080e8");
    fillPix(ctx, -4, 2, 8, 4, "#e8e0ff");
  }

  function drawCrystalSpire(ctx, frame) {
    const pulse = frame % 12 < 6;
    fillPix(ctx, -4, 8, 8, 8, "#403080");
    fillPix(ctx, -6, -16, 12, 24, pulse ? "#e8e0ff" : "#b0a0f0");
    fillPix(ctx, -2, -8, 4, 8, "#ffffff");
  }

  function drawBonePile(ctx) {
    fillPix(ctx, -10, 4, 8, 6, "#e8e0d0");
    fillPix(ctx, -2, 2, 10, 8, "#d8d0c0");
    fillPix(ctx, 4, 6, 8, 4, "#c8c0b0");
  }

  function drawTorchPost(ctx, frame) {
    fillPix(ctx, -2, 2, 4, 14, "#5a5038");
    const lit = frame % 18 < 9;
    fillPix(ctx, -6, -10, 12, 10, lit ? "#ffb040" : "#c07030");
    fillPix(ctx, -3, -6, 6, 6, lit ? "#ffe080" : "#e09040");
  }

  function drawShrineLamp(ctx, frame) {
    fillPix(ctx, -2, 4, 4, 12, "#5040a0");
    fillPix(ctx, -8, -10, 16, 12, frame % 16 < 8 ? "#e8e0ff" : "#c0b0ff");
    fillPix(ctx, -4, -4, 8, 6, "#a090f0");
  }

  function drawSceneryProp(ctx, tx, ty, theme, frame) {
    const v = (tx * 7 + ty * 11) % 6;
    if (theme.id === "meadow") {
      if (v === 0) drawMeadowTree(ctx, tx);
      else if (v === 1) drawMeadowBush(ctx);
      else if (v === 2) drawMeadowWell(ctx);
      else if (v === 3) drawHayBale(ctx);
      else drawMeadowTree(ctx, ty);
    } else if (theme.id === "snow") {
      if (v === 0) drawSnowPine(ctx, frame + tx);
      else if (v === 1) drawIgloo(ctx);
      else if (v === 2) drawSnowLamp(ctx, frame);
      else if (v === 3) drawMeadowBush(ctx);
      else drawSnowPine(ctx, frame + ty);
    } else if (theme.id === "volcano") {
      if (v === 0) drawLavaRock(ctx, frame + ty);
      else if (v === 1) drawEmberVent(ctx, frame);
      else if (v === 2) drawCharredStump(ctx);
      else if (v === 3) drawBonePile(ctx);
      else drawLavaRock(ctx, frame + tx);
    } else if (theme.id === "ruins") {
      if (v === 0) drawRuinPillar(ctx);
      else if (v === 1) drawRuinRubble(ctx);
      else if (v === 2) drawRuinArch(ctx);
      else if (v === 3) drawTorchPost(ctx, frame);
      else drawRuinPillar(ctx);
    } else if (theme.id === "crystal") {
      if (v === 0) drawCrystalCluster(ctx, frame + tx + ty);
      else if (v === 1) drawGlowPool(ctx, frame);
      else if (v === 2) drawCrystalSpire(ctx, frame);
      else if (v === 3) drawShrineLamp(ctx, frame);
      else drawCrystalCluster(ctx, frame);
    }
  }

  function drawMapScenery(ctx, tiles, frame, theme) {
    if (!tiles?.length || !theme) return;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (tiles[y][x] !== T.PROP) continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2 + 4;
        ctx.save();
        ctx.translate(cx, cy);
        drawSceneryProp(ctx, x, y, theme, frame);
        ctx.restore();
      }
    }
    drawStageBackdrop(ctx, theme, frame);
  }

  function drawStageBackdrop(ctx, theme, frame) {
    const w = COLS * TILE;
    const h = ROWS * TILE;
    ctx.save();
    ctx.globalAlpha = 0.4;
    if (theme.id === "meadow") {
      fillPix(ctx, 8, 8, 48, 28, "#6ab86a");
      fillPix(ctx, w - 56, 8, 44, 24, "#5aaa60");
      fillPix(ctx, 24, h - 36, w - 48, 12, "#2878b8");
      fillPix(ctx, 40, 20, 28, 16, "#c87848");
      fillPix(ctx, w - 72, 24, 24, 14, "#b06840");
    } else if (theme.id === "snow") {
      fillPix(ctx, 4, 4, w - 8, 10, "#e0eef8");
      fillPix(ctx, w - 52, 12, 36, 20, "#d0e8f8");
      fillPix(ctx, 16, h - 32, 40, 10, "#a8c8e8");
      if (frame % 30 < 15) fillPix(ctx, 80, 24, 6, 6, "#ffffff");
      if (frame % 40 < 20) fillPix(ctx, 200, 40, 5, 5, "#ffffff");
    } else if (theme.id === "volcano") {
      ctx.fillStyle = "rgba(255, 80, 30, 0.18)";
      ctx.fillRect(0, h - 48, w, 48);
      fillPix(ctx, w / 2 - 40, h - 32, 80, 10, "#ff6020");
      fillPix(ctx, 32, 16, 36, 18, "#5a4038");
      fillPix(ctx, w - 68, 20, 32, 16, "#4a3028");
    } else if (theme.id === "ruins") {
      fillPix(ctx, 16, 12, 28, 44, "#585860");
      fillPix(ctx, w - 52, 16, 24, 40, "#505058");
      fillPix(ctx, 48, h - 28, w - 96, 8, "#486878");
      fillPix(ctx, 28, 24, 20, 12, "#909098");
    } else if (theme.id === "crystal") {
      const pulse = frame % 20 < 10;
      fillPix(ctx, 12, 12, 12, 32, pulse ? "#c0b0ff" : "#8070d0");
      fillPix(ctx, w - 32, 16, 14, 36, pulse ? "#e8e0ff" : "#9080e8");
      fillPix(ctx, 40, h - 24, w - 80, 8, pulse ? "#6050c8" : "#5040a8");
      fillPix(ctx, w - 80, 20, 24, 14, "#8070d0");
    }
    ctx.restore();
  }

  function drawTileWorld(ctx, tx, ty, kind, theme, frame) {
    const px0 = tx * TILE;
    const py0 = ty * TILE;
    if (kind === T.WALL) drawWallTile(ctx, px0, py0, theme);
    else if (kind === T.WATER) drawWaterTile(ctx, px0, py0, theme, frame || 0);
    else if (kind === T.BRIDGE) drawBridgeTile(ctx, px0, py0, theme);
    else if (kind === T.VILLAGE) drawVillageFloorTile(ctx, px0, py0, theme);
    else if (kind === T.BUILDING) drawBuildingTile(ctx, px0, py0, theme, tx, ty);
    else if (kind === T.PROP) drawDecorTile(ctx, px0, py0, theme);
    else drawFloorTile(ctx, px0, py0, tx, ty, theme);
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

  function drawMeadowFairy(ctx, frame) {
    const bob = Math.sin(frame * 0.2) * 2;
    fillPix(ctx, -3, 4 + bob, 6, 8, "#5a8048");
    fillPix(ctx, -10, -6 + bob, 20, 14, "#7acc6a");
    fillPix(ctx, -6, -14 + bob, 12, 10, "#98e878");
    fillPix(ctx, -2, -10 + bob, 4, 4, "#ffe060");
    fillPix(ctx, -14, -2 + bob, 6, 10, "#6ab85a");
    fillPix(ctx, 8, -2 + bob, 6, 10, "#6ab85a");
    fillPix(ctx, -8, -18 + bob, 16, 6, "#f0a0d0");
  }

  function drawSnowYeti(ctx, frame) {
    const bob = Math.sin(frame * 0.12) > 0 ? 0 : 1;
    fillPix(ctx, -12, 0 + bob, 24, 14, "#e8f4ff");
    fillPix(ctx, -10, -12 + bob, 20, 14, "#d0e8f8");
    fillPix(ctx, -6, -18 + bob, 12, 8, "#f8fcff");
    fillPix(ctx, -4, -14 + bob, 4, 4, "#4060a0");
    fillPix(ctx, 1, -14 + bob, 4, 4, "#4060a0");
    fillPix(ctx, -14, 2 + bob, 5, 10, "#b8d0e8");
    fillPix(ctx, 9, 2 + bob, 5, 10, "#b8d0e8");
  }

  function drawLavaImp(ctx, frame) {
    const bob = Math.sin(frame * 0.25) > 0 ? 0 : 1;
    fillPix(ctx, -6, 2 + bob, 12, 12, "#4a1810");
    fillPix(ctx, -8, -10 + bob, 16, 12, "#c05030");
    fillPix(ctx, -5, -16 + bob, 10, 8, "#802818");
    fillPix(ctx, -3, -12 + bob, 3, 3, "#ffee40");
    fillPix(ctx, 2, -12 + bob, 3, 3, "#ffee40");
    fillPix(ctx, 10, -4 + bob, 8, 3, "#ff6020");
    fillPix(ctx, -10, -6 + bob, 4, 8, "#ff9040");
  }

  function drawRuinWraith(ctx, frame) {
    const float = Math.sin(frame * 0.14) * 4;
    fillPix(ctx, -8, -8 + float, 16, 20, "#c8d8e8");
    fillPix(ctx, -6, -16 + float, 12, 10, "#e8f0ff");
    fillPix(ctx, -3, -12 + float, 6, 6, "#6080a0");
    fillPix(ctx, -12, 0 + float, 4, 14, "#a0b0c8");
    fillPix(ctx, 8, 0 + float, 4, 14, "#a0b0c8");
    fillPix(ctx, -2, 4 + float, 4, 8, "#8090a8");
  }

  function drawCrystalShard(ctx, frame) {
    const pulse = frame % 14 < 7;
    fillPix(ctx, -4, 6, 8, 10, "#483898");
    fillPix(ctx, -10, -8, 10, 14, pulse ? "#d0c0ff" : "#a090e8");
    fillPix(ctx, 2, -12, 8, 16, pulse ? "#e8e0ff" : "#b8a8f0");
    fillPix(ctx, 8, -4, 8, 12, pulse ? "#c0b0ff" : "#9080d8");
    fillPix(ctx, -14, -2, 6, 10, "#7060c8");
    fillPix(ctx, -3, -6, 6, 6, "#ffffff");
  }

  function drawMonsterBody(ctx, typeIndex, frame, themeId) {
    const kind = MONSTER_KINDS[typeIndex] || "gargoyle";
    if (kind === "slime") drawSlime(ctx, frame);
    else if (kind === "goblin") drawGoblin(ctx, frame);
    else if (kind === "wolf") drawWolf(ctx, frame);
    else if (kind === "bat") drawBat(ctx, frame);
    else if (kind === "skeleton") drawSkeleton(ctx, frame);
    else if (kind === "spider") drawSpider(ctx, frame);
    else if (kind === "orc") drawOrc(ctx, frame);
    else if (kind === "meadow_fairy") drawMeadowFairy(ctx, frame);
    else if (kind === "snow_yeti") drawSnowYeti(ctx, frame);
    else if (kind === "lava_imp") drawLavaImp(ctx, frame);
    else if (kind === "ruin_wraith") drawRuinWraith(ctx, frame);
    else if (kind === "crystal_shard") drawCrystalShard(ctx, frame);
    else drawGargoyle(ctx, frame);
  }

  function monsterHpColor(m, theme) {
    if (m.isBoss) return "#ffd050";
    const id = m.themeId || theme?.id;
    if (id === "snow") return "#88c8f0";
    if (id === "volcano") return "#ff7040";
    if (id === "ruins") return "#c0c0d0";
    if (id === "crystal") return "#c0a0ff";
    return "#e85040";
  }

  function drawMonsterSprite(ctx, tx, ty, m, frame, monsterAttackFx, mapTheme) {
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
    else drawMonsterBody(ctx, m.typeIndex, frame + m.id, m.themeId || mapTheme?.id);
    const w = boss ? 34 : m.typeIndex >= 8 ? 26 : 22;
    const barY = boss ? -38 : m.typeIndex >= 8 ? -24 : -22;
    const hpPct = m.maxHp > 0 ? Math.max(0, m.hp / m.maxHp) : 0;
    const hpCol = monsterHpColor(m, mapTheme);
    fillPix(ctx, -w / 2, barY, w, 5, "#1a1010");
    fillPix(ctx, -w / 2, barY, w * hpPct, 5, hpCol);
    if (boss) {
      fillPix(ctx, -w / 2, barY - 6, w, 4, "#4a2808");
      fillPix(ctx, -w / 2 + 2, barY - 5, Math.max(4, w - 4), 2, "#ffcc66");
    }
    ctx.restore();
  }

  function drawLootFx(ctx, lootFx, animFrame) {
    if (!lootFx || lootFx.ttl <= 0 || !lootFx.drops?.length) return;
    const t = 1 - lootFx.ttl / 78;
    const bob = Math.sin(animFrame * 0.2) * 4;
    const cx = lootFx.x * TILE + TILE / 2;
    const baseY = lootFx.y * TILE + TILE / 2 - 8 - t * 28;
    const spread = Math.min(lootFx.drops.length, 5);

    ctx.save();
    ctx.globalAlpha = 0.35 + (1 - t) * 0.45;
    ctx.fillStyle = "#ffd050";
    ctx.beginPath();
    ctx.arc(cx, baseY + bob, 22 + t * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255, 220, 100, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, baseY + bob, 14 + (1 - t) * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    lootFx.drops.forEach((drop, i) => {
      const off = (i - (spread - 1) / 2) * 22;
      const px = cx + off;
      const py = baseY + bob - 18 - (i % 2) * 6;
      const rise = (1 - t) * 12;
      ctx.save();
      ctx.translate(px, py - rise);
      ctx.globalAlpha = Math.min(1, lootFx.ttl / 20);
      fillPix(ctx, -14, -10, 28, 22, "rgba(20,16,8,0.75)");
      fillPix(ctx, -12, -8, 24, 18, drop.color || "#c9a227");
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(drop.icon || "?", 0, -2);
      if (drop.qty > 1) {
        ctx.font = "bold 10px system-ui,sans-serif";
        ctx.fillStyle = "#ffe8a0";
        ctx.fillText(`×${drop.qty}`, 10, 8);
      }
      ctx.restore();
    });

    ctx.save();
    ctx.fillStyle = "rgba(255, 240, 200, 0.9)";
    ctx.font = "bold 11px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.min(1, lootFx.ttl / 24);
    ctx.fillText("首領掉落", cx, baseY + bob + 22);
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
  function applyHd2dLighting(ctx, w, h, mapX, mapY, theme) {
    const t = theme || MAP_THEMES[0];
    const sunX = mapX * TILE + TILE / 2;
    const sunY = mapY * TILE + TILE / 2;
    const light = ctx.createRadialGradient(sunX, sunY, 30, sunX, sunY, Math.max(w, h) * 0.75);
    light.addColorStop(0, t.light);
    light.addColorStop(0.5, "rgba(80, 120, 160, 0.04)");
    light.addColorStop(1, t.vignette);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.9);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, t.vignette);
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
        let col = "#4a8a52";
        if (k === T.WALL) col = "#6a6258";
        else if (k === T.WATER) col = "#2878b8";
        else if (k === T.VILLAGE) col = "#c8a868";
        else if (k === T.BUILDING) col = "#8a6848";
        else if (k === T.BRIDGE) col = "#8a7858";
        else if (k === T.PROP) col = "#2d5a3a";
        ctx.fillStyle = col;
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
    mapTheme,
    lootFx
  ) {
    if (!canvas || !prepareCanvas(canvas)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const w = canvas.width;
    const h = canvas.height;
    const theme =
      mapTheme ||
      (typeof mapTheme === "number" ? getThemeForStage(mapTheme) : null) ||
      MAP_THEMES[0];

    ctx.fillStyle = theme.bg || "#1a2838";
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
        drawTileWorld(ctx, tx, ty, tiles[ty][tx], theme, animFrame);
      }
    }
    drawMapScenery(ctx, tiles, animFrame, theme);

    const sorted = [...(monsters || [])].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const m of sorted) {
      if (m.y === my && m.x === mx) continue;
      drawMonsterSprite(ctx, m.x, m.y, m, animFrame, monsterAttackFx, theme);
    }

    drawHeroSprite(ctx, mx, my, animFrame, facing || "down", heroJobId);

    for (const m of monsters || []) {
      if (m.x === mx && m.y === my) {
        drawMonsterSprite(ctx, m.x, m.y, m, animFrame, monsterAttackFx, theme);
      }
    }

    if (combatFx) drawCombatFx(ctx, combatFx, animFrame);
    if (monsterAttackFx) drawMonsterAttackFx(ctx, monsterAttackFx, animFrame);
    if (lootFx) drawLootFx(ctx, lootFx, animFrame);

    applyHd2dLighting(ctx, w, h, mx, my, theme);

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
    buildStageMap,
    getThemeForStage,
    MAP_THEMES,
    MAX_MAP_STAGES,
    STAGE_MONSTER_POOLS,
    MONSTER_KINDS,
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
