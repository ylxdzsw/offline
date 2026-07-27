NODE ?= node
CARGO ?= cargo
NATTOPPET := node_modules/.bin/nattoppet
DIST := dist
GAMES := \
	xiangqi \
	wuziqi \
	sudoku \
	2048 \
	junqi \
	chess \
	reversi \
	checkers \
	backgammon \
	huarong \
	minesweeper \
	solitaire \
	spider
JS_GAMES := sudoku 2048 minesweeper solitaire spider
WASM_GAMES := $(filter-out $(JS_GAMES),$(GAMES))
PAGES := index $(GAMES)
APP_SOURCES := $(shell find app -type f -not -name '*.test.js' -not -path 'app/icons/*')
GAME_WEB_SOURCES := $(shell find games -maxdepth 2 -type f \( -name '*.js' -o -name '*.html' -o -name '*.ymd' \) -not -name '*.test.js')
APP_PUBLIC := manifest.webmanifest CNAME .nojekyll
APP_PUBLIC_OUTPUTS := $(APP_PUBLIC:%=$(DIST)/%)
ICON_SOURCES := $(shell find app/icons -type f)
ICON_OUTPUTS := $(ICON_SOURCES:app/%=$(DIST)/%)
SVG_GUIDES := $(wildcard games/*/guide.svg)
WEBP_GUIDES := $(wildcard games/*/guide.webp)
SVG_GUIDE_OUTPUTS := $(patsubst games/%/guide.svg,$(DIST)/guides/%.svg,$(SVG_GUIDES))
WEBP_GUIDE_OUTPUTS := $(patsubst games/%/guide.webp,$(DIST)/guides/%.webp,$(WEBP_GUIDES))
STATIC_OUTPUTS := $(APP_PUBLIC_OUTPUTS) $(ICON_OUTPUTS) $(SVG_GUIDE_OUTPUTS) $(WEBP_GUIDE_OUTPUTS)
WASM_TARGET := wasm32-unknown-unknown
CARGO_TARGET_DIR := $(abspath games/target)
WASM_DIR := games/target/$(WASM_TARGET)/release
WASM_FILES := $(WASM_GAMES:%=$(WASM_DIR)/offline_%.wasm)
WASM_RUSTFLAGS ?=
RUST_TEST_TARGETS := $(WASM_GAMES:%=test-rust-%)
RUST_CHECK_TARGETS := $(WASM_GAMES:%=check-rust-%)

.PHONY: all deps wasm build serve check-rust test test-rust test-unit test-contract test-e2e clean

all: build

deps:
	npm ci

wasm: $(WASM_FILES)

define GAME_WASM_RULE
GAME_$(1)_RUST := $$(wildcard games/$(1)/*.rs)
$(WASM_DIR)/offline_$(1).wasm: $$(GAME_$(1)_RUST) games/$(1)/Cargo.toml games/$(1)/Cargo.lock games/wasm_abi.rs
	CARGO_TARGET_DIR='$(CARGO_TARGET_DIR)' RUSTFLAGS='$(WASM_RUSTFLAGS)' $(CARGO) build --manifest-path games/$(1)/Cargo.toml --release --target $(WASM_TARGET)
endef
$(foreach game,$(WASM_GAMES),$(eval $(call GAME_WASM_RULE,$(game))))

define GAME_WASM_PAGE_DEPENDENCY
$(DIST)/$(1).html: $(WASM_DIR)/offline_$(1).wasm
endef
$(foreach game,$(WASM_GAMES),$(eval $(call GAME_WASM_PAGE_DEPENDENCY,$(game))))

build: wasm $(PAGES:%=$(DIST)/%.html) $(STATIC_OUTPUTS)
	$(NODE) scripts/build-sw.mjs $(DIST)

$(DIST)/index.html: app/index.ymd app/macros.ymd $(APP_SOURCES)
	mkdir -p $(DIST)
	$(NATTOPPET) $< > $@

$(DIST)/%.html: games/%/page.ymd app/macros.ymd $(APP_SOURCES) $(GAME_WEB_SOURCES)
	mkdir -p $(DIST)
	$(NATTOPPET) $< > $@

$(APP_PUBLIC_OUTPUTS): $(DIST)/%: app/%
	mkdir -p $(DIST)
	cp $< $@

$(ICON_OUTPUTS): $(DIST)/%: app/%
	mkdir -p $(dir $@)
	cp $< $@

$(DIST)/guides/%.svg: games/%/guide.svg
	mkdir -p $(dir $@)
	cp $< $@

$(DIST)/guides/%.webp: games/%/guide.webp
	mkdir -p $(dir $@)
	cp $< $@

serve: build
	$(NODE) scripts/serve.mjs $(DIST)

test-unit:
	$(NODE) --test app/*.test.js

test-contract: wasm
	$(NODE) --test games/*/*.test.js

test-rust: $(RUST_TEST_TARGETS)

test-rust-%:
	CARGO_TARGET_DIR='$(CARGO_TARGET_DIR)' $(CARGO) test --manifest-path games/$*/Cargo.toml

check-rust: $(RUST_CHECK_TARGETS)

check-rust-%:
	$(CARGO) fmt --manifest-path games/$*/Cargo.toml --check
	CARGO_TARGET_DIR='$(CARGO_TARGET_DIR)' $(CARGO) clippy --manifest-path games/$*/Cargo.toml --all-targets -- -D warnings
	CARGO_TARGET_DIR='$(CARGO_TARGET_DIR)' RUSTFLAGS='$(WASM_RUSTFLAGS)' $(CARGO) clippy --manifest-path games/$*/Cargo.toml --target $(WASM_TARGET) -- -D warnings

test-e2e: build
	npx playwright test

test: test-rust test-unit test-contract test-e2e

clean:
	CARGO_TARGET_DIR='$(CARGO_TARGET_DIR)' $(CARGO) clean --manifest-path games/$(firstword $(WASM_GAMES))/Cargo.toml
	rm -rf $(DIST) test-results playwright-report
