#ifndef RPG_TYPES_H
#define RPG_TYPES_H

#include <stddef.h>

#define RPG_NAME_MAX 48
#define RPG_DESC_MAX 96
#define RPG_MAX_PLAYERS 4
#define RPG_MAX_UNDO 16

typedef struct ItemNode {
    char name[RPG_NAME_MAX];
    int quantity;
    int effect_hp;
    struct ItemNode *next;
} ItemNode;

typedef struct Character {
    char name[RPG_NAME_MAX];
    int hp;
    int max_hp;
    int mp;
    int max_mp;
    int atk;
    int def;
    int level;
    int exp;
    ItemNode *inventory;
} Character;

typedef struct QuestNode {
    int id;
    char title[RPG_NAME_MAX];
    char desc[RPG_DESC_MAX];
    int kind;
    int target;
    int progress;
    int reward_exp;
    struct QuestNode *next;
} QuestNode;

typedef struct QuestQueue {
    QuestNode *front;
    QuestNode *rear;
} QuestQueue;

typedef struct BattleSnapshot {
    int player_hp;
    int player_mp;
    int monster_hp;
    int player_def_boost;
    int pending_monster_turn;
    struct BattleSnapshot *next;
} BattleSnapshot;

typedef struct UndoStack {
    BattleSnapshot *top;
    int depth;
} UndoStack;

typedef struct MonsterTemplate {
    const char *name;
    int hp;
    int atk;
    int def;
    int exp_reward;
} MonsterTemplate;

typedef struct GameState {
    Character players[RPG_MAX_PLAYERS];
    int player_count;
    int active_player;
    int map_x;
    int map_y;
    int in_battle;
    char monster_name[RPG_NAME_MAX];
    int monster_hp;
    int monster_max_hp;
    int monster_atk;
    int monster_def;
    int monster_exp;
    int player_def_boost_turns;
    QuestQueue quests;
    UndoStack undo;
    char message[256];
    unsigned int rng_seed;
} GameState;

#endif
