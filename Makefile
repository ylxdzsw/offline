NODE ?= node
NATTOPPET := vendor/nattoppet/nattoppet.ts
DIST := dist
PAGES := index xiangqi wuziqi
SOURCES := $(shell find src -type f)

.PHONY: all deps build serve test test-unit test-e2e clean

all: build

deps:
	git submodule update --init --recursive
	npm ci
	npm ci --prefix vendor/nattoppet

build: $(PAGES:%=$(DIST)/%.html) $(DIST)/manifest.webmanifest $(DIST)/CNAME $(DIST)/.nojekyll
	$(NODE) scripts/generate-icons.mjs $(DIST)
	$(NODE) scripts/generate-sw.mjs $(DIST)

$(DIST)/%.html: pages/%.ymd $(SOURCES)
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

test-unit:
	$(NODE) --test tests/unit/*.test.js

test-e2e: build
	npx playwright test

test: test-unit test-e2e

clean:
	rm -rf $(DIST) test-results playwright-report
