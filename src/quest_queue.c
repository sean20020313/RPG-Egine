#include "quest_queue.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void quest_init(QuestQueue *q) {
    q->front = q->rear = NULL;
}

static QuestNode *make_node(int id, const char *title, const char *desc, int kind, int target,
                            int progress, int reward_exp) {
    QuestNode *n = (QuestNode *)calloc(1, sizeof(QuestNode));
    if (!n) return NULL;
    n->id = id;
    n->kind = kind;
    n->target = target;
    n->progress = progress;
    n->reward_exp = reward_exp;
    if (title) strncpy(n->title, title, RPG_NAME_MAX - 1);
    if (desc) strncpy(n->desc, desc, RPG_DESC_MAX - 1);
    return n;
}

void quest_enqueue(QuestQueue *q, int id, const char *title, const char *desc, int kind,
                   int target, int progress, int reward_exp) {
    QuestNode *n = make_node(id, title, desc, kind, target, progress, reward_exp);
    if (!n) return;
    n->next = NULL;
    if (!q->rear) {
        q->front = q->rear = n;
    } else {
        q->rear->next = n;
        q->rear = n;
    }
}

QuestNode *quest_dequeue(QuestQueue *q) {
    if (!q || !q->front) return NULL;
    QuestNode *n = q->front;
    q->front = n->next;
    if (!q->front) q->rear = NULL;
    n->next = NULL;
    return n;
}

void quest_free(QuestQueue *q) {
    while (q->front) {
        QuestNode *n = quest_dequeue(q);
        free(n);
    }
}

void quest_advance_kill(GameState *g, int amount) {
    if (!g || amount <= 0) return;
    for (QuestNode *n = g->quests.front; n; n = n->next) {
        if (n->kind == 0) {
            n->progress += amount;
            if (n->progress > n->target) n->progress = n->target;
        }
    }
}

static void grant_exp(GameState *g, int exp) {
    if (g->player_count <= 0) return;
    Character *p = &g->players[g->active_player];
    p->exp += exp;
    while (p->exp >= 100) {
        p->exp -= 100;
        p->level++;
        p->max_hp += 5;
        p->hp = p->max_hp;
        p->max_mp += 3;
        p->mp = p->max_mp;
        p->atk += 2;
        p->def += 1;
        snprintf(g->message, sizeof(g->message), "升級到 Lv%d！", p->level);
    }
}

void quest_try_complete_front(GameState *g) {
    QuestNode *f = g->quests.front;
    if (!f) return;
    if (f->progress >= f->target) {
        char title[RPG_NAME_MAX];
        strncpy(title, f->title, sizeof(title) - 1);
        int rx = f->reward_exp;
        free(quest_dequeue(&g->quests));
        grant_exp(g, rx);
        if (g->message[0] == '\0')
            snprintf(g->message, sizeof(g->message), "完成任務：%s (+%d EXP)", title, rx);
        else {
            char tmp[256];
            snprintf(tmp, sizeof(tmp), "完成任務：%s (+%d EXP)。%s", title, rx, g->message);
            strncpy(g->message, tmp, sizeof(g->message) - 1);
        }
    }
}
