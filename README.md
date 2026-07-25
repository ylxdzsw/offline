# Offline Classic Games

A mobile-first bilingual collection of classic board and puzzle games that remains fully playable after the first load. The collection contains:

- Chinese Xiangqi against an on-device AI
- 15×15 Freestyle Wuziqi against an on-device AI
- Uniquely solvable Sudoku puzzles in three difficulty levels
- Seeded 2048 with swipe, keyboard, undo, and persistent best score
- Hidden-rank Junqi (Luzhanqi) against an on-device AI
- Full orthodox Chess against an on-device AI
- Reversi with legal-move hints and a mobility-aware on-device AI
- Huarong Dao with three layouts and optimal on-device path hints
- Minesweeper with confirmation-first mobile controls and irreversible reveals
- Klondike Solitaire with draw-one and draw-three play
- Spider Solitaire with one-, two-, and four-suit modes

Every game is compiled by [Nattoppet](https://github.com/ylxdzsw/nattoppet) into a self-contained HTML page. The PWA uses no gameplay server, CDN, remote font, analytics service, or downloadable AI model.

Rules, puzzle generation, and computer play live in independent Rust crates
under `games/`. Each game directory owns its page, HTML component, browser
adapter, worker, guide, contract tests, manifest, and lockfile. The Makefile
builds one WebAssembly module per game; Nattoppet
compresses and inlines that module into its page, while AI searches run in Web
Workers. Saved games carry a seed, so undo/retry is reproducible and each new
game can still vary among near-equal moves without randomizing away forced
tactics.

Shared page behavior and deployment assets live directly under `app/`. Product
membership is explicit in the Makefile, while the shared shell owns runtime
navigation order. Small build utilities live in `scripts/`. See
[AGENTS.md](AGENTS.md) for the complete file-ownership and development notes.

## Build and test

Requirements: GNU Make, Node.js 22.18 or newer, and a stable Rust toolchain with
the `wasm32-unknown-unknown` target installed.

```sh
rustup target add wasm32-unknown-unknown
```

```sh
make deps
make build
make serve
```

The development server listens on <http://127.0.0.1:4173>. Build output is written to `dist/`.

Install Playwright's Chromium once before running the browser suite:

```sh
npx playwright install chromium
make test
```

Useful targets are `make wasm`, `make check-rust`, `make test-rust`,
`make test-unit`, `make test-contract`, `make test-e2e`, and `make clean`.

## Language selection

The UI uses the saved local preference when present. On first use it chooses
Chinese when a browser language starts with `zh`; otherwise it uses English.
The sidebar language buttons save the preference for every page without
changing the URL.

## GitHub Pages

Pushes to `master` run the build, unit tests, mobile browser tests, offline test, and official GitHub Pages deployment workflow. The deployed artifact includes `CNAME` with:

```text
offline.ylxdzsw.com
```

To finish the custom-domain setup:

1. In the repository's **Settings → Pages**, select **GitHub Actions** as the source.
2. Set the custom domain to `offline.ylxdzsw.com` in Pages settings. Actions-based deployments do not configure the domain from the repository's `CNAME` file alone.
3. At the DNS provider, point the `offline` CNAME record to `ylxdzsw.github.io`.
4. Enable **Enforce HTTPS** after GitHub verifies the DNS record and provisions the certificate.

All application URLs and service-worker resources are relative, so the site also works at the repository's default project Pages URL before DNS is configured.

## License

[MIT](LICENSE) © 2026 ylxdzsw
