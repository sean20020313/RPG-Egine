/**
 * 各職業故事、任務、戰鬥方式（近戰／遠程）與技能
 */
(function (global) {
  global.HeroStories = {
    warrior: {
      name: "阿爾德里克",
      className: "戰士",
      title: "落堡之誓",
      intro:
        "騎士阿爾德里克獨守邊境堡壘。王都陷落後魔物湧入荒野，他是村莊前的最後防線。重劈與盾牆，是他僅剩的語言。",
      attackName: "重劈",
      attackDesc: "近戰：需貼近敵人（相鄰一格）",
      quests: [
        {
          title: "初陣試煉",
          desc: "通關 2 關（每關擊敗首領）",
          kind: 1,
          target: 2,
          rewardExp: 40,
          rewardItems: [{ name: "藥草", qty: 2, heal: 12 }],
        },
        {
          title: "收復關隘",
          desc: "通關 5 關",
          kind: 1,
          target: 5,
          rewardExp: 90,
          rewardItems: [{ name: "治療藥水", qty: 1, heal: 35 }],
        },
      ],
    },
    mage: {
      name: "萊拉",
      className: "法師",
      title: "破碎魔導書",
      intro:
        "大法師萊拉在災變中遺失了魔導書。殘存的咒文仍聽從她的召喚，但每一道火球都會引來更深的暗影。",
      attackName: "魔彈",
      attackDesc: "遠程：最遠 3 格，朝面向方向優先",
      quests: [
        {
          title: "凝聚精華",
          desc: "通關 2 關",
          kind: 1,
          target: 2,
          rewardExp: 40,
          rewardItems: [{ name: "乙醚", qty: 1, heal: 0, mp: 25 }],
        },
        {
          title: "封印裂隙",
          desc: "通關 5 關",
          kind: 1,
          target: 5,
          rewardExp: 90,
          rewardItems: [{ name: "強效藥水", qty: 1, heal: 60 }],
        },
      ],
    },
    priest: {
      name: "艾拉",
      className: "牧師",
      title: "最後聖所之歌",
      intro:
        "修女艾拉守護聖所最後一盞長明燈。治癒之光惹怒黑暗，她仍步入荒野，要把希望帶回岔路口。",
      attackName: "聖擊",
      attackDesc: "近戰：傷敵並小幅自癒",
      quests: [
        {
          title: "淨化道路",
          desc: "通關 2 關",
          kind: 1,
          target: 2,
          rewardExp: 40,
          rewardItems: [{ name: "藥草", qty: 3, heal: 12 }],
        },
        {
          title: "點亮神龕",
          desc: "通關 5 關",
          kind: 1,
          target: 5,
          rewardExp: 90,
          rewardItems: [{ name: "治療藥水", qty: 2, heal: 35 }],
        },
      ],
    },
    thief: {
      name: "凱德",
      className: "盜賊",
      title: "王庫暗影",
      intro:
        "盜賊凱德為救妹妹竊走王冠寶石，卻喚醒庫中詛咒。森林裡的守衛不再放他無聲離去。",
      attackName: "暗襲",
      attackDesc: "近戰：高暴擊率",
      quests: [
        {
          title: "無聲腳步",
          desc: "通關 2 關",
          kind: 1,
          target: 2,
          rewardExp: 40,
          rewardItems: [{ name: "藥草", qty: 2, heal: 12 }, { name: "乙醚", qty: 1, heal: 0, mp: 25 }],
        },
        {
          title: "破除詛咒",
          desc: "通關 5 關",
          kind: 1,
          target: 5,
          rewardExp: 90,
          rewardItems: [{ name: "強效藥水", qty: 1, heal: 60 }],
        },
      ],
    },
  };

  /** @typedef {object} AttackDef */
  global.JobCombat = {
    warrior: {
      basic: {
        name: "重劈",
        range: 1,
        rangeType: "melee",
        mpCost: 0,
        mult: 1.25,
        healSelf: 0,
        critPct: 0,
        ignoreDef: 0,
        fx: "slash",
        fxColor: "#c8d8ff",
      },
      skills: [
        {
          name: "衝鋒斬",
          key: "1",
          range: 2,
          rangeType: "dash",
          mpCost: 8,
          mult: 1.75,
          ignoreDef: 2,
          fx: "slash",
          fxColor: "#a0b8ff",
        },
        {
          name: "盾牆",
          key: "2",
          mpCost: 6,
          defBoostTurns: 3,
          fx: "buff",
          fxColor: "#88aaff",
        },
      ],
    },
    mage: {
      basic: {
        name: "魔彈",
        range: 3,
        rangeType: "ranged",
        mpCost: 0,
        mult: 0.95,
        ignoreDef: 1,
        fx: "bolt",
        fxColor: "#b8f0ff",
      },
      skills: [
        {
          name: "火球術",
          key: "1",
          range: 4,
          rangeType: "ranged",
          mpCost: 12,
          mult: 1.65,
          ignoreDef: 3,
          fx: "fireball",
          fxColor: "#ff8840",
        },
        {
          name: "冰霜環",
          key: "2",
          range: 2,
          rangeType: "ranged",
          mpCost: 16,
          mult: 1.15,
          aoe: true,
          fx: "frost",
          fxColor: "#88e8ff",
        },
      ],
    },
    priest: {
      basic: {
        name: "聖擊",
        range: 1,
        rangeType: "melee",
        mpCost: 0,
        mult: 0.95,
        healSelf: 6,
        fx: "holy",
        fxColor: "#ffe8a0",
      },
      skills: [
        {
          name: "治療術",
          key: "1",
          targetSelf: true,
          heal: 38,
          mpCost: 10,
          fx: "heal",
          fxColor: "#88ffaa",
        },
        {
          name: "審判光",
          key: "2",
          range: 3,
          rangeType: "ranged",
          mpCost: 14,
          mult: 1.55,
          ignoreDef: 2,
          fx: "holy",
          fxColor: "#fff0c0",
        },
      ],
    },
    thief: {
      basic: {
        name: "暗襲",
        range: 1,
        rangeType: "melee",
        mpCost: 0,
        mult: 1.05,
        critPct: 40,
        ignoreDef: 4,
        fx: "slash",
        fxColor: "#5ee8a8",
      },
      skills: [
        {
          name: "毒刃",
          key: "1",
          range: 1,
          rangeType: "melee",
          mpCost: 7,
          mult: 1.35,
          ignoreDef: 5,
          fx: "poison",
          fxColor: "#88ff60",
        },
        {
          name: "飛刀",
          key: "2",
          range: 3,
          rangeType: "ranged",
          mpCost: 5,
          mult: 1.2,
          critPct: 25,
          ignoreDef: 2,
          fx: "knife",
          fxColor: "#c0e8d0",
        },
      ],
    },
  };

  global.JobAttacks = {};
  for (const job of Object.keys(global.JobCombat)) {
    global.JobAttacks[job] = global.JobCombat[job].basic;
  }
})(typeof window !== "undefined" ? window : globalThis);
