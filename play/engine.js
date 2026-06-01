/**
 * Browser RPG engine — rules aligned with src/ (C): LCG RNG, linked-list inventory,
 * FIFO quest queue, battle undo stack.
 */
(function (global) {
  const MAX_PLAYERS = 1;
  const MAX_UNDO = 16;

  const JOB_STATS = {
    warrior: { name: "Warrior", hp: 120, maxHp: 120, mp: 18, maxMp: 18, atk: 15, def: 9 },
    mage: { name: "Mage", hp: 72, maxHp: 72, mp: 72, maxMp: 72, atk: 19, def: 3 },
    priest: { name: "Priest", hp: 95, maxHp: 95, mp: 55, maxMp: 55, atk: 9, def: 6 },
    thief: { name: "Thief", hp: 88, maxHp: 88, mp: 32, maxMp: 32, atk: 14, def: 5 },
  };
  const MONSTERS = [
    { name: "Slime", hp: 22, atk: 5, def: 1, exp: 12 },
    { name: "Goblin", hp: 30, atk: 8, def: 2, exp: 20 },
    { name: "Wolf", hp: 40, atk: 11, def: 3, exp: 35 },
    { name: "Gargoyle", hp: 55, atk: 14, def: 5, exp: 55 },
  ];

  function randU32(g) {
    g.rngSeed = (Math.imul(g.rngSeed >>> 0, 1103515245) + 12345) >>> 0;
    return g.rngSeed;
  }

  function randRange(g, lo, hi) {
    if (hi <= lo) return lo;
    const r = randU32(g);
    return lo + (r % (hi - lo + 1));
  }

  function invAdd(c, name, qty, heal) {
    if (!qty || qty <= 0) return;
    let cur = c.inventory;
    while (cur) {
      if (cur.name === name) {
        cur.quantity += qty;
        if (heal > 0) cur.heal = heal;
        return;
      }
      cur = cur.next;
    }
    c.inventory = { name, quantity: qty, heal, next: c.inventory };
  }

  function invFree(c) {
    c.inventory = null;
  }

  function invUseSlot(c, slot) {
    let prev = null;
    let node = c.inventory;
    let i = 0;
    while (node && i < slot) {
      prev = node;
      node = node.next;
      i++;
    }
    if (!node || node.quantity <= 0) return { ok: false, heal: 0 };
    const heal = node.heal > 0 ? node.heal : 0;
    node.quantity--;
    if (node.quantity <= 0) {
      if (prev) prev.next = node.next;
      else c.inventory = node.next;
    }
    return { ok: heal > 0, heal };
  }

  function inventoryToList(head) {
    const arr = [];
    for (let n = head; n; n = n.next) {
      arr.push({ name: n.name, quantity: n.quantity, heal: n.heal });
    }
    return arr;
  }

  function listToInventory(arr) {
    let head = null;
    if (!Array.isArray(arr)) return head;
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      head = { name: String(it.name), quantity: +it.quantity || 0, heal: +it.heal || 0, next: head };
    }
    return head;
  }

  function questEnqueue(q, node) {
    if (!q.front) q.front = q.rear = node;
    else {
      q.rear.next = node;
      q.rear = node;
    }
  }

  function questDequeue(q) {
    if (!q.front) return null;
    const n = q.front;
    q.front = n.next;
    if (!q.front) q.rear = null;
    n.next = null;
    return n;
  }

  function questAdvanceKill(g, amount) {
    if (amount <= 0) return;
    for (let n = g.quests.front; n; n = n.next) {
      if (n.kind === 0) {
        n.progress += amount;
        if (n.progress > n.target) n.progress = n.target;
      }
    }
  }

  function grantExp(g, exp) {
    if (g.playerCount <= 0) return;
    const p = g.players[g.activePlayer];
    p.exp += exp;
    while (p.exp >= 100) {
      p.exp -= 100;
      p.level++;
      p.maxHp += 5;
      p.hp = p.maxHp;
      p.maxMp += 3;
      p.mp = p.maxMp;
      p.atk += 2;
      p.def += 1;
      g.message = `Level ${p.level}`;
    }
  }

  function questTryCompleteFront(g) {
    const f = g.quests.front;
    if (!f || f.progress < f.target) return;
    const title = f.title;
    const rx = f.rewardExp;
    questDequeue(g.quests);
    grantExp(g, rx);
    if (!g.message) g.message = `Quest: ${title} (+${rx} EXP)`;
    else g.message = `Quest: ${title} (+${rx} EXP). ${g.message}`;
  }

  function clearUndo(g) {
    g.undo = [];
  }

  function pushUndo(g) {
    if (!g.inBattle || g.playerCount <= 0) return;
    if (g.undo.length >= MAX_UNDO) return;
    const p = g.players[g.activePlayer];
    g.undo.push({
      playerHp: p.hp,
      playerMp: p.mp,
      monsterHp: g.monsterHp,
      defBoost: g.playerDefBoostTurns,
    });
  }

  function popUndo(g) {
    const snap = g.undo.pop();
    if (!snap) return false;
    const p = g.players[g.activePlayer];
    p.hp = snap.playerHp;
    p.mp = snap.playerMp;
    g.monsterHp = snap.monsterHp;
    g.playerDefBoostTurns = snap.defBoost;
    g.message = "Undo";
    return true;
  }

  function physDamage(g, atk, def) {
    let base = atk - def;
    if (base < 1) base = 1;
    const roll = randRange(g, 0, 4);
    return base + roll;
  }

  function monsterAttackPlayer(g) {
    const p = g.players[g.activePlayer];
    let def = p.def;
    if (g.playerDefBoostTurns > 0) {
      def += 4;
      g.playerDefBoostTurns--;
    }
    const dmg = physDamage(g, g.monsterAtk, def);
    p.hp -= dmg;
    if (p.hp < 0) p.hp = 0;
    g.message += ` Hit ${dmg}`;
  }

  function spawnMonster(g) {
    const idx = randRange(g, 0, MONSTERS.length - 1);
    const t = MONSTERS[idx];
    g.monsterName = t.name;
    let mh = t.hp + randRange(g, -3, 4);
    if (mh < 8) mh = 8;
    g.monsterMaxHp = mh;
    g.monsterHp = mh;
    g.monsterAtk = t.atk;
    g.monsterDef = t.def;
    g.monsterExp = t.exp;
    g.inBattle = 1;
    g.playerDefBoostTurns = 0;
    clearUndo(g);
    g.message = `Fight ${g.monsterName}`;
  }

  function explore(g) {
    g.inBattle = 0;
    g.message = "";
    return true;
  }

  function monsterAt(g, x, y) {
    return (g.mapMonsters || []).find((m) => m.x === x && m.y === y) || null;
  }

  function findAdjacentMapMonster(g) {
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (const m of g.mapMonsters || []) {
      if (m.x === g.mapX && m.y === g.mapY) return m;
      for (const [dx, dy] of dirs) {
        if (m.x === g.mapX + dx && m.y === g.mapY + dy) return m;
      }
    }
    return null;
  }

  function removeMapMonsterById(g, id) {
    g.mapMonsters = (g.mapMonsters || []).filter((m) => m.id !== id);
  }

  function spawnOneAt(g, x, y) {
    const tiles = g.worldTiles;
    if (!tiles?.length) return false;
    const COLS = WorldView?.COLS || 15;
    const ROWS = WorldView?.ROWS || 10;
    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) return false;
    if (tiles[y][x] === 2) return false;
    if (x === g.mapX && y === g.mapY) return false;
    if (monsterAt(g, x, y)) return false;
    const idx = randRange(g, 0, MONSTERS.length - 1);
    const t = MONSTERS[idx];
    let mh = t.hp + randRange(g, -3, 4);
    if (mh < 8) mh = 8;
    if (!g.nextMonsterId) g.nextMonsterId = 1;
    g.mapMonsters.push({
      id: g.nextMonsterId++,
      x,
      y,
      typeIndex: idx,
      name: t.name,
      hp: mh,
      maxHp: mh,
      atk: t.atk,
      def: t.def,
      exp: t.exp,
    });
    return true;
  }

  function monsterCounterAttack(g, m) {
    const p = g.players[g.activePlayer];
    let def = p.def;
    if (g.playerDefBoostTurns > 0) {
      def += 4;
      g.playerDefBoostTurns--;
    }
    const dmg = physDamage(g, m.atk, def);
    p.hp -= dmg;
    if (p.hp < 0) p.hp = 0;
    g.message += ` Hit ${dmg}`;
    if (p.hp <= 0) {
      g.gameOver = 1;
      g.message = "Game Over";
    }
  }

  function onMonsterKilled(g, m) {
    const p = g.players[g.activePlayer];
    questAdvanceKill(g, 1);
    questTryCompleteFront(g);
    p.exp += m.exp;
    while (p.exp >= 100) {
      p.exp -= 100;
      p.level++;
      p.maxHp += 5;
      p.hp = p.maxHp;
      p.maxMp += 3;
      p.mp = p.maxMp;
      p.atk += 2;
      p.def += 1;
      g.message += " Level up";
    }
    removeMapMonsterById(g, m.id);
    g.engagedMonsterId = 0;
  }

  /** Map combat: no battle screen — hit adjacent monster, sync HP bars on map */
  function mapStrike(g) {
    g.inBattle = 0;
    g.gameOver = 0;
    const m = findAdjacentMapMonster(g);
    if (!m) {
      g.message = "No target";
      return false;
    }
    const p = g.players[g.activePlayer];
    const dmg = physDamage(g, p.atk, m.def);
    m.hp -= dmg;
    if (m.hp < 0) m.hp = 0;
    g.message = `Attack ${dmg}`;
    if (m.hp <= 0) {
      g.message += " Victory";
      onMonsterKilled(g, m);
      return true;
    }
    monsterCounterAttack(g, m);
    return !g.gameOver;
  }

  function mapEngage(g) {
    return mapStrike(g);
  }

  function initWorld(g) {
    const seed = g.rngSeed >>> 0 || 1;
    if (typeof WorldView !== "undefined" && WorldView.buildFixedMap) {
      g.worldTiles = WorldView.buildFixedMap(seed);
    } else {
      g.worldTiles = [];
    }
    g.mapMonsters = [];
    g.nextMonsterId = 1;
    g.engagedMonsterId = 0;
    g.mapX = 1;
    g.mapY = 1;
    spawnMapMonsters(g);
  }

  function spawnMapMonsters(g) {
    const tiles = g.worldTiles;
    if (!tiles?.length) return;
    const spots = [];
    const COLS = WorldView?.COLS || 15;
    const ROWS = WorldView?.ROWS || 10;
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (tiles[y][x] === 2) continue;
        if (x === g.mapX && y === g.mapY) continue;
        if (Math.abs(x - g.mapX) + Math.abs(y - g.mapY) < 2) continue;
        spots.push({ x, y });
      }
    }
    for (let i = spots.length - 1; i > 0; i--) {
      const j = randRange(g, 0, i);
      const t = spots[i];
      spots[i] = spots[j];
      spots[j] = t;
    }
    const count = Math.min(8, spots.length);
    for (let i = 0; i < count; i++) {
      spawnOneAt(g, spots[i].x, spots[i].y);
    }
    const nearOffsets = [
      [2, 0],
      [3, 0],
      [4, 0],
      [0, 2],
      [0, 3],
      [1, 2],
      [2, 1],
      [2, 2],
      [-2, 0],
      [0, -2],
      [3, 1],
      [1, 3],
    ];
    for (const [dx, dy] of nearOffsets) {
      if ((g.mapMonsters || []).length >= 12) break;
      spawnOneAt(g, g.mapX + dx, g.mapY + dy);
    }
    if ((g.mapMonsters || []).length < 4) {
      for (let x = 2; x <= 6 && g.mapMonsters.length < 6; x++) {
        spawnOneAt(g, x, 2);
        spawnOneAt(g, x, 4);
      }
    }
  }

  function playerAttack(g) {
    return mapStrike(g);
  }

  function playerDefend(g) {
    if (!g.inBattle) return false;
    pushUndo(g);
    g.playerDefBoostTurns = 2;
    g.message = "Defend";
    monsterAttackPlayer(g);
    const p = g.players[g.activePlayer];
    if (p.hp <= 0) {
      p.hp = 1;
      g.inBattle = 0;
      clearUndo(g);
      g.message += " Knocked down";
    }
    return true;
  }

  function playerUse(g) {
    g.message = "Items disabled";
    return false;
  }

  function ensureMapMonsters(g) {
    if (!g.worldTiles?.length) return;
    if (!g.mapMonsters?.length) {
      if (!g.nextMonsterId) g.nextMonsterId = 1;
      spawnMapMonsters(g);
    }
  }

  function playerFlee(g) {
    if (!g.inBattle) return false;
    let chance = 55 + g.players[g.activePlayer].level * 3;
    if (chance > 90) chance = 90;
    const r = randRange(g, 1, 100);
    if (r <= chance) {
      g.message = "Flee OK";
      g.inBattle = 0;
      g.engagedMonsterId = 0;
      clearUndo(g);
      return true;
    }
    g.message = "Flee failed";
    monsterAttackPlayer(g);
    const p = g.players[g.activePlayer];
    if (p.hp <= 0) {
      p.hp = 1;
      g.inBattle = 0;
      clearUndo(g);
    }
    return true;
  }

  function getStory(jobId) {
    const stories = global.HeroStories || {};
    return stories[jobId] || stories.warrior || null;
  }

  function bootstrapQuests(g) {
    g.quests = { front: null, rear: null };
    const story = getStory(g.heroJobId);
    g.storyTitle = story?.title || "Adventure";
    g.storyIntro = story?.intro || "Defeat monsters on the map.";
    if (g.players[0] && story?.name) g.players[0].name = story.name;
    const list = story?.quests || [
      { title: "First Hunt", desc: "Defeat 2 monsters", target: 2, rewardExp: 30 },
      { title: "Deep Wilds", desc: "Defeat 4 monsters", target: 4, rewardExp: 60 },
    ];
    let id = 1;
    for (const q of list) {
      questEnqueue(g.quests, {
        id: id++,
        title: q.title,
        desc: q.desc,
        kind: 0,
        target: q.target,
        progress: 0,
        rewardExp: q.rewardExp || 30,
        next: null,
      });
    }
  }

  function resolveJob(opts) {
    if (typeof opts === "string") return opts;
    if (opts && opts.jobId) return String(opts.jobId);
    if (Array.isArray(opts) && opts[0]) return "warrior";
    return "warrior";
  }

  function newGame(opts) {
    const jobId = resolveJob(opts);
    const st = JOB_STATS[jobId] || JOB_STATS.warrior;
    const g = {
      rngSeed: (Date.now() >>> 0) || 1,
      playerCount: 0,
      activePlayer: 0,
      heroJobId: jobId in JOB_STATS ? jobId : "warrior",
      mapX: 0,
      mapY: 0,
      inBattle: 0,
      monsterName: "",
      monsterHp: 0,
      monsterMaxHp: 0,
      monsterAtk: 0,
      monsterDef: 0,
      monsterExp: 0,
      playerDefBoostTurns: 0,
      quests: { front: null, rear: null },
      undo: [],
      message: "",
      gameOver: 0,
      players: [],
    };
    g.players.push({
      name: st.name,
      jobId: g.heroJobId,
      hp: st.hp,
      maxHp: st.maxHp,
      mp: st.mp,
      maxMp: st.maxMp,
      atk: st.atk,
      def: st.def,
      level: 1,
      exp: 0,
      inventory: null,
    });
    invAdd(g.players[0], "Herb", 2, 12);
    invAdd(g.players[0], "Potion", 1, 35);
    g.playerCount = 1;
    bootstrapQuests(g);
    initWorld(g);
    g.message = "Start";
    return g;
  }

  function applyCommand(g, cmd, arg) {
    const c = String(cmd || "").toLowerCase();
    if (c === "status") return true;
    if (c === "explore") return explore(g);
    if (c === "attack" || c === "battle_attack") return mapStrike(g);
    if (c === "defend") return playerDefend(g);
    if (c === "flee") return playerFlee(g);
    if (c === "undo") return popUndo(g);
    if (c === "use") return playerUse(g, parseInt(arg, 10) || 0);
    if (c === "switch") {
      const idx = parseInt(arg, 10);
      if (idx < 0 || idx >= g.playerCount) {
        g.message = "Invalid hero";
        return false;
      }
      if (g.inBattle) {
        g.message = "Cannot switch in battle";
        return false;
      }
      g.activePlayer = idx;
      g.message = `Switch: ${g.players[idx].name}`;
      return true;
    }
    g.message = "Unknown command";
    return false;
  }

  function questsToArray(g) {
    const arr = [];
    for (let n = g.quests.front; n; n = n.next) {
      arr.push({
        id: n.id,
        title: n.title,
        desc: n.desc,
        progress: n.progress,
        target: n.target,
        done: n.progress >= n.target,
      });
    }
    return arr;
  }

  function toView(g) {
    const players = g.players.map((p, index) => ({
      index,
      name: p.name,
      job_id: p.jobId || g.heroJobId || "warrior",
      hp: p.hp,
      max_hp: p.maxHp,
      mp: p.mp,
      max_mp: p.maxMp,
      atk: p.atk,
      def: p.def,
      level: p.level,
      exp: p.exp,
      inventory: inventoryToList(p.inventory).map((it, slot) => ({
        slot,
        name: it.name,
        quantity: it.quantity,
        heal: it.heal,
      })),
    }));
    return {
      ok: true,
      message: g.message || "",
      phase: "explore",
      game_over: !!g.gameOver,
      map: { x: g.mapX, y: g.mapY },
      active_player: g.activePlayer,
      players,
      quests: questsToArray(g),
      battle: null,
      world_tiles: g.worldTiles,
      map_monsters: (g.mapMonsters || []).map((m) => ({ ...m })),
      engaged_monster_id: g.engagedMonsterId || 0,
      hero_job_id: g.heroJobId || g.players[0]?.jobId || "warrior",
      story_title: g.storyTitle || "",
      story_intro: g.storyIntro || "",
    };
  }

  function serialize(g) {
    const questArr = [];
    for (let n = g.quests.front; n; n = n.next) {
      questArr.push({
        id: n.id,
        title: n.title,
        desc: n.desc,
        kind: n.kind,
        target: n.target,
        progress: n.progress,
        rewardExp: n.rewardExp,
      });
    }
    return {
      v: 5,
      heroJobId: g.heroJobId || g.players[0]?.jobId || "warrior",
      storyTitle: g.storyTitle || "",
      storyIntro: g.storyIntro || "",
      rngSeed: g.rngSeed,
      worldTiles: g.worldTiles,
      mapMonsters: g.mapMonsters || [],
      nextMonsterId: g.nextMonsterId || 1,
      engagedMonsterId: g.engagedMonsterId || 0,
      playerCount: g.playerCount,
      activePlayer: g.activePlayer,
      mapX: g.mapX,
      mapY: g.mapY,
      inBattle: g.inBattle,
      monsterName: g.monsterName,
      monsterHp: g.monsterHp,
      monsterMaxHp: g.monsterMaxHp,
      monsterAtk: g.monsterAtk,
      monsterDef: g.monsterDef,
      monsterExp: g.monsterExp,
      playerDefBoostTurns: g.playerDefBoostTurns,
      message: g.message,
      undo: g.undo.slice(),
      players: g.players.map((p) => ({
        name: p.name,
        jobId: p.jobId || g.heroJobId || "warrior",
        hp: p.hp,
        maxHp: p.maxHp,
        mp: p.mp,
        maxMp: p.maxMp,
        atk: p.atk,
        def: p.def,
        level: p.level,
        exp: p.exp,
        inventory: inventoryToList(p.inventory),
      })),
      quests: questArr,
    };
  }

  function deserialize(data) {
    if (!data || (data.v !== 1 && data.v !== 2 && data.v !== 3 && data.v !== 5)) return null;
    const g = {
      rngSeed: data.rngSeed >>> 0 || 1,
      heroJobId: data.heroJobId || data.players?.[0]?.jobId || "warrior",
      storyTitle: data.storyTitle || "",
      storyIntro: data.storyIntro || "",
      playerCount: 1,
      activePlayer: data.activePlayer || 0,
      mapX: data.mapX || 0,
      mapY: data.mapY || 0,
      inBattle: data.inBattle ? 1 : 0,
      monsterName: data.monsterName || "",
      monsterHp: +data.monsterHp || 0,
      monsterMaxHp: +data.monsterMaxHp || 0,
      monsterAtk: +data.monsterAtk || 0,
      monsterDef: +data.monsterDef || 0,
      monsterExp: +data.monsterExp || 0,
      playerDefBoostTurns: +data.playerDefBoostTurns || 0,
      quests: { front: null, rear: null },
      undo: Array.isArray(data.undo) ? data.undo.slice() : [],
      message: data.message || "",
      players: [],
      worldTiles: data.worldTiles || null,
      mapMonsters: Array.isArray(data.mapMonsters) ? data.mapMonsters : [],
      nextMonsterId: data.nextMonsterId || 1,
      engagedMonsterId: data.engagedMonsterId || 0,
      gameOver: 0,
    };
    const parr = (data.players || []).slice(0, 1);
    for (let i = 0; i < parr.length; i++) {
      const p = parr[i];
      g.players.push({
        name: p.name || "Hero",
        jobId: p.jobId || g.heroJobId || "warrior",
        hp: +p.hp || 0,
        maxHp: +p.maxHp || 100,
        mp: +p.mp || 0,
        maxMp: +p.maxMp || 40,
        atk: +p.atk || 10,
        def: +p.def || 4,
        level: +p.level || 1,
        exp: +p.exp || 0,
        inventory: listToInventory(p.inventory),
      });
    }
    if (g.players.length === 0) return null;
    if (g.players.length > 1) g.players = g.players.slice(0, 1);
    g.playerCount = 1;
    g.heroJobId = g.players[0].jobId || g.heroJobId || "warrior";
    if (!g.players[0].jobId) g.players[0].jobId = g.heroJobId;
    for (const q of data.quests || []) {
      questEnqueue(g.quests, {
        id: +q.id,
        title: q.title,
        desc: q.desc,
        kind: +q.kind || 0,
        target: +q.target || 0,
        progress: +q.progress || 0,
        rewardExp: +q.rewardExp || 0,
        next: null,
      });
    }
    const cols = WorldView?.COLS || 15;
    const rows = WorldView?.ROWS || 10;
    const tilesBad =
      !g.worldTiles?.length ||
      g.worldTiles.length !== rows ||
      g.worldTiles[0]?.length !== cols;
    if (tilesBad) {
      if (typeof WorldView !== "undefined" && WorldView.buildFixedMap) {
        g.worldTiles = WorldView.buildFixedMap(g.rngSeed);
      }
      g.mapMonsters = [];
      g.nextMonsterId = g.nextMonsterId || 1;
      if (g.mapX < 1) g.mapX = 1;
      if (g.mapY < 1) g.mapY = 1;
      spawnMapMonsters(g);
    }
    g.inBattle = 0;
    g.engagedMonsterId = 0;
    g.gameOver = 0;
    if (!g.mapMonsters?.length) ensureMapMonsters(g);
    const q0 = g.quests.front;
    if (!q0 || /[\u4e00-\u9fff]/.test(String(q0.title || ""))) {
      g.quests = { front: null, rear: null };
      bootstrapQuests(g);
    } else if (!g.storyIntro) {
      bootstrapQuests(g);
    }
    const story = getStory(g.heroJobId);
    if (story) {
      g.storyTitle = g.storyTitle || story.title;
      g.storyIntro = g.storyIntro || story.intro;
      if (g.players[0] && story.name) g.players[0].name = story.name;
    }
    return g;
  }

  global.RPG = {
    newGame,
    applyCommand,
    toView,
    serialize,
    deserialize,
    monsterAt,
    mapStrike,
    ensureMapMonsters,
    MAX_PLAYERS,
    JOB_STATS,
  };
})(typeof window !== "undefined" ? window : globalThis);
