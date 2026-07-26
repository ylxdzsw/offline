# Offline Classical Games Development Notes

This repository is a static, bilingual offline PWA. There is no gameplay
server. Every page is assembled by Nattoppet and contains its own HTML, CSS,
and JavaScript. Search-heavy pages also contain a compressed game Wasm module.

## File structure

```text
app/
  index.ymd       Gallery page composition
  macros.ymd      Project Nattoppet macros
  app-shell.html  Reusable offline-shell component and ordered game list
  gallery.html    Plain gallery HTML/CSS/JS bundle
  tokens.css      Global design tokens and page styles
  i18n.js         Shared translations and game guides
  runtime.js      Worker, seed, and service-worker helpers
  storage.js      Local progress persistence
  wasm.js         Browser and worker Wasm loader/dispatcher
  *.test.js       Shared runtime unit tests
  manifest.webmanifest
  CNAME
  .nojekyll
  icons/          Committed static PWA icons

games/
  wasm_abi.rs     One source-included JSON ABI implementation
  target/         Shared generated Cargo target directory
  <game>/
    Cargo.toml    Rust-backed games: independent crate manifest
    Cargo.lock    Rust-backed games: independent dependency graph
    lib.rs        Rust-backed games: JSON dispatch and Wasm exports
    game.rs       Rust-backed games: rules and position representation
    ai.rs         Rust-backed search/policy for chess, junqi, and xiangqi
    search.rs     Rust-backed search for reversi, huarong, and wuziqi
    page.ymd      Nattoppet page entry point
    <game>.html   Game HTML/CSS/JS component bundle
    api.js        Browser and Node rules API or Wasm adapter
    worker.js     AI worker bundle, when the game has an AI worker
    contract.test.js
    guide.svg     Game-owned guide artwork; Reversi uses guide.webp

scripts/
  build-sw.mjs    Builds the hashed service worker from dist/
  sw.template.js  Service-worker source template
  serve.mjs       Local static development server

tests/
  app.spec.js     Browser and offline workflow tests
```

`dist/`, `games/target/`, `node_modules/`, Playwright reports, and test
artifacts are generated. Do not edit or commit them. A leftover
`engine/target/` from the pre-refactor layout is also ignored locally; new
builds never write there.

## Ownership rules

- `app/` is the platform. It owns behavior and deployment assets shared by
  multiple pages, plus the explicit navigation order in `OfflineGames.games`.
- `games/<id>/` is an independent application. It owns everything specific to
  that game, including its rules implementation, page, worker, tests, and guide
  artwork. Rust-backed games also own their crate and dependency lockfile.
- `Makefile` explicitly lists the games included in the product and
  identifies the JavaScript-backed subset while orchestrating independent
  builds. A game may override the common build pattern when it needs a
  different toolchain.
- Keep the gallery as a plain HTML bundle. Use a custom element when a bundle
  owns reusable behavior or needs a Shadow DOM boundary, such as
  `offline-shell` and the game boards. Do not wrap every fragment in a custom
  element.
- Keep shared files directly in `app/` and game files directly in their game
  directory. Do not add a directory that contains only one component file.
- `scripts/` contains build or development utilities only. The service-worker
  template is a build input, not a deployment asset.

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

- Nattoppet is an exact npm development dependency. Run it from the repository
  root through `make`; page paths are resolved relative to the page file.
- Project macros are loaded with `[mixin] ../../app/macros.ymd`. Bare mixins
  such as `common.ymd` come from the installed Nattoppet package.
- Game pages use `../../app/...` for platform files and `./...` for their own
  bundle. Rust-backed pages use `../target/...` for the platform-built Wasm
  artifact.
- Keep raw HTML, macro calls, and definition lines at column zero when the
  Nattoppet parser requires them. Avoid introducing HTML syntax that the
  parser interprets as Markdown prose.
- The build inlines all required code. Do not add CDN URLs, module imports, or
  runtime asset fetches that would break offline use. The manifest, icons, and
  game guides remain explicit service-worker-cached files.

## Game engines and Wasm

Lightweight games implement their synchronous rules API directly in `api.js`.
Keep that API usable in both browsers and Node contract tests, preserve saved
JSON state shapes, and use `BigInt` internally when exact seeded `u64`
arithmetic is required.

Each Rust-backed game is an independent `cdylib` crate. Its `lib.rs` includes
the shared ABI source with:

```rust
mod wasm_abi {
    include!("../wasm_abi.rs");
}
```

The ABI is synchronous and JSON-based. Keep the exported functions and ABI
version compatible with `app/wasm.js`. Rust-backed games own their request
parsing, domain representation, dependency versions, lockfile, and release
profile.
`game.rs` owns rules and state; `ai.rs` or `search.rs` owns a genuinely separate
search policy when the game needs one. Do not create empty symmetry files.

The root Makefile builds each Rust manifest separately while sharing the
generated `games/target/` cache. A Rust-backed browser adapter loads
`../target/wasm32-unknown-unknown/release/` in Node and the embedded module in a
built page.

## Adding or changing a game

1. Add the game ID to `GAMES` in `Makefile` and to `OfflineGames.games` in
   `app/app-shell.html` when it should appear in navigation. Add lightweight
   engines to `JS_GAMES`; other games must provide a Rust crate.
2. For a Rust-backed game, create `games/<id>/Cargo.toml`, `Cargo.lock`,
   `lib.rs`, and domain/search sources. Include `../wasm_abi.rs` from `lib.rs`.
   For a JavaScript-backed game, implement the rules directly in `api.js`.
3. Add `page.ymd`, `<id>.html`, `api.js`, `contract.test.js`, and `guide.svg` or
   `guide.webp`; add `worker.js` only when the game uses an AI worker.
4. Keep page references relative to the game directory and pass the built
   guide URL to `offline-shell`.
5. Run the applicable Rust checks plus the contract, build, and browser tests
   before changing generated output.

Saved progress uses the `offline-games:v1:<game>` local-storage namespace and
schema. Preserve that contract unless a deliberate migration is being made.
