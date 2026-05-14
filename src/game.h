#ifndef GAME_H
#define GAME_H

#include <stdio.h>
#include "rpg_types.h"

int game_new(GameState *g, int argc, char **argv);
int game_load(GameState *g, const char *path);
int game_save(const GameState *g, const char *path);
int game_command(GameState *g, const char *cmd, const char *arg);
void game_print_json(const GameState *g, FILE *out);

#endif
