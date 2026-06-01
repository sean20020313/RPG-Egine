/**
 * Per-class hero identity and story quests
 */
(function (global) {
  global.HeroStories = {
    warrior: {
      name: "Aldric",
      className: "Warrior",
      title: "Oath of the Fallen Fort",
      intro:
        "Knight Aldric swore to hold the border fort alone. Monsters poured from the wilds after the king fell. Your blade is the last line before the villages burn.",
      quests: [
        { title: "Hold the Line", desc: "Slay 2 beasts to rally the refugees", target: 2, rewardExp: 35 },
        { title: "Reclaim the Gate", desc: "Slay 4 monsters at the fort road", target: 4, rewardExp: 70 },
      ],
    },
    mage: {
      name: "Lyra",
      className: "Mage",
      title: "The Shattered Grimoire",
      intro:
        "Archmage Lyra lost her spellbook in the cataclysm. Fragments of magic still answer her call, but every incantation draws shadow creatures toward her tower.",
      quests: [
        { title: "Gather Essence", desc: "Defeat 2 fiends to bind lost pages", target: 2, rewardExp: 35 },
        { title: "Seal the Rift", desc: "Defeat 4 monsters near the tower", target: 4, rewardExp: 70 },
      ],
    },
    priest: {
      name: "Elara",
      className: "Priest",
      title: "Hymn of the Last Sanctuary",
      intro:
        "Sister Elara tends the final sanctuary candle. Pilgrims whisper that healing light angers the dark. She walks out anyway—to bring hope back to the roads.",
      quests: [
        { title: "Purify the Path", desc: "Defeat 2 corrupted beasts", target: 2, rewardExp: 35 },
        { title: "Light the Shrine", desc: "Defeat 4 monsters by the old shrine", target: 4, rewardExp: 70 },
      ],
    },
    thief: {
      name: "Kade",
      className: "Thief",
      title: "Shadows of the Royal Vault",
      intro:
        "Rogue Kade stole the crown gem to save his sister—then the vault curse woke every guardian in the forest. Now he must fight his way out, unseen no longer.",
      quests: [
        { title: "Silent Steps", desc: "Defeat 2 guards without retreat", target: 2, rewardExp: 35 },
        { title: "Break the Curse", desc: "Defeat 4 monsters in the vault woods", target: 4, rewardExp: 70 },
      ],
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
