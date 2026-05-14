BUILD_DIR := build
ENGINE := $(BUILD_DIR)/rpg_engine
SRCS := src/inventory.c src/quest_queue.c src/battle.c src/map.c src/game.c src/main.c
OBJS := $(SRCS:%.c=$(BUILD_DIR)/%.o)

CFLAGS ?= -Wall -Wextra -O2 -std=c11
LDFLAGS ?=

.PHONY: all clean run

all: $(ENGINE)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)/src

$(BUILD_DIR)/src/%.o: src/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(ENGINE): $(OBJS)
	$(CC) $(OBJS) -o $@ $(LDFLAGS)

clean:
	rm -rf $(BUILD_DIR)

run: $(ENGINE)
	@echo "Built $(ENGINE)"
