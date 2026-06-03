/**
 * 道具定義（背包 UI）
 */
(function (global) {
  global.ItemCatalog = {
    藥草: { label: "藥草", heal: 12, mp: 0, desc: "回復 12 HP", color: "#5a9a50", icon: "草" },
    治療藥水: { label: "治療藥水", heal: 35, mp: 0, desc: "回復 35 HP", color: "#4a78c8", icon: "水" },
    強效藥水: { label: "強效藥水", heal: 60, mp: 0, desc: "回復 60 HP", color: "#7a58d8", icon: "強" },
    乙醚: { label: "乙醚", heal: 0, mp: 25, desc: "回復 25 MP", color: "#58a8d8", icon: "魔" },
    魔力藥水: { label: "魔力藥水", heal: 0, mp: 30, desc: "回復 30 MP", color: "#6a88e8", icon: "魔" },
    Herb: { label: "藥草", heal: 12, mp: 0, desc: "回復 12 HP", color: "#5a9a50", icon: "草" },
    Potion: { label: "治療藥水", heal: 35, mp: 0, desc: "回復 35 HP", color: "#4a78c8", icon: "水" },
    "Hi-Potion": { label: "強效藥水", heal: 60, mp: 0, desc: "回復 60 HP", color: "#7a58d8", icon: "強" },
    Ether: { label: "乙醚", heal: 0, mp: 25, desc: "回復 25 MP", color: "#58a8d8", icon: "魔" },
    "MP Potion": { label: "魔力藥水", heal: 0, mp: 30, desc: "回復 30 MP", color: "#6a88e8", icon: "魔" },
  };
})(typeof window !== "undefined" ? window : globalThis);
