/**
 * Browser RPG engine — rules aligned with src/ (C): LCG RNG, linked-list inventory,
 * FIFO quest queue, battle undo stack.
 */
(function (global) {
  const MAX_PLAYERS = 4;
  const MAX_UNDO = 16;
  const MONSTERS = [
    { name: "史萊姆", hp: 22, atk: 5, def: 1, exp: 12 },
    { name: "哥布林", hp: 30, atk: 8, def: 2, exp: 20 },
    { name: "狼", hp: 40, atk: 11, def: 3, exp: 35 },
    { name: "石像鬼", hp: 55, atk: 14, def: 5, exp: 55 },
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
      g.message = `升級到 Lv${p.level}！`;
    }
  }

  function questTryCompleteFront(g) {
    const f = g.quests.front;
    if (!f || f.progress < f.target) return;
    const title = f.title;
    const rx = f.rewardExp;
    questDequeue(g.quests);
    grantExp(g, rx);
    if (!g.message) g.message = `完成任務：${title} (+${rx} EXP)`;
    else g.message = `完成任務：${title} (+${rx} EXP)。${g.message}`;
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
    g.message = "已回溯上一回合行動。";
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
    g.message += ` ${g.monsterName} 反擊造成 ${dmg} 傷害。`;
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
    g.message = `遭遇 ${g.monsterName}！`;
  }

  function explore(g) {
    if (g.inBattle) {
      g.message = "戰鬥中無法探索。";
      return false;
    }
    const roll = randRange(g, 1, 100);
    g.mapX += randRange(g, -1, 1);
    g.mapY += randRange(g, -1, 1);
    if (roll <= 45) {
      spawnMonster(g);
      return true;
    }
    if (roll <= 65) {
      invAdd(g.players[g.activePlayer], "藥草", 1, 12);
      g.message = "你在路上撿到藥草（小回復）。";
      return true;
    }
    if (roll <= 80) {
      g.message = "四周很安靜，什麼也沒發生。";
      return true;
    }
    g.message = "你感覺到遠方有任務的氣息…（繼續探索）。";
    return true;
  }

  function playerAttack(g) {
    if (!g.inBattle) return false;
    pushUndo(g);
    const p = g.players[g.activePlayer];
    let dmg = physDamage(g, p.atk, g.monsterDef);
    g.monsterHp -= dmg;
    if (g.monsterHp < 0) g.monsterHp = 0;
    g.message = `你攻擊造成 ${dmg} 傷害。`;
    if (g.monsterHp <= 0) {
      g.message += " 擊敗魔物！";
      questAdvanceKill(g, 1);
      questTryCompleteFront(g);
      p.exp += g.monsterExp;
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
      }
      g.inBattle = 0;
      clearUndo(g);
      return true;
    }
    monsterAttackPlayer(g);
    if (p.hp <= 0) {
      g.message += " 你戰敗…";
      g.inBattle = 0;
      clearUndo(g);
      p.hp = 1;
    }
    return true;
  }

  function playerDefend(g) {
    if (!g.inBattle) return false;
    pushUndo(g);
    g.playerDefBoostTurns = 2;
    g.message = "你舉盾防禦，暫時提升防禦。";
    monsterAttackPlayer(g);
    const p = g.players[g.activePlayer];
    if (p.hp <= 0) {
      p.hp = 1;
      g.inBattle = 0;
      clearUndo(g);
      g.message += " 仍受重擊…脫離戰鬥。";
    }
    return true;
  }

  function playerUse(g, slot) {
    if (!g.inBattle) return false;
    const p = g.players[g.activePlayer];
    pushUndo(g);
    const r = invUseSlot(p, slot);
    if (!r.ok || r.heal <= 0) {
      popUndo(g);
      g.message = "此欄位沒有可回復的道具。";
      return false;
    }
    p.hp += r.heal;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    g.message = `使用道具回復 ${r.heal} HP。`;
    monsterAttackPlayer(g);
    if (p.hp <= 0) {
      p.hp = 1;
      g.inBattle = 0;
      clearUndo(g);
      g.message += " 仍被擊倒…";
    }
    return true;
  }

  function playerFlee(g) {
    if (!g.inBattle) return false;
    let chance = 55 + g.players[g.activePlayer].level * 3;
    if (chance > 90) chance = 90;
    const r = randRange(g, 1, 100);
    if (r <= chance) {
      g.message = "成功逃離戰鬥。";
      g.inBattle = 0;
      clearUndo(g);
      return true;
    }
    g.message = "逃跑失敗！";
    monsterAttackPlayer(g);
    const p = g.players[g.activePlayer];
    if (p.hp <= 0) {
      p.hp = 1;
      g.inBattle = 0;
      clearUndo(g);
    }
    return true;
  }

  function bootstrapQuests(g) {
    questEnqueue(g.quests, {
      id: 1,
      title: "初討伐",
      desc: "擊敗 2 隻魔物",
      kind: 0,
      target: 2,
      progress: 0,
      rewardExp: 30,
      next: null,
    });
    questEnqueue(g.quests, {
      id: 2,
      title: "深入荒野",
      desc: "擊敗 4 隻魔物",
      kind: 0,
      target: 4,
      progress: 0,
      rewardExp: 60,
      next: null,
    });
  }

  function newGame(names) {
    const g = {
      rngSeed: (Date.now() >>> 0) || 1,
      playerCount: 0,
      activePlayer: 0,
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
      players: [],
    };
    const list = names && names.length ? names.slice(0, MAX_PLAYERS) : ["勇者"];
    for (let i = 0; i < list.length; i++) {
      g.players.push({
        name: String(list[i]).slice(0, 48) || `角色${i + 1}`,
        hp: 100,
        maxHp: 100,
        mp: 40,
        maxMp: 40,
        atk: 12,
        def: 4,
        level: 1,
        exp: 0,
        inventory: null,
      });
      invAdd(g.players[i], "藥草", 2, 12);
      invAdd(g.players[i], "強效藥水", 1, 35);
    }
    g.playerCount = g.players.length;
    bootstrapQuests(g);
    g.message = `新冒險開始！已建立 ${g.playerCount} 名角色。`;
    return g;
  }

  function applyCommand(g, cmd, arg) {
    const c = String(cmd || "").toLowerCase();
    if (c === "status") return true;
    if (c === "explore") return explore(g);
    if (c === "attack") return playerAttack(g);
    if (c === "defend") return playerDefend(g);
    if (c === "flee") return playerFlee(g);
    if (c === "undo") return popUndo(g);
    if (c === "use") return playerUse(g, parseInt(arg, 10) || 0);
    if (c === "switch") {
      const idx = parseInt(arg, 10);
      if (idx < 0 || idx >= g.playerCount) {
        g.message = "無效的角色索引。";
        return false;
      }
      if (g.inBattle) {
        g.message = "戰鬥中不能切換角色。";
        return false;
      }
      g.activePlayer = idx;
      g.message = `切換操作角色：${g.players[idx].name}`;
      return true;
    }
    g.message = "未知指令。";
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
    const battle = g.inBattle
      ? {
          name: g.monsterName,
          hp: g.monsterHp,
          max_hp: g.monsterMaxHp,
          atk: g.monsterAtk,
          def: g.monsterDef,
          can_undo: g.undo.length > 0,
        }
      : null;
    return {
      ok: true,
      message: g.message || "",
      phase: g.inBattle ? "battle" : "explore",
      map: { x: g.mapX, y: g.mapY },
      active_player: g.activePlayer,
      players,
      quests: questsToArray(g),
      battle,
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
      v: 1,
      rngSeed: g.rngSeed,
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
    if (!data || data.v !== 1) return null;
    const g = {
      rngSeed: data.rngSeed >>> 0 || 1,
      playerCount: data.playerCount || 1,
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
    };
    const parr = data.players || [];
    for (let i = 0; i < parr.length && i < MAX_PLAYERS; i++) {
      const p = parr[i];
      g.players.push({
        name: p.name || "勇者",
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
    g.playerCount = g.players.length;
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
    return g;
  }

  global.RPG = { newGame, applyCommand, toView, serialize, deserialize, MAX_PLAYERS };
})(typeof window !== "undefined" ? window : globalThis);
