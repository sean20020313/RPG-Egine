#ifndef BATTLE_H
#define BATTLE_H

#include "rpg_types.h"

void battle_clear_undo(GameState *g);
void battle_push_undo(GameState *g);
int battle_undo(GameState *g);
void battle_spawn_monster(GameState *g);
int battle_player_attack(GameState *g);
int battle_player_defend(GameState *g);
int battle_player_use_item(GameState *g, int slot);
int battle_player_flee(GameState *g);
unsigned int rpg_rand_u32(GameState *g);
int rpg_rand_range(GameState *g, int lo, int hi);

#endif
