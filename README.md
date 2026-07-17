# Offline Classical Games

A mobile-first bilingual collection of classical board games that remains fully playable after the first load. The collection contains:

- Chinese Xiangqi against an on-device AI
- 15×15 Freestyle Wuziqi against an on-device AI
- Uniquely solvable Sudoku puzzles in three difficulty levels

Every game is compiled by [Nattoppet](https://github.com/ylxdzsw/nattoppet) into a self-contained HTML page. The PWA uses no gameplay server, CDN, remote font, analytics service, or downloadable AI model.

## Build and test

Requirements: GNU Make and Node.js 22.18 or newer.

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

Useful targets are `make test-unit`, `make test-e2e`, and `make clean`.

## Language selection

The UI chooses Chinese when a browser language starts with `zh`; otherwise it uses English. A query parameter overrides detection on every page:

- `?lang=zh` — Simplified Chinese
- `?lang=en` — English

The sidebar language buttons use the same query contract and preserve it during navigation.

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
