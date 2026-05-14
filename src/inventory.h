#ifndef INVENTORY_H
#define INVENTORY_H

#include "rpg_types.h"

ItemNode *inv_find(ItemNode *head, const char *name);
void inv_add(Character *c, const char *name, int qty, int effect_hp);
int inv_use_slot(Character *c, int slot_index, int *out_heal);
void inv_free_all(ItemNode *head);
ItemNode *inv_clone_list(const ItemNode *src);
void inv_remove_node(Character *c, ItemNode *node);

#endif
