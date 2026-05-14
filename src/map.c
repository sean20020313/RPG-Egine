#include "map.h"
#include "battle.h"
#include "inventory.h"
#include <stdio.h>

int map_explore(GameState *g) {
    if (!g || g->in_battle) return 0;
    int roll = rpg_rand_range(g, 1, 100);
    g->map_x += rpg_rand_range(g, -1, 1);
    g->map_y += rpg_rand_range(g, -1, 1);
    if (roll <= 45) {
        battle_spawn_monster(g);
        return 1;
    }
    if (roll <= 65) {
        inv_add(&g->players[g->active_player], "藥草", 1, 12);
        snprintf(g->message, sizeof(g->message), "你在路上撿到藥草（小回復）。");
        return 1;
    }
    if (roll <= 80) {
        snprintf(g->message, sizeof(g->message), "四周很安靜，什麼也沒發生。");
        return 1;
    }
    snprintf(g->message, sizeof(g->message), "你感覺到遠方有任務的氣息…（繼續探索）。");
    return 1;
}
