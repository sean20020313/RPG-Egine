#include "battle.h"
#include "inventory.h"
#include "quest_queue.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const MonsterTemplate k_templates[] = {
    {"史萊姆", 22, 5, 1, 12},
    {"哥布林", 30, 8, 2, 20},
    {"狼", 40, 11, 3, 35},
    {"石像鬼", 55, 14, 5, 55},
};

unsigned int rpg_rand_u32(GameState *g) {
    if (!g) return 0;
    g->rng_seed = g->rng_seed * 1103515245u + 12345u;
    return g->rng_seed;
}

int rpg_rand_range(GameState *g, int lo, int hi) {
    if (hi <= lo) return lo;
    unsigned int r = rpg_rand_u32(g);
    return lo + (int)(r % (unsigned int)(hi - lo + 1));
}

void battle_clear_undo(GameState *g) {
    while (g->undo.top) {
        BattleSnapshot *s = g->undo.top;
        g->undo.top = s->next;
        free(s);
    }
    g->undo.depth = 0;
}

void battle_push_undo(GameState *g) {
    if (!g->in_battle || g->player_count <= 0) return;
    if (g->undo.depth >= RPG_MAX_UNDO) return;
    Character *p = &g->players[g->active_player];
    BattleSnapshot *s = (BattleSnapshot *)malloc(sizeof(BattleSnapshot));
    if (!s) return;
    s->player_hp = p->hp;
    s->player_mp = p->mp;
    s->monster_hp = g->monster_hp;
    s->player_def_boost = g->player_def_boost_turns;
    s->pending_monster_turn = 0;
    s->next = g->undo.top;
    g->undo.top = s;
    g->undo.depth++;
}

int battle_undo(GameState *g) {
    if (!g->in_battle || !g->undo.top) return 0;
    BattleSnapshot *s = g->undo.top;
    g->undo.top = s->next;
    Character *p = &g->players[g->active_player];
    p->hp = s->player_hp;
    p->mp = s->player_mp;
    g->monster_hp = s->monster_hp;
    g->player_def_boost_turns = s->player_def_boost;
    free(s);
    g->undo.depth--;
    snprintf(g->message, sizeof(g->message), "已回溯上一回合行動。");
    return 1;
}

void battle_spawn_monster(GameState *g) {
    size_t n = sizeof(k_templates) / sizeof(k_templates[0]);
    int idx = rpg_rand_range(g, 0, (int)n - 1);
    const MonsterTemplate *t = &k_templates[(size_t)idx];
    strncpy(g->monster_name, t->name, RPG_NAME_MAX - 1);
    g->monster_max_hp = t->hp + rpg_rand_range(g, -3, 4);
    if (g->monster_max_hp < 8) g->monster_max_hp = 8;
    g->monster_hp = g->monster_max_hp;
    g->monster_atk = t->atk;
    g->monster_def = t->def;
    g->monster_exp = t->exp_reward;
    g->in_battle = 1;
    g->player_def_boost_turns = 0;
    battle_clear_undo(g);
    snprintf(g->message, sizeof(g->message), "遭遇 %s！", g->monster_name);
}

static int phys_damage(GameState *g, int atk, int def) {
    int base = atk - def;
    if (base < 1) base = 1;
    int roll = rpg_rand_range(g, 0, 4);
    return base + roll;
}

static void monster_attack_player(GameState *g) {
    Character *p = &g->players[g->active_player];
    int def = p->def;
    if (g->player_def_boost_turns > 0) {
        def += 4;
        g->player_def_boost_turns--;
    }
    int dmg = phys_damage(g, g->monster_atk, def);
    p->hp -= dmg;
    if (p->hp < 0) p->hp = 0;
    char extra[128];
    snprintf(extra, sizeof(extra), " %s 反擊造成 %d 傷害。", g->monster_name, dmg);
    strncat(g->message, extra, sizeof(g->message) - strlen(g->message) - 1);
}

int battle_player_attack(GameState *g) {
    if (!g->in_battle) return 0;
    battle_push_undo(g);
    Character *p = &g->players[g->active_player];
    int dmg = phys_damage(g, p->atk, g->monster_def);
    g->monster_hp -= dmg;
    if (g->monster_hp < 0) g->monster_hp = 0;
    snprintf(g->message, sizeof(g->message), "你攻擊造成 %d 傷害。", dmg);
    if (g->monster_hp <= 0) {
        strncat(g->message, " 擊敗魔物！", sizeof(g->message) - strlen(g->message) - 1);
        quest_advance_kill(g, 1);
        quest_try_complete_front(g);
        p->exp += g->monster_exp;
        while (p->exp >= 100) {
            p->exp -= 100;
            p->level++;
            p->max_hp += 5;
            p->hp = p->max_hp;
            p->max_mp += 3;
            p->mp = p->max_mp;
            p->atk += 2;
            p->def += 1;
            strncat(g->message, " 升級！", sizeof(g->message) - strlen(g->message) - 1);
        }
        g->in_battle = 0;
        battle_clear_undo(g);
        return 1;
    }
    monster_attack_player(g);
    if (p->hp <= 0) {
        strncat(g->message, " 你戰敗…", sizeof(g->message) - strlen(g->message) - 1);
        g->in_battle = 0;
        battle_clear_undo(g);
        p->hp = 1;
    }
    return 1;
}

int battle_player_defend(GameState *g) {
    if (!g->in_battle) return 0;
    battle_push_undo(g);
    g->player_def_boost_turns = 2;
    snprintf(g->message, sizeof(g->message), "你舉盾防禦，暫時提升防禦。");
    monster_attack_player(g);
    Character *p = &g->players[g->active_player];
    if (p->hp <= 0) {
        p->hp = 1;
        g->in_battle = 0;
        battle_clear_undo(g);
        strncat(g->message, " 仍受重擊…脫離戰鬥。", sizeof(g->message) - strlen(g->message) - 1);
    }
    return 1;
}

int battle_player_use_item(GameState *g, int slot) {
    if (!g->in_battle) return 0;
    Character *p = &g->players[g->active_player];
    int heal = 0;
    battle_push_undo(g);
    if (!inv_use_slot(p, slot, &heal) || heal <= 0) {
        battle_undo(g);
        snprintf(g->message, sizeof(g->message), "此欄位沒有可回復的道具。");
        return 0;
    }
    p->hp += heal;
    if (p->hp > p->max_hp) p->hp = p->max_hp;
    snprintf(g->message, sizeof(g->message), "使用道具回復 %d HP。", heal);
    monster_attack_player(g);
    if (p->hp <= 0) {
        p->hp = 1;
        g->in_battle = 0;
        battle_clear_undo(g);
        strncat(g->message, " 仍被擊倒…", sizeof(g->message) - strlen(g->message) - 1);
    }
    return 1;
}

int battle_player_flee(GameState *g) {
    if (!g->in_battle) return 0;
    int chance = 55 + g->players[g->active_player].level * 3;
    if (chance > 90) chance = 90;
    int r = rpg_rand_range(g, 1, 100);
    if (r <= chance) {
        snprintf(g->message, sizeof(g->message), "成功逃離戰鬥。");
        g->in_battle = 0;
        battle_clear_undo(g);
        return 1;
    }
    snprintf(g->message, sizeof(g->message), "逃跑失敗！");
    monster_attack_player(g);
    Character *p = &g->players[g->active_player];
    if (p->hp <= 0) {
        p->hp = 1;
        g->in_battle = 0;
        battle_clear_undo(g);
    }
    return 1;
}
