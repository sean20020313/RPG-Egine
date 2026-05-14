#include "game.h"
#include "quest_queue.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void print_err(const char *msg) {
    printf("{\"ok\":false,\"message\":\"");
    if (msg) {
        for (const unsigned char *p = (const unsigned char *)msg; *p; p++) {
            if (*p == '"' || *p == '\\') putchar('\\');
            putchar((int)*p);
        }
    }
    printf("\"}\n");
}

int main(int argc, char **argv) {
    if (argc < 3) {
        fprintf(stderr,
                "usage: %s <statefile> new [name...]\n"
                "       %s <statefile> <cmd> [arg]\n"
                "cmds: explore | attack | defend | flee | undo | use <slot> | switch <idx> | status\n",
                argv[0], argv[0]);
        return 1;
    }
    const char *path = argv[1];
    const char *cmd = argv[2];
    GameState g;
    memset(&g, 0, sizeof(g));
    quest_init(&g.quests);

    if (strcmp(cmd, "new") == 0) {
        game_new(&g, argc - 3, argv + 3);
        if (!game_save(&g, path)) {
            print_err("無法寫入存檔。");
            return 1;
        }
        game_print_json(&g, stdout);
        return 0;
    }
    if (!game_load(&g, path)) {
        print_err("無法讀取存檔或格式錯誤。");
        return 1;
    }
    if (strcmp(cmd, "status") == 0) {
        game_print_json(&g, stdout);
        return 0;
    }
    const char *arg = (argc >= 4) ? argv[3] : NULL;
    game_command(&g, cmd, arg);
    if (!game_save(&g, path)) {
        print_err("無法寫入存檔。");
        return 1;
    }
    game_print_json(&g, stdout);
    return 0;
}
