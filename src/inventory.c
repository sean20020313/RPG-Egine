#include "inventory.h"
#include <stdlib.h>
#include <string.h>

ItemNode *inv_find(ItemNode *head, const char *name) {
    for (ItemNode *p = head; p; p = p->next) {
        if (strcmp(p->name, name) == 0) return p;
    }
    return NULL;
}

void inv_add(Character *c, const char *name, int qty, int effect_hp) {
    if (!c || qty <= 0) return;
    ItemNode *ex = inv_find(c->inventory, name);
    if (ex) {
        ex->quantity += qty;
        if (effect_hp > 0) ex->effect_hp = effect_hp;
        return;
    }
    ItemNode *n = (ItemNode *)malloc(sizeof(ItemNode));
    if (!n) return;
    memset(n, 0, sizeof(*n));
    strncpy(n->name, name, RPG_NAME_MAX - 1);
    n->quantity = qty;
    n->effect_hp = effect_hp;
    n->next = c->inventory;
    c->inventory = n;
}

void inv_remove_node(Character *c, ItemNode *node) {
    if (!c || !node) return;
    ItemNode **pp = &c->inventory;
    while (*pp && *pp != node) pp = &(*pp)->next;
    if (*pp) {
        *pp = node->next;
        free(node);
    }
}

int inv_use_slot(Character *c, int slot_index, int *out_heal) {
    if (!c || slot_index < 0) return 0;
    ItemNode *p = c->inventory;
    for (int i = 0; p && i < slot_index; i++) p = p->next;
    if (!p || p->quantity <= 0) return 0;
    int heal = p->effect_hp > 0 ? p->effect_hp : 0;
    if (out_heal) *out_heal = heal;
    p->quantity--;
    if (p->quantity <= 0) inv_remove_node(c, p);
    return 1;
}

void inv_free_all(ItemNode *head) {
    while (head) {
        ItemNode *n = head->next;
        free(head);
        head = n;
    }
}

ItemNode *inv_clone_list(const ItemNode *src) {
    ItemNode *rev = NULL;
    const ItemNode *p = src;
    while (p) {
        ItemNode *n = (ItemNode *)malloc(sizeof(ItemNode));
        if (!n) {
            inv_free_all(rev);
            return NULL;
        }
        memcpy(n, p, sizeof(ItemNode));
        n->next = rev;
        rev = n;
        p = p->next;
    }
    ItemNode *head = NULL;
    while (rev) {
        ItemNode *n = rev;
        rev = rev->next;
        n->next = head;
        head = n;
    }
    return head;
}
