#ifndef QUEST_QUEUE_H
#define QUEST_QUEUE_H

#include "rpg_types.h"

void quest_init(QuestQueue *q);
void quest_enqueue(QuestQueue *q, int id, const char *title, const char *desc, int kind,
                   int target, int progress, int reward_exp);
QuestNode *quest_dequeue(QuestQueue *q);
void quest_free(QuestQueue *q);
void quest_advance_kill(GameState *g, int amount);
void quest_try_complete_front(GameState *g);

#endif
