/**
 * Browser RPG engine — rules aligned with src/ (C): LCG RNG, linked-list inventory,
 * FIFO quest queue, battle undo stack.
 */
(function (global) {
  const MAX_PLAYERS = 1;
  const MAX_UNDO = 16;

  const JOB_STATS = {
    warrior: { name: "戰士", hp: 120, maxHp: 120, mp: 18, maxMp: 18, atk: 15, def: 9 },
    mage: { name: "法師", hp: 72, maxHp: 72, mp: 72, maxMp: 72, atk: 19, def: 3 },
    priest: { name: "牧師", hp: 95, maxHp: 95, mp: 55, maxMp: 55, atk: 9, def: 6 },
    thief: { name: "盜賊", hp: 88, maxHp: 88, mp: 32, maxMp: 32, atk: 14, def: 5 },
  };
  const MONSTERS = [
    { name: "史萊姆", hp: 22, atk: 5, def: 1, exp: 12 },
    { name: "哥布林", hp: 30, atk: 8, def: 2, exp: 20 },
    { name: "野狼", hp: 40, atk: 11, def: 3, exp: 35 },
    { name: "石像鬼", hp: 55, atk: 14, def: 5, exp: 55 },
    { name: "蝙蝠", hp: 18, atk: 6, def: 0, exp: 10 },
    { name: "骷髏兵", hp: 34, atk: 10, def: 3, exp: 26 },
    { name: "毒蜘蛛", hp: 28, atk: 9, def: 2, exp: 22 },
    { name: "獸人", hp: 50, atk: 13, def: 4, exp: 44 },
    { name: "花蔓妖", hp: 24, atk: 6, def: 1, exp: 14 },
    { name: "霜雪人", hp: 38, atk: 10, def: 3, exp: 28 },
    { name: "火焰小鬼", hp: 32, atk: 11, def: 2, exp: 24 },
    { name: "古代幽靈", hp: 36, atk: 12, def: 2, exp: 30 },
    { name: "水晶碎靈", hp: 42, atk: 13, def: 4, exp: 38 },
  ];

  function pickStageMonster(g) {
    const stage = Math.min(MAX_STAGES, Math.max(1, g.stage || 1));
    const pools = global.STAGE_MONSTER_POOLS || [];
    const pool = pools[stage - 1];
    if (!pool?.entries?.length) {
      const idx = randRange(g, 0, 7);
      const t = MONSTERS[idx];
      return { typeIndex: idx, name: t.name, hp: t.hp, atk: t.atk, def: t.def, exp: t.exp, themeId: pool?.theme || "" };
    }
    const i = randRange(g, 0, pool.entries.length - 1);
    const e = pool.entries[i];
    const base = MONSTERS[e.typeIndex] || MONSTERS[0];
    return {
      typeIndex: e.typeIndex,
      name: e.name || base.name,
      hp: base.hp,
      atk: base.atk,
      def: base.def,
      exp: base.exp,
      themeId: pool.theme,
    };
  }
  const MAX_STAGES = 5;
  const BOSS_NAMES = ["草原巨獸", "雪原霸主", "熔岩領主", "遺跡守護者", "水晶龍王"];
  const STAGE_MONSTER_COUNT = 8;

  function randU32(g) {
    g.rngSeed = (Math.imul(g.rngSeed >>> 0, 1103515245) + 12345) >>> 0;
    return g.rngSeed;
  }

  function randRange(g, lo, hi) {
    if (hi <= lo) return lo;
    const r = randU32(g);
    return lo + (r % (hi - lo + 1));
  }

  function invAdd(c, name, qty, heal, mp) {
    if (!qty || qty <= 0) return;
    const mpVal = mp || 0;
    let cur = c.inventory;
    while (cur) {
      if (cur.name === name) {
        cur.quantity += qty;
        if (heal > 0) cur.heal = heal;
        if (mpVal > 0) cur.mp = mpVal;
        return;
      }
      cur = cur.next;
    }
    c.inventory = { name, quantity: qty, heal: heal || 0, mp: mpVal, next: c.inventory };
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
    if (!node || node.quantity <= 0) return { ok: false, heal: 0, mp: 0 };
    const heal = node.heal > 0 ? node.heal : 0;
    const mp = node.mp > 0 ? node.mp : 0;
    node.quantity--;
    if (node.quantity <= 0) {
      if (prev) prev.next = node.next;
      else c.inventory = node.next;
    }
    return { ok: heal > 0 || mp > 0, heal, mp };
  }

  function inventoryToList(head) {
    const arr = [];
    for (let n = head; n; n = n.next) {
      arr.push({ name: n.name, quantity: n.quantity, heal: n.heal, mp: n.mp || 0 });
    }
    return arr;
  }

  function listToInventory(arr) {
    let head = null;
    if (!Array.isArray(arr)) return head;
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      head = {
        name: String(it.name),
        quantity: +it.quantity || 0,
        heal: +it.heal || 0,
        mp: +it.mp || 0,
        next: head,
      };
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
    const n = g.quests.front;
    if (!n || n.kind !== 0) return;
    n.progress += amount;
    if (n.progress > n.target) n.progress = n.target;
  }

  function questAdvanceStage(g, amount) {
    if (amount <= 0) return;
    const n = g.quests.front;
    if (!n || n.kind !== 1) return;
    n.progress += amount;
    if (n.progress > n.target) n.progress = n.target;
  }

  function questAdvanceBoss(g, amount) {
    if (amount <= 0) return;
    const n = g.quests.front;
    if (!n || n.kind !== 2) return;
    n.progress += amount;
    if (n.progress > n.target) n.progress = n.target;
  }

  function questAdvanceLevel(g) {
    const n = g.quests.front;
    if (!n || n.kind !== 3) return;
    const p = g.players[g.activePlayer];
    if (!p) return;
    n.progress = p.level;
    if (n.progress > n.target) n.progress = n.target;
  }

  function questAdvanceSkillUse(g, amount) {
    if (amount <= 0) return;
    const n = g.quests.front;
    if (!n || n.kind !== 4) return;
    n.progress += amount;
    if (n.progress > n.target) n.progress = n.target;
  }

  function syncQuestProgress(g) {
    questAdvanceLevel(g);
  }

  function getJobCombat(jobId) {
    const c = global.JobCombat || {};
    return c[jobId] || c.warrior || { basic: { name: "攻擊", range: 1, rangeType: "melee", mpCost: 0, mult: 1 }, skills: [] };
  }

  function getJobAttack(jobId) {
    return getJobCombat(jobId).basic || { name: "攻擊", mpCost: 0, mult: 1 };
  }

  function distManhattan(g, m) {
    return Math.abs(m.x - g.mapX) + Math.abs(m.y - g.mapY);
  }

  function facingVector(facing) {
    if (facing === "up") return [0, -1];
    if (facing === "left") return [-1, 0];
    if (facing === "right") return [1, 0];
    return [0, 1];
  }

  function monsterInFacing(g, m) {
    const [fx, fy] = facingVector(g.facing || "down");
    const dx = m.x - g.mapX;
    const dy = m.y - g.mapY;
    if (fx !== 0) return dx * fx > 0;
    return dy * fy > 0;
  }

  function findTargetMonster(g, atk) {
    const range = atk.range ?? 1;
    const type = atk.rangeType || (range <= 1 ? "melee" : "ranged");
    const candidates = [];
    for (const m of g.mapMonsters || []) {
      const d = distManhattan(g, m);
      if (m.x === g.mapX && m.y === g.mapY) {
        candidates.push({ m, d: 0, facing: true });
        continue;
      }
      if (type === "melee" || type === "dash") {
        if (d !== 1 && !(type === "dash" && d <= range && d >= 1)) continue;
        if (type === "melee" && d !== 1) continue;
        if (type === "dash" && (d < 1 || d > range)) continue;
      } else if (d < 1 || d > range) continue;
      candidates.push({ m, d, facing: monsterInFacing(g, m) });
    }
    if (!candidates.length) return null;
    const facingHits = candidates.filter((c) => c.facing);
    const pool = facingHits.length ? facingHits : candidates;
    pool.sort((a, b) => a.d - b.d);
    return pool[0].m;
  }

  function findMonstersInRange(g, range) {
    return (g.mapMonsters || []).filter((m) => {
      const d = distManhattan(g, m);
      return d >= 1 && d <= range;
    });
  }

  function setCombatFx(g, atk, target) {
    g.combatFx = {
      kind: atk.fx || (atk.rangeType === "ranged" ? "bolt" : "slash"),
      color: atk.fxColor || "#ffffff",
      fromX: g.mapX,
      fromY: g.mapY,
      toX: target ? target.x : g.mapX,
      toY: target ? target.y : g.mapY,
      ttl: 16,
      jobId: g.heroJobId,
    };
  }

  function tickCombatFx(g) {
    if (g.combatFx && g.combatFx.ttl > 0) g.combatFx.ttl -= 1;
    else g.combatFx = null;
  }

  function setMonsterAttackFx(g, m) {
    g.monsterAttackFx = {
      monsterId: m.id,
      fromX: m.x,
      fromY: m.y,
      toX: g.mapX,
      toY: g.mapY,
      ttl: 18,
      name: m.name,
    };
  }

  function tickMonsterAttackFx(g) {
    if (g.monsterAttackFx && g.monsterAttackFx.ttl > 0) g.monsterAttackFx.ttl -= 1;
    else g.monsterAttackFx = null;
  }

  function countNormals(g) {
    return (g.mapMonsters || []).filter((m) => !m.isBoss).length;
  }

  function countBosses(g) {
    return (g.mapMonsters || []).filter((m) => m.isBoss).length;
  }

  function applyQuestRewards(g, questNode) {
    const p = g.players[g.activePlayer];
    if (!p || !questNode?.rewardItems) return;
    for (const it of questNode.rewardItems) {
      invAdd(p, it.name, it.qty || 1, it.heal || 0, it.mp || 0);
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
      g.message = `升級！Lv${p.level}`;
      syncQuestProgress(g);
      questTryCompleteFront(g);
    }
  }

  function questTryCompleteFront(g) {
    while (g.quests.front && g.quests.front.progress >= g.quests.front.target) {
      const f = g.quests.front;
      const title = f.title;
      const rx = f.rewardExp;
      applyQuestRewards(g, f);
      questDequeue(g.quests);
      grantExp(g, rx);
      const rewardNote = f.rewardItems?.length ? "、道具" : "";
      const line = `任務完成：${title}（+${rx} 經驗${rewardNote}）`;
      if (!g.message) g.message = line;
      else g.message = `${line}. ${g.message}`;
    }
    if (!g.quests.front) g.allQuestsDone = 1;
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
    g.message = "已回溯";
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
    g.message += ` 受到 ${dmg} 傷害`;
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
    g.message = `遭遇 ${g.monsterName}`;
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
    return findTargetMonster(g, { range: 1, rangeType: "melee" });
  }

  function removeMapMonsterById(g, id) {
    g.mapMonsters = (g.mapMonsters || []).filter((m) => m.id !== id);
  }

  function isBossArenaTile(x, y) {
    const center = WorldView?.getMapCenter?.() || { x: 7, y: 5 };
    return Math.abs(x - center.x) <= 1 && Math.abs(y - center.y) <= 1;
  }

  function collectSpawnSpots(g, forBoss) {
    const tiles = g.worldTiles;
    const spots = [];
    if (!tiles?.length) return spots;
    const COLS = WorldView?.COLS || 15;
    const ROWS = WorldView?.ROWS || 10;
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (!WorldView?.isWalkable?.(tiles, x, y)) continue;
        if (!forBoss && isBossArenaTile(x, y)) continue;
        if (x === g.mapX && y === g.mapY) continue;
        if (monsterAt(g, x, y)) continue;
        if (!forBoss && Math.abs(x - g.mapX) + Math.abs(y - g.mapY) < 2) continue;
        spots.push({ x, y });
      }
    }
    for (let i = spots.length - 1; i > 0; i--) {
      const j = randRange(g, 0, i);
      const t = spots[i];
      spots[i] = spots[j];
      spots[j] = t;
    }
    return spots;
  }

  function spawnOneAt(g, x, y, isBoss) {
    const tiles = g.worldTiles;
    if (!tiles?.length) return false;
    const COLS = WorldView?.COLS || 15;
    const ROWS = WorldView?.ROWS || 10;
    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) return false;
    if (!WorldView?.isWalkable?.(tiles, x, y)) return false;
    if (x === g.mapX && y === g.mapY) return false;
    if (monsterAt(g, x, y)) return false;
    const stage = g.stage || 1;
    if (!g.nextMonsterId) g.nextMonsterId = 1;
    if (isBoss) {
      const si = Math.min(MAX_STAGES, Math.max(1, stage)) - 1;
      const bossTypes = [2, 9, 10, 11, 12];
      const idx = bossTypes[si] || 3;
      const t = MONSTERS[idx] || MONSTERS[3];
      let mh = 70 + stage * 28 + randRange(g, -5, 12);
      if (mh < 40) mh = 40;
      const bname = BOSS_NAMES[si];
      const bossVariant = si;
      const theme = g.mapTheme?.id || global.STAGE_MONSTER_POOLS?.[si]?.theme || "";
      g.mapMonsters.push({
        id: g.nextMonsterId++,
        x,
        y,
        typeIndex: idx,
        themeId: theme,
        name: `首領·${bname}`,
        hp: mh,
        maxHp: mh,
        atk: t.atk + 6 + stage * 2,
        def: t.def + 3 + Math.floor(stage / 2),
        exp: 40 + stage * 15,
        isBoss: 1,
        bossVariant,
      });
      return true;
    }
    const picked = pickStageMonster(g);
    let mh = picked.hp + randRange(g, -3, 4) + Math.floor(stage * 0.5);
    if (mh < 8) mh = 8;
    g.mapMonsters.push({
      id: g.nextMonsterId++,
      x,
      y,
      typeIndex: picked.typeIndex,
      themeId: picked.themeId,
      name: picked.name,
      hp: mh,
      maxHp: mh,
      atk: picked.atk + Math.floor(stage / 3),
      def: picked.def,
      exp: picked.exp + stage * 2,
      isBoss: 0,
    });
    return true;
  }

  function applyMapForStage(g) {
    const stage = Math.min(MAX_STAGES, Math.max(1, g.stage || 1));
    g.stage = stage;
    const seed = (g.rngSeed + stage * 9973) >>> 0;
    if (typeof WorldView !== "undefined" && WorldView.buildStageMap) {
      const built = WorldView.buildStageMap(seed, stage);
      g.worldTiles = built.tiles;
      g.mapTheme = built.theme;
    } else if (typeof WorldView !== "undefined" && WorldView.buildFixedMap) {
      g.worldTiles = WorldView.buildFixedMap(seed, stage);
    } else {
      g.worldTiles = [];
      g.mapTheme = null;
    }
    g.mapX = 1;
    g.mapY = 1;
  }

  function spawnStageNormals(g) {
    g.mapMonsters = [];
    g.stagePhase = "normal";
    const count = STAGE_MONSTER_COUNT;
    g.stageQuota = count;
    const spots = collectSpawnSpots(g);
    let placed = 0;
    for (let i = 0; i < spots.length && placed < count; i++) {
      if (spawnOneAt(g, spots[i].x, spots[i].y, false)) placed++;
    }
    if (placed < count) {
      for (let x = 2; x <= 12 && placed < count; x++) {
        for (let y = 2; y <= 7 && placed < count; y++) {
          if (spawnOneAt(g, x, y, false)) placed++;
        }
      }
    }
    const themeName = g.mapTheme?.name || "未知";
    const pool = global.STAGE_MONSTER_POOLS?.[(g.stage || 1) - 1];
    const mobHint = pool?.entries?.length ? pool.entries.map((e) => e.name).filter((n, i, a) => a.indexOf(n) === i).slice(0, 3).join("、") : "";
    g.message = `第 ${g.stage || 1} 關【${themeName}】：${placed} 隻魔物${mobHint ? `（${mobHint}…）` : ""}`;
  }

  function spawnBoss(g) {
    if (countBosses(g) > 0) return;
    const center = WorldView?.getMapCenter?.() || { x: 7, y: 5 };
    const tiles = g.worldTiles;
    if (tiles?.length && !WorldView?.isWalkable?.(tiles, center.x, center.y)) {
      tiles[center.y][center.x] = 0;
    }

    const tryOrder = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let placed = false;
    for (const [dx, dy] of tryOrder) {
      if (spawnOneAt(g, center.x + dx, center.y + dy, true)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      const spots = collectSpawnSpots(g, true);
      for (const s of spots) {
        if (spawnOneAt(g, s.x, s.y, true)) {
          placed = true;
          break;
        }
      }
    }
    g.stagePhase = "boss";
    g.message = placed ? `第 ${g.stage || 1} 關首領現身於地圖中央！` : `第 ${g.stage || 1} 關首領出現！`;
  }

  function completeAllStages(g) {
    g.allStagesClear = 1;
    g.stagePhase = "clear";
    g.mapMonsters = [];
    g.message = `恭喜通關！完成全部 ${MAX_STAGES} 關冒險！`;
  }

  function advanceStage(g) {
    const p = g.players[g.activePlayer];
    const cur = g.stage || 1;
    if (cur >= MAX_STAGES) {
      completeAllStages(g);
      return;
    }
    g.stage = cur + 1;
    questAdvanceStage(g, 1);
    questTryCompleteFront(g);
    p.hp = Math.min(p.hp + 18, p.maxHp);
    p.mp = Math.min(p.mp + 12, p.maxMp);
    applyMapForStage(g);
    spawnStageNormals(g);
  }

  function monsterCounterAttack(g, m) {
    setMonsterAttackFx(g, m);
    const p = g.players[g.activePlayer];
    let def = p.def;
    if (g.playerDefBoostTurns > 0) {
      def += 4;
      g.playerDefBoostTurns--;
    }
    const dmg = physDamage(g, m.atk, def);
    p.hp -= dmg;
    if (p.hp < 0) p.hp = 0;
    g.message += ` · ${m.name}反擊 ${dmg}`;
    if (p.hp <= 0) {
      g.gameOver = 1;
      g.message = "遊戲結束";
    }
  }

  function performHeroAttack(g, p, m, atk) {
    if (!atk) atk = getJobAttack(g.heroJobId);
    if ((atk.mpCost || 0) > 0 && p.mp < atk.mpCost) {
      g.message = "魔力不足";
      return null;
    }
    if (atk.mpCost > 0) p.mp -= atk.mpCost;
    let def = m.def;
    const ign = atk.ignoreDef || 0;
    if (def > ign) def -= ign;
    else def = 0;
    let dmg = physDamage(g, Math.floor(p.atk * (atk.mult || 1)), def);
    if (atk.critPct > 0 && randRange(g, 1, 100) <= atk.critPct) {
      dmg *= 2;
      g.message = `${atk.name} 暴擊 ${dmg}`;
    } else {
      g.message = `${atk.name} ${dmg}`;
    }
    if (atk.healSelf > 0) {
      p.hp += atk.healSelf;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      g.message += ` 自癒+${atk.healSelf}`;
    }
    return dmg;
  }

  function resolveHitOnMonster(g, p, m, atk) {
    const dmg = performHeroAttack(g, p, m, atk);
    if (dmg == null) return false;
    setCombatFx(g, atk, m);
    m.hp -= dmg;
    if (m.hp < 0) m.hp = 0;
    if (m.hp <= 0) {
      g.message += " 擊敗！";
      onMonsterKilled(g, m);
      return true;
    }
    monsterCounterAttack(g, m);
    return !g.gameOver;
  }

  function mapAttackWithDef(g, atk) {
    g.inBattle = 0;
    g.gameOver = 0;
    const p = g.players[g.activePlayer];
    if (!atk) {
      g.message = "無效招式";
      return false;
    }
    if ((atk.mpCost || 0) > 0 && p.mp < atk.mpCost) {
      g.message = "魔力不足";
      return false;
    }

    if (atk.targetSelf && atk.heal) {
      p.mp -= atk.mpCost || 0;
      p.hp += atk.heal;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      g.message = `${atk.name} 回復 +${atk.heal}`;
      setCombatFx(g, atk, null);
      return true;
    }

    if (atk.defBoostTurns) {
      p.mp -= atk.mpCost || 0;
      g.playerDefBoostTurns = atk.defBoostTurns;
      g.message = `${atk.name}：防禦提升 ${atk.defBoostTurns} 回合`;
      setCombatFx(g, atk, null);
      return true;
    }

    if (atk.aoe) {
      const targets = findMonstersInRange(g, atk.range || 2);
      if (!targets.length) {
        g.message = "範圍內沒有目標";
        return false;
      }
      if (atk.mpCost > 0) p.mp -= atk.mpCost;
      let total = 0;
      const killed = [];
      for (const m of targets) {
        let def = m.def;
        const ign = atk.ignoreDef || 0;
        if (def > ign) def -= ign;
        else def = 0;
        const dmg = physDamage(g, Math.floor(p.atk * (atk.mult || 1)), def);
        m.hp -= dmg;
        if (m.hp < 0) m.hp = 0;
        total += dmg;
        if (m.hp <= 0) killed.push(m);
      }
      g.message = `${atk.name} 範圍 ${total}`;
      setCombatFx(g, atk, targets[0]);
      for (const m of killed) onMonsterKilled(g, m);
      const alive = targets.filter((m) => m.hp > 0);
      if (alive.length) monsterCounterAttack(g, alive[0]);
      return !g.gameOver;
    }

    const m = findTargetMonster(g, atk);
    if (!m) {
      const hint =
        atk.rangeType === "ranged" || (atk.range || 1) > 1
          ? `沒有目標（最遠 ${atk.range} 格）`
          : "沒有目標（需貼近敵人）";
      g.message = hint;
      return false;
    }
    return resolveHitOnMonster(g, p, m, atk);
  }

  function mapSkill(g, skillIndex) {
    const combat = getJobCombat(g.heroJobId);
    const sk = combat.skills?.[skillIndex];
    if (!sk) {
      g.message = "無此技能";
      return false;
    }
    const ok = mapAttackWithDef(g, sk);
    if (ok) {
      g.skillUseCount = (g.skillUseCount || 0) + 1;
      questAdvanceSkillUse(g, 1);
      questTryCompleteFront(g);
    } else if (sk.targetSelf || sk.defBoostTurns) {
      g.skillUseCount = (g.skillUseCount || 0) + 1;
      questAdvanceSkillUse(g, 1);
      questTryCompleteFront(g);
    }
    return ok;
  }

  function onMonsterKilled(g, m) {
    const p = g.players[g.activePlayer];
    if (!m.isBoss) questAdvanceKill(g, 1);
    questTryCompleteFront(g);
    if (!m.isBoss && randRange(g, 1, 100) <= 25) {
      invAdd(p, "藥草", 1, 12, 0);
      const msg = String(g.message || "");
      if (!msg.includes("掉落")) g.message = msg + (msg ? " · " : "") + "掉落藥草";
    }
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
      g.message += " 升級！";
      syncQuestProgress(g);
      questTryCompleteFront(g);
    }
    removeMapMonsterById(g, m.id);
    g.engagedMonsterId = 0;
    if (m.isBoss) {
      questAdvanceBoss(g, 1);
      questAdvanceStage(g, 1);
      questTryCompleteFront(g);
      const cur = g.stage || 1;
      const themeName = g.mapTheme?.name || "";
      g.message += " 首領擊敗！";
      if (cur >= MAX_STAGES) {
        g.message = `第 ${cur} 關【${themeName}】通關！${g.message}`;
        completeAllStages(g);
        return;
      }
      advanceStage(g);
      return;
    }
    if (countNormals(g) === 0 && g.stagePhase !== "boss") {
      spawnBoss(g);
    }
  }

  function mapStrike(g) {
    const combat = getJobCombat(g.heroJobId);
    return mapAttackWithDef(g, combat.basic);
  }

  function mapEngage(g) {
    return mapStrike(g);
  }

  function initWorld(g) {
    if (!g.stage) g.stage = 1;
    applyMapForStage(g);
    g.mapMonsters = [];
    g.nextMonsterId = 1;
    g.engagedMonsterId = 0;
    g.stagePhase = "normal";
    spawnStageNormals(g);
  }

  function spawnMapMonsters(g) {
    spawnStageNormals(g);
  }

  function playerAttack(g) {
    return mapStrike(g);
  }

  function playerDefend(g) {
    if (!g.inBattle) return false;
    pushUndo(g);
    g.playerDefBoostTurns = 2;
    g.message = "防禦";
    monsterAttackPlayer(g);
    const p = g.players[g.activePlayer];
    if (p.hp <= 0) {
      p.hp = 1;
      g.inBattle = 0;
      clearUndo(g);
      g.message += " 被擊倒";
    }
    return true;
  }

  function playerUse(g, slot) {
    const p = g.players[g.activePlayer];
    const r = invUseSlot(p, parseInt(slot, 10) || 0);
    if (!r.ok) {
      g.message = "沒有道具";
      return false;
    }
    const parts = [];
    if (r.heal > 0) {
      p.hp += r.heal;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      parts.push(`HP+${r.heal}`);
    }
    if (r.mp > 0) {
      p.mp += r.mp;
      if (p.mp > p.maxMp) p.mp = p.maxMp;
      parts.push(`MP+${r.mp}`);
    }
    g.message = parts.length ? `使用道具：${parts.join("，")}` : "無效果";
    return parts.length > 0;
  }

  function ensureMapMonsters(g) {
    if (!g.worldTiles?.length) return;
    if (!g.mapMonsters?.length) {
      if (!g.nextMonsterId) g.nextMonsterId = 1;
      if (!g.stage) g.stage = 1;
      if (!g.stagePhase) g.stagePhase = "normal";
      spawnStageNormals(g);
    }
  }

  function playerFlee(g) {
    if (!g.inBattle) return false;
    let chance = 55 + g.players[g.activePlayer].level * 3;
    if (chance > 90) chance = 90;
    const r = randRange(g, 1, 100);
    if (r <= chance) {
      g.message = "逃跑成功";
      g.inBattle = 0;
      g.engagedMonsterId = 0;
      clearUndo(g);
      return true;
    }
    g.message = "逃跑失敗";
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
    g.storyTitle = story?.title || "冒險";
    g.storyIntro = story?.intro || "在地圖上擊敗魔物，通關後迎戰首領。";
    if (g.players[0] && story?.name) g.players[0].name = story.name;
    const list = story?.quests || [
      { title: "初陣", desc: "通關 2 關", kind: 1, target: 2, rewardExp: 30 },
      { title: "遠征", desc: "通關 5 關", kind: 1, target: 5, rewardExp: 60 },
    ];
    let id = 1;
    g.allQuestsDone = 0;
    for (const q of list) {
      questEnqueue(g.quests, {
        id: id++,
        title: q.title,
        desc: q.desc,
        kind: q.kind ?? 0,
        target: q.target,
        progress: 0,
        rewardExp: q.rewardExp || 30,
        rewardItems: Array.isArray(q.rewardItems) ? q.rewardItems.slice() : [],
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
      allQuestsDone: 0,
      allStagesClear: 0,
      skillUseCount: 0,
      stage: 1,
      stagePhase: "normal",
      stageQuota: 0,
      facing: "down",
      combatFx: null,
      monsterAttackFx: null,
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
    const job = g.heroJobId;
    invAdd(g.players[0], "藥草", 2, 12, 0);
    invAdd(g.players[0], "治療藥水", 1, 35, 0);
    invAdd(g.players[0], "魔力藥水", 1, 0, 30);
    if (job === "priest") invAdd(g.players[0], "藥草", 1, 12, 0);
    if (job === "warrior") invAdd(g.players[0], "強效藥水", 1, 60, 0);
    g.playerCount = 1;
    bootstrapQuests(g);
    syncQuestProgress(g);
    initWorld(g);
    g.message = "冒險開始";
    return g;
  }

  function applyCommand(g, cmd, arg) {
    const c = String(cmd || "").toLowerCase();
    if (c === "status") return true;
    if (c === "explore") return explore(g);
    if (c === "attack" || c === "battle_attack") return mapStrike(g);
    if (c === "skill") return mapSkill(g, parseInt(arg, 10) || 0);
    if (c === "defend") return playerDefend(g);
    if (c === "flee") return playerFlee(g);
    if (c === "undo") return popUndo(g);
    if (c === "use") return playerUse(g, parseInt(arg, 10) || 0);
    if (c === "switch") {
      const idx = parseInt(arg, 10);
      if (idx < 0 || idx >= g.playerCount) {
        g.message = "無效角色";
        return false;
      }
      if (g.inBattle) {
        g.message = "戰鬥中無法切換";
        return false;
      }
      g.activePlayer = idx;
      g.message = `切換：${g.players[idx].name}`;
      return true;
    }
    g.message = "未知指令";
    return false;
  }

  function questsToArray(g) {
    const arr = [];
    let idx = 0;
    for (let n = g.quests.front; n; n = n.next) {
      const done = n.progress >= n.target;
      const rewards = [];
      if (n.rewardExp) rewards.push(`${n.rewardExp} 經驗`);
      for (const it of n.rewardItems || []) {
        const label = global.ItemCatalog?.[it.name]?.label || it.name;
        rewards.push(`${it.qty || 1}×${label}`);
      }
      arr.push({
        id: n.id,
        title: n.title,
        desc: n.desc,
        progress: n.progress,
        target: n.target,
        kind: n.kind,
        done,
        active: idx === 0 && !done,
        locked: idx > 0,
        reward_text: rewards.join(", "),
      });
      idx++;
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
        mp: it.mp || 0,
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
      all_quests_done: !!g.allQuestsDone,
      stage: g.stage || 1,
      stage_phase: g.stagePhase || "normal",
      stage_quota: g.stageQuota || 0,
      map_theme: g.mapTheme?.id || "meadow",
      map_theme_name: g.mapTheme?.name || "",
      max_stages: MAX_STAGES,
      all_stages_clear: !!g.allStagesClear,
      normals_left: countNormals(g),
      boss_active: g.stagePhase === "boss",
      attack_name: getJobAttack(g.heroJobId).name,
      attack_desc: getStory(g.heroJobId)?.attackDesc || "",
      attack_range: getJobAttack(g.heroJobId).range || 1,
      attack_range_type: getJobAttack(g.heroJobId).rangeType || "melee",
      skills: (getJobCombat(g.heroJobId).skills || []).map((sk, i) => ({
        index: i,
        name: sk.name,
        key: sk.key || String(i + 1),
        mp_cost: sk.mpCost || 0,
        range: sk.range,
        range_type: sk.rangeType,
        desc: skillDesc(sk),
      })),
      combat_fx: g.combatFx ? { ...g.combatFx } : null,
      monster_attack_fx: g.monsterAttackFx ? { ...g.monsterAttackFx } : null,
      facing: g.facing || "down",
    };
  }

  function skillDesc(sk) {
    if (sk.targetSelf && sk.heal) return `回復 ${sk.heal} HP，耗 ${sk.mpCost} MP`;
    if (sk.defBoostTurns) return `防禦提升 ${sk.defBoostTurns} 回合，耗 ${sk.mpCost} MP`;
    if (sk.aoe) return `範圍 ${sk.range} 格群體傷害，耗 ${sk.mpCost} MP`;
    const rt = sk.rangeType === "ranged" ? "遠程" : sk.rangeType === "dash" ? "突進" : "近戰";
    return `${rt} ${sk.range || 1} 格，耗 ${sk.mpCost || 0} MP`;
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
        rewardItems: Array.isArray(n.rewardItems) ? n.rewardItems : [],
      });
    }
    return {
      v: 9,
      facing: g.facing || "down",
      stage: g.stage || 1,
      stagePhase: g.stagePhase || "normal",
      stageQuota: g.stageQuota || 0,
      mapTheme: g.mapTheme || null,
      heroJobId: g.heroJobId || g.players[0]?.jobId || "warrior",
      storyTitle: g.storyTitle || "",
      storyIntro: g.storyIntro || "",
      allQuestsDone: g.allQuestsDone ? 1 : 0,
      allStagesClear: g.allStagesClear ? 1 : 0,
      skillUseCount: g.skillUseCount || 0,
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
    if (
      !data ||
      (data.v !== 1 &&
        data.v !== 2 &&
        data.v !== 3 &&
        data.v !== 5 &&
        data.v !== 6 &&
        data.v !== 7 &&
        data.v !== 8 &&
        data.v !== 9)
    )
      return null;
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
      allQuestsDone: data.allQuestsDone ? 1 : 0,
      allStagesClear: data.allStagesClear ? 1 : 0,
      skillUseCount: data.skillUseCount || 0,
      stage: data.stage || 1,
      stagePhase: data.stagePhase || "normal",
      stageQuota: data.stageQuota || 0,
      facing: data.facing || "down",
      mapTheme: data.mapTheme || null,
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
        rewardItems: Array.isArray(q.rewardItems) ? q.rewardItems : [],
        next: null,
      });
    }
    if (!g.quests.front) g.allQuestsDone = 1;
    const cols = WorldView?.COLS || 15;
    const rows = WorldView?.ROWS || 10;
    const tilesBad =
      !g.worldTiles?.length ||
      g.worldTiles.length !== rows ||
      g.worldTiles[0]?.length !== cols;
    if (tilesBad) {
      applyMapForStage(g);
      g.mapMonsters = [];
      g.nextMonsterId = g.nextMonsterId || 1;
      if (g.mapX < 1) g.mapX = 1;
      if (g.mapY < 1) g.mapY = 1;
      if (!g.stage) g.stage = 1;
      spawnStageNormals(g);
    } else if (countNormals(g) === 0 && countBosses(g) === 0 && g.stagePhase !== "boss") {
      spawnBoss(g);
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
    syncQuestProgress(g);
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
    mapSkill,
    ensureMapMonsters,
    applyMapForStage,
    MAX_STAGES,
    getJobCombat,
    getJobAttack,
    tickCombatFx,
    tickMonsterAttackFx,
    MAX_PLAYERS,
    JOB_STATS,
  };
})(typeof window !== "undefined" ? window : globalThis);
