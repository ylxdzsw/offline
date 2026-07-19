NODE ?= node
CARGO ?= cargo
NATTOPPET := vendor/nattoppet/nattoppet.ts
DIST := dist
CATALOG := games/catalog.json
GAMES := $(shell $(NODE) -e "process.stdout.write(require('./$(CATALOG)').map(game => game.id).join(' '))")
PAGES := index $(GAMES)
APP_SOURCES := $(shell find app -type f -not -name '*.test.js')
GAME_WEB_SOURCES := $(shell find games -maxdepth 2 -type f \( -name '*.js' -o -name '*.html' -o -name '*.ymd' -o -name '*.json' \) -not -name '*.test.js')
RUST_SOURCES := $(shell find games -type f \( -name '*.rs' -o -name 'Cargo.toml' -o -name 'Cargo.lock' \) -not -path 'games/target/*')
PUBLIC_SOURCES := $(shell find public -type f)
WASM_TARGET := wasm32-unknown-unknown
WASM_DIR := games/target/$(WASM_TARGET)/release
WASM_FILES := $(GAMES:%=$(WASM_DIR)/offline_%.wasm)
WASM_RUSTFLAGS ?=

.PHONY: all deps wasm build serve check-rust test test-rust test-unit test-contract test-e2e clean

all: build

deps:
	git submodule update --init --recursive
	npm ci
	npm ci --prefix vendor/nattoppet

wasm: $(WASM_FILES)

$(WASM_FILES) &: $(RUST_SOURCES)
	RUSTFLAGS='$(WASM_RUSTFLAGS)' $(CARGO) build --manifest-path games/Cargo.toml --workspace --release --target $(WASM_TARGET)

build: wasm $(PAGES:%=$(DIST)/%.html) $(PUBLIC_SOURCES)
	mkdir -p $(DIST)
	cp -R public/. $(DIST)/
	$(NODE) scripts/build-sw.mjs $(DIST)

$(DIST)/index.html: app/index.ymd app/macros.ymd $(APP_SOURCES) $(CATALOG)
	mkdir -p $(DIST)
	$(NODE) $(NATTOPPET) $< > $@

$(DIST)/%.html: games/%/page.ymd app/macros.ymd $(APP_SOURCES) $(GAME_WEB_SOURCES) $(WASM_DIR)/offline_%.wasm
	mkdir -p $(DIST)
	$(NODE) $(NATTOPPET) $< > $@

serve: build
	$(NODE) scripts/serve.mjs $(DIST)

test-unit:
	$(NODE) --test app/*.test.js

test-contract: wasm
	$(NODE) --test games/*/*.test.js

test-rust:
	$(CARGO) test --manifest-path games/Cargo.toml --workspace

check-rust:
	$(CARGO) fmt --manifest-path games/Cargo.toml --all --check
	$(CARGO) clippy --manifest-path games/Cargo.toml --workspace --all-targets -- -D warnings
	RUSTFLAGS='$(WASM_RUSTFLAGS)' $(CARGO) clippy --manifest-path games/Cargo.toml --workspace --target $(WASM_TARGET) -- -D warnings

test-e2e: build
	npx playwright test

test: test-rust test-unit test-contract test-e2e

clean:
	$(CARGO) clean --manifest-path games/Cargo.toml
	rm -rf $(DIST) test-results playwright-report
