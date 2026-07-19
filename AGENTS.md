# Offline Classical Games Development Notes

This repository is a static, bilingual offline PWA. There is no gameplay
server. Every page is assembled by Nattoppet and contains its own HTML, CSS,
JavaScript, and compressed game Wasm module.

## File structure

```text
app/
  index.ymd       Gallery page composition
  macros.ymd      Project Nattoppet macros
  shell.html      Reusable offline-shell component
  gallery.html    Plain gallery HTML/CSS/JS bundle
  styles.less     Global page styles
  i18n.js         Shared translations and game guides
  runtime.js      Worker, seed, and service-worker helpers
  storage.js      Local progress persistence
  wasm.js         Browser and worker Wasm loader/dispatcher
  runtime.test.js Runtime unit tests

games/
  Cargo.toml      Rust workspace manifest
  Cargo.lock
  catalog.json    Canonical game order and runtime metadata
  wasm_abi.rs     One source-included JSON ABI implementation
  <game>/
    Cargo.toml
    page.ymd      Nattoppet page entry point
    <game>.html   Game HTML/CSS/JS component bundle
    api.js        Browser and Node adapter for the game's Wasm API
    worker.js     AI worker bundle, when the game has an AI worker
    contract.test.js
    src/
      lib.rs       JSON dispatch and Wasm exports
      game.rs      Rules and position representation
      ai.rs        Search/policy code for chess, junqi, and xiangqi
      search.rs    Search code for reversi and wuziqi

public/
  manifest.webmanifest
  CNAME
  .nojekyll
  icons/          Committed static PWA icons

scripts/
  build-sw.mjs    Builds the hashed service worker from dist/
  sw.template.js  Service-worker source template
  serve.mjs       Local static development server

tests/e2e/        Browser and offline workflow tests
vendor/nattoppet/ Pinned Nattoppet submodule
```

`dist/`, `games/target/`, `node_modules/`, Playwright reports, and test
artifacts are generated. Do not edit or commit them. A leftover
`engine/target/` from the pre-refactor layout is also ignored locally; new
builds never write there.

## Ownership rules

- `app/` owns behavior shared by multiple pages.
- `games/<id>/` owns everything specific to one game.
- `games/catalog.json` is the source of truth for game order, IDs, element
  names, and whether a worker is needed. Gallery, navigation, Make, and E2E
  page lists consume it.
- Keep the gallery as a plain HTML bundle. Use a custom element when a bundle
  owns reusable behavior or needs a Shadow DOM boundary, such as
  `offline-shell` and the game boards. Do not wrap every fragment in a custom
  element.
- Keep shared files directly in `app/` and game files directly in their game
  directory. Do not add a directory that contains only one component file.
- `public/` contains files copied to `dist/` without transformation.
- `scripts/` contains build or development utilities only. The service-worker
  template is a build input, not a public asset.

## Build and test

Requirements are Node.js 22.18 or newer, GNU Make, stable Rust, and the
`wasm32-unknown-unknown` Rust target.

```sh
rustup target add wasm32-unknown-unknown
make deps
make build
make serve
```

The normal verification ladder is:

```sh
make check-rust
make test-rust
make test-unit
make test-contract
make test-e2e
```

`make test` runs the Rust, unit, contract, and browser tests. Run
`make check-rust` separately for formatting and Clippy gates. If Playwright has
no bundled browser, use the installed system browser:

```sh
CHROME_PATH=/usr/bin/chromium make test-e2e
```

## Nattoppet rules

- Run Nattoppet from the repository root through `make`; page paths are
  resolved relative to the page file.
- Project macros are loaded with `[mixin] ../../app/macros.ymd`. Bare mixins
  such as `common.ymd` come from the Nattoppet submodule.
- Game pages use `../../app/...` for shared files, `./...` for their own
  bundle, and `../target/...` for their Wasm artifact.
- Keep raw HTML, macro calls, and definition lines at column zero when the
  Nattoppet parser requires them. Avoid introducing HTML syntax that the
  parser interprets as Markdown prose.
- The build inlines all required assets. Do not add CDN URLs, module imports,
  or runtime asset fetches that would break offline use.

## Rust and Wasm

Each game is a separate `cdylib` in the `games/` Cargo workspace. Its `src/lib.rs`
includes the shared ABI source with:

```rust
mod wasm_abi {
    include!("../../wasm_abi.rs");
}
```

The ABI is synchronous and JSON-based. Keep the exported functions and ABI
version compatible with `app/wasm.js`. Game crates own their request parsing
and domain representation. `game.rs` owns rules and state; `ai.rs` or
`search.rs` owns a genuinely separate search policy when the game needs one.
Sudoku has no search module. Do not create empty symmetry files.

The browser adapter must continue to work in both the browser and Node test
process. It loads `../target/wasm32-unknown-unknown/release/` in Node and the
embedded module in a built page.

## Adding or changing a game

1. Add the game ID and metadata to `games/catalog.json`.
2. Add the ID to the workspace members in `games/Cargo.toml` and create its
   `games/<id>/Cargo.toml` and `src/` crate.
3. Add `page.ymd`, `<id>.html`, `api.js`, and `contract.test.js`; add `worker.js`
   only when the game uses an AI worker.
4. Keep page references relative to the new game directory and include the
   catalog macro before the shell element.
5. Run the Rust, contract, build, and browser tests before changing generated
   output.

Saved progress uses the `offline-games:v1:<game>` local-storage namespace and
schema. Preserve that contract unless a deliberate migration is being made.
