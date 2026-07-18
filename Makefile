NODE ?= node
CARGO ?= cargo
NATTOPPET := vendor/nattoppet/nattoppet.ts
DIST := dist
PAGES := index xiangqi wuziqi sudoku junqi chess reversi
GAMES := xiangqi wuziqi sudoku junqi chess reversi
SOURCES := $(shell find src -type f)
RUST_SOURCES := $(shell find engine -type f -not -path 'engine/target/*')
WASM_TARGET := wasm32-unknown-unknown
WASM_DIR := engine/target/$(WASM_TARGET)/release
WASM_FILES := $(GAMES:%=$(WASM_DIR)/offline_%.wasm)
WASM_RUSTFLAGS ?=

.PHONY: all deps wasm build serve check-rust test test-rust test-unit test-e2e clean

all: build

deps:
	git submodule update --init --recursive
	npm ci
	npm ci --prefix vendor/nattoppet

wasm: $(WASM_FILES)

$(WASM_FILES) &: $(RUST_SOURCES)
	RUSTFLAGS='$(WASM_RUSTFLAGS)' $(CARGO) build --manifest-path engine/Cargo.toml --workspace --release --target $(WASM_TARGET)

build: wasm $(PAGES:%=$(DIST)/%.html) $(DIST)/manifest.webmanifest $(DIST)/CNAME $(DIST)/.nojekyll
	$(NODE) scripts/generate-icons.mjs $(DIST)
	$(NODE) scripts/generate-sw.mjs $(DIST)

$(DIST)/index.html: pages/index.ymd pages/offline.ymd $(SOURCES)
	mkdir -p $(DIST)
	$(NODE) $(NATTOPPET) $< > $@

$(DIST)/%.html: pages/%.ymd pages/offline.ymd $(SOURCES) $(WASM_DIR)/offline_%.wasm
	mkdir -p $(DIST)
	$(NODE) $(NATTOPPET) $< > $@

$(DIST)/manifest.webmanifest: public/manifest.webmanifest
	mkdir -p $(DIST)
	cp $< $@

$(DIST)/CNAME: CNAME
	mkdir -p $(DIST)
	cp $< $@

$(DIST)/.nojekyll:
	mkdir -p $(DIST)
	touch $@

serve: build
	$(NODE) scripts/serve.mjs $(DIST)

test-unit: wasm
	$(NODE) --test tests/unit/*.test.js

test-rust:
	$(CARGO) test --manifest-path engine/Cargo.toml --workspace

check-rust:
	$(CARGO) fmt --manifest-path engine/Cargo.toml --all --check
	$(CARGO) clippy --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings
	RUSTFLAGS='$(WASM_RUSTFLAGS)' $(CARGO) clippy --manifest-path engine/Cargo.toml --workspace --target $(WASM_TARGET) -- -D warnings

test-e2e: build
	npx playwright test

test: test-rust test-unit test-e2e

clean:
	$(CARGO) clean --manifest-path engine/Cargo.toml
	rm -rf $(DIST) test-results playwright-report
