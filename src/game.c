#include "game.h"
#include "battle.h"
#include "inventory.h"
#include "map.h"
#include "quest_queue.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static void clear_state(GameState *g) {
    for (int i = 0; i < RPG_MAX_PLAYERS; i++) {
        inv_free_all(g->players[i].inventory);
        memset(&g->players[i], 0, sizeof(g->players[i]));
    }
    quest_free(&g->quests);
    battle_clear_undo(g);
    memset(g, 0, sizeof(*g));
    quest_init(&g->quests);
}

static void emit_json_str(FILE *out, const char *s) {
    fputc('"', out);
    if (!s) s = "";
    for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        if (*p == '"' || *p == '\\') {
            fputc('\\', out);
            fputc(*p, out);
        } else if (*p < 32) {
            fprintf(out, "\\u%04x", *p);
        } else {
            fputc((int)*p, out);
        }
    }
    fputc('"', out);
}

static void write_inv_line(FILE *fp, int idx, const Character *c) {
    fprintf(fp, "INV%d ", idx);
    for (ItemNode *n = c->inventory; n; n = n->next) {
        fprintf(fp, "%s,%d,%d%s", n->name, n->quantity, n->effect_hp, n->next ? ";" : "");
    }
    fputc('\n', fp);
}

static int read_inv_line(const char *line, Character *c) {
    const char *p = strchr(line, ' ');
    if (!p) return 0;
    p++;
    inv_free_all(c->inventory);
    c->inventory = NULL;
    char buf[512];
    strncpy(buf, p, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = '\0';
    char *save = NULL;
    for (char *tok = strtok_r(buf, ";", &save); tok; tok = strtok_r(NULL, ";", &save)) {
        char name[RPG_NAME_MAX];
        int qty, heal;
        if (sscanf(tok, "%47[^,],%d,%d", name, &qty, &heal) == 3) inv_add(c, name, qty, heal);
    }
    return 1;
}

static void write_undo_stack(FILE *fp, const GameState *g) {
    int n = 0;
    for (BattleSnapshot *s = g->undo.top; s; s = s->next) n++;
    BattleSnapshot **arr = (BattleSnapshot **)calloc((size_t)n, sizeof(BattleSnapshot *));
    if (!arr) return;
    int i = 0;
    for (BattleSnapshot *s = g->undo.top; s; s = s->next) arr[i++] = s;
    fprintf(fp, "UNDODEPTH %d\n", n);
    for (int j = n - 1; j >= 0; j--) {
        BattleSnapshot *s = arr[j];
        fprintf(fp, "U %d %d %d %d\n", s->player_hp, s->player_mp, s->monster_hp, s->player_def_boost);
    }
    free(arr);
}

int game_save(const GameState *g, const char *path) {
    FILE *fp = fopen(path, "w");
    if (!fp) return 0;
    fprintf(fp, "RPGSTATE2\n");
    fprintf(fp, "SEED %u\n", g->rng_seed);
    fprintf(fp, "PCNT %d\n", g->player_count);
    fprintf(fp, "ACTIVE %d\n", g->active_player);
    fprintf(fp, "MAP %d %d\n", g->map_x, g->map_y);
    fprintf(fp, "BATTLE %d\n", g->in_battle ? 1 : 0);
    fprintf(fp, "MNAME %s\n", g->monster_name);
    fprintf(fp, "MHP %d\n", g->monster_hp);
    fprintf(fp, "MMAX %d\n", g->monster_max_hp);
    fprintf(fp, "MATK %d\n", g->monster_atk);
    fprintf(fp, "MDEF %d\n", g->monster_def);
    fprintf(fp, "MEXP %d\n", g->monster_exp);
    fprintf(fp, "PDBOOST %d\n", g->player_def_boost_turns);
    for (int i = 0; i < g->player_count; i++) {
        const Character *c = &g->players[i];
        fprintf(fp, "P%dNAME %s\n", i, c->name);
        fprintf(fp, "P%dHP %d\n", i, c->hp);
        fprintf(fp, "P%dMAXHP %d\n", i, c->max_hp);
        fprintf(fp, "P%dMP %d\n", i, c->mp);
        fprintf(fp, "P%dMAXMP %d\n", i, c->max_mp);
        fprintf(fp, "P%dATK %d\n", i, c->atk);
        fprintf(fp, "P%dDEF %d\n", i, c->def);
        fprintf(fp, "P%dLVL %d\n", i, c->level);
        fprintf(fp, "P%dEXP %d\n", i, c->exp);
        write_inv_line(fp, i, c);
    }
    for (QuestNode *q = g->quests.front; q; q = q->next) {
        fprintf(fp, "QUEST %d|", q->id);
        fputs(q->title, fp);
        fputc('|', fp);
        fputs(q->desc, fp);
        fprintf(fp, "|%d|%d|%d|%d\n", q->kind, q->target, q->progress, q->reward_exp);
    }
    if (g->in_battle) write_undo_stack(fp, g);
    fclose(fp);
    return 1;
}

static int read_quest_line(GameState *g, const char *line) {
    if (strncmp(line, "QUEST ", 6) != 0) return 0;
    const char *p = line + 6;
    int id, kind, target, prog, rew;
    char title[RPG_NAME_MAX], desc[RPG_DESC_MAX];
    if (sscanf(p, "%d|%47[^|]|%95[^|]|%d|%d|%d|%d", &id, title, desc, &kind, &target, &prog, &rew) != 7)
        return 0;
    quest_enqueue(&g->quests, id, title, desc, kind, target, prog, rew);
    return 1;
}

typedef struct {
    int php, pmp, mhp, boost;
} UndoSnap;

int game_load(GameState *g, const char *path) {
    clear_state(g);
    FILE *fp = fopen(path, "r");
    if (!fp) return 0;
    char line[640];
    if (!fgets(line, sizeof(line), fp) || strcmp(line, "RPGSTATE2\n") != 0) {
        fclose(fp);
        return 0;
    }
    g->player_count = 1;
    g->active_player = 0;
    g->rng_seed = 1u;
    UndoSnap *snaps = NULL;
    size_t snap_n = 0, snap_cap = 0;
    while (fgets(line, sizeof(line), fp)) {
        if (strncmp(line, "SEED ", 5) == 0) sscanf(line + 5, "%u", &g->rng_seed);
        else if (strncmp(line, "PCNT ", 5) == 0)
            sscanf(line + 5, "%d", &g->player_count);
        else if (strncmp(line, "ACTIVE ", 7) == 0)
            sscanf(line + 7, "%d", &g->active_player);
        else if (strncmp(line, "MAP ", 4) == 0)
            sscanf(line + 4, "%d %d", &g->map_x, &g->map_y);
        else if (strncmp(line, "BATTLE ", 7) == 0) {
            int b = 0;
            sscanf(line + 7, "%d", &b);
            g->in_battle = b;
        } else if (strncmp(line, "MNAME ", 6) == 0) {
            sscanf(line + 6, "%47[^\n]", g->monster_name);
        } else if (strncmp(line, "MHP ", 4) == 0)
            sscanf(line + 4, "%d", &g->monster_hp);
        else if (strncmp(line, "MMAX ", 5) == 0)
            sscanf(line + 5, "%d", &g->monster_max_hp);
        else if (strncmp(line, "MATK ", 5) == 0)
            sscanf(line + 5, "%d", &g->monster_atk);
        else if (strncmp(line, "MDEF ", 5) == 0)
            sscanf(line + 5, "%d", &g->monster_def);
        else if (strncmp(line, "MEXP ", 5) == 0)
            sscanf(line + 5, "%d", &g->monster_exp);
        else if (strncmp(line, "PDBOOST ", 8) == 0)
            sscanf(line + 8, "%d", &g->player_def_boost_turns);
        else if (strncmp(line, "UNDODEPTH ", 10) == 0) {
            /* depth implied by U lines; kept for readability */
        } else if (strncmp(line, "INV", 3) == 0 && isdigit((unsigned char)line[3])) {
            int idx = line[3] - '0';
            if (idx >= 0 && idx < RPG_MAX_PLAYERS) read_inv_line(line, &g->players[idx]);
        } else if (strncmp(line, "QUEST ", 6) == 0)
            read_quest_line(g, line);
        else if (line[0] == 'U' && line[1] == ' ') {
            UndoSnap s;
            if (sscanf(line + 2, "%d %d %d %d", &s.php, &s.pmp, &s.mhp, &s.boost) == 4) {
                if (snap_n >= snap_cap) {
                    size_t ncap = snap_cap ? snap_cap * 2 : 8;
                    UndoSnap *nr = (UndoSnap *)realloc(snaps, ncap * sizeof(UndoSnap));
                    if (!nr) continue;
                    snaps = nr;
                    snap_cap = ncap;
                }
                snaps[snap_n++] = s;
            }
        } else if (line[0] == 'P' && isdigit((unsigned char)line[1])) {
            int idx = line[1] - '0';
            if (idx < 0 || idx >= RPG_MAX_PLAYERS) continue;
            Character *pc = &g->players[idx];
            if (strncmp(line + 2, "NAME ", 5) == 0)
                sscanf(line + 7, "%47[^\n]", pc->name);
            else if (strncmp(line + 2, "MAXHP ", 6) == 0)
                sscanf(line + 8, "%d", &pc->max_hp);
            else if (strncmp(line + 2, "MAXMP ", 6) == 0)
                sscanf(line + 8, "%d", &pc->max_mp);
            else if (strncmp(line + 2, "HP ", 3) == 0)
                sscanf(line + 5, "%d", &pc->hp);
            else if (strncmp(line + 2, "MP ", 3) == 0)
                sscanf(line + 5, "%d", &pc->mp);
            else if (strncmp(line + 2, "ATK ", 4) == 0)
                sscanf(line + 6, "%d", &pc->atk);
            else if (strncmp(line + 2, "DEF ", 4) == 0)
                sscanf(line + 6, "%d", &pc->def);
            else if (strncmp(line + 2, "LVL ", 4) == 0)
                sscanf(line + 6, "%d", &pc->level);
            else if (strncmp(line + 2, "EXP ", 4) == 0)
                sscanf(line + 6, "%d", &pc->exp);
        }
    }
    fclose(fp);
    g->undo.top = NULL;
    g->undo.depth = 0;
    for (size_t i = 0; i < snap_n; i++) {
        BattleSnapshot *s = (BattleSnapshot *)malloc(sizeof(BattleSnapshot));
        if (!s) break;
        s->player_hp = snaps[i].php;
        s->player_mp = snaps[i].pmp;
        s->monster_hp = snaps[i].mhp;
        s->player_def_boost = snaps[i].boost;
        s->pending_monster_turn = 0;
        s->next = g->undo.top;
        g->undo.top = s;
        g->undo.depth++;
    }
    free(snaps);
    if (g->player_count < 1) g->player_count = 1;
    if (g->player_count > RPG_MAX_PLAYERS) g->player_count = RPG_MAX_PLAYERS;
    if (g->active_player < 0 || g->active_player >= g->player_count) g->active_player = 0;
    if (g->rng_seed == 0) g->rng_seed = 1u;
    return 1;
}

static void bootstrap_quests(GameState *g) {
    quest_enqueue(&g->quests, 1, "初討伐", "擊敗 2 隻魔物", 0, 2, 0, 30);
    quest_enqueue(&g->quests, 2, "深入荒野", "擊敗 4 隻魔物", 0, 4, 0, 60);
}

int game_new(GameState *g, int argc, char **argv) {
    clear_state(g);
    g->rng_seed = (unsigned int)time(NULL);
    if (g->rng_seed == 0) g->rng_seed = 1u;
    int cnt = 0;
    for (int i = 0; i < argc && cnt < RPG_MAX_PLAYERS; i++) {
        Character *c = &g->players[cnt];
        strncpy(c->name, argv[i], RPG_NAME_MAX - 1);
        c->max_hp = 100;
        c->hp = 100;
        c->max_mp = 40;
        c->mp = 40;
        c->atk = 12;
        c->def = 4;
        c->level = 1;
        c->exp = 0;
        inv_add(c, "藥草", 2, 12);
        inv_add(c, "強效藥水", 1, 35);
        cnt++;
    }
    if (cnt == 0) {
        strncpy(g->players[0].name, "勇者", RPG_NAME_MAX - 1);
        g->players[0].max_hp = 100;
        g->players[0].hp = 100;
        g->players[0].max_mp = 40;
        g->players[0].mp = 40;
        g->players[0].atk = 12;
        g->players[0].def = 4;
        g->players[0].level = 1;
        g->players[0].exp = 0;
        inv_add(&g->players[0], "藥草", 2, 12);
        inv_add(&g->players[0], "強效藥水", 1, 35);
        cnt = 1;
    }
    g->player_count = cnt;
    g->active_player = 0;
    g->map_x = g->map_y = 0;
    g->in_battle = 0;
    bootstrap_quests(g);
    snprintf(g->message, sizeof(g->message), "新冒險開始！已建立 %d 名角色。", cnt);
    return 1;
}

int game_command(GameState *g, const char *cmd, const char *arg) {
    if (!cmd) return 0;
    if (strcmp(cmd, "explore") == 0) {
        if (g->in_battle) {
            snprintf(g->message, sizeof(g->message), "戰鬥中無法探索。");
            return 0;
        }
        return map_explore(g);
    }
    if (strcmp(cmd, "attack") == 0) return battle_player_attack(g);
    if (strcmp(cmd, "defend") == 0) return battle_player_defend(g);
    if (strcmp(cmd, "flee") == 0) return battle_player_flee(g);
    if (strcmp(cmd, "undo") == 0) return battle_undo(g);
    if (strcmp(cmd, "use") == 0) {
        int slot = arg ? atoi(arg) : -1;
        return battle_player_use_item(g, slot);
    }
    if (strcmp(cmd, "switch") == 0) {
        int idx = arg ? atoi(arg) : -1;
        if (idx < 0 || idx >= g->player_count) {
            snprintf(g->message, sizeof(g->message), "無效的角色索引。");
            return 0;
        }
        if (g->in_battle) {
            snprintf(g->message, sizeof(g->message), "戰鬥中不能切換角色。");
            return 0;
        }
        g->active_player = idx;
        snprintf(g->message, sizeof(g->message), "切換操作角色：%s", g->players[idx].name);
        return 1;
    }
    snprintf(g->message, sizeof(g->message), "未知指令。");
    return 0;
}

static void emit_inventory_json(FILE *out, const ItemNode *head) {
    fputc('[', out);
    int first = 1;
    int slot = 0;
    for (const ItemNode *n = head; n; n = n->next, slot++) {
        if (!first) fputc(',', out);
        first = 0;
        fprintf(out, "{\"slot\":%d,\"name\":", slot);
        emit_json_str(out, n->name);
        fprintf(out, ",\"quantity\":%d,\"heal\":%d}", n->quantity, n->effect_hp);
    }
    fputc(']', out);
}

static void emit_quests_json(FILE *out, const QuestQueue *q) {
    fputc('[', out);
    int first = 1;
    for (const QuestNode *n = q->front; n; n = n->next) {
        if (!first) fputc(',', out);
        first = 0;
        fprintf(out, "{\"id\":%d,\"title\":", n->id);
        emit_json_str(out, n->title);
        fprintf(out, ",\"desc\":");
        emit_json_str(out, n->desc);
        fprintf(out, ",\"progress\":%d,\"target\":%d,\"done\":%s}", n->progress, n->target,
                (n->progress >= n->target) ? "true" : "false");
    }
    fputc(']', out);
}

void game_print_json(const GameState *g, FILE *out) {
    fprintf(out, "{\"ok\":true,\"message\":");
    emit_json_str(out, g->message[0] ? g->message : "");
    fprintf(out, ",\"phase\":\"%s\"", g->in_battle ? "battle" : "explore");
    fprintf(out, ",\"map\":{\"x\":%d,\"y\":%d}", g->map_x, g->map_y);
    fprintf(out, ",\"active_player\":%d", g->active_player);
    fprintf(out, ",\"players\":[");
    for (int i = 0; i < g->player_count; i++) {
        const Character *c = &g->players[i];
        if (i) fputc(',', out);
        fprintf(out, "{\"index\":%d,\"name\":", i);
        emit_json_str(out, c->name);
        fprintf(out, ",\"hp\":%d,\"max_hp\":%d,\"mp\":%d,\"max_mp\":%d,\"atk\":%d,\"def\":%d,\"level\":%d,\"exp\":%d,\"inventory\":",
                c->hp, c->max_hp, c->mp, c->max_mp, c->atk, c->def, c->level, c->exp);
        emit_inventory_json(out, c->inventory);
        fputc('}', out);
    }
    fprintf(out, "],\"quests\":");
    emit_quests_json(out, &g->quests);
    if (g->in_battle) {
        fprintf(out, ",\"battle\":{\"name\":");
        emit_json_str(out, g->monster_name);
        fprintf(out, ",\"hp\":%d,\"max_hp\":%d,\"atk\":%d,\"def\":%d,\"can_undo\":%s}", g->monster_hp,
                g->monster_max_hp, g->monster_atk, g->monster_def, g->undo.top ? "true" : "false");
    } else {
        fprintf(out, ",\"battle\":null");
    }
    fprintf(out, "}\n");
}
