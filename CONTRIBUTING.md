# Contributing

Thanks for helping with photocn. Bug reports, fixes, docs and new blocks are all welcome.

## Setup

```bash
pnpm install
pnpm dev    # engine (tsup --watch) + the site on http://localhost:3000
```

- `packages/photocn`: the npm package (engine, `photocn/react`, `photocn/photo`).
- `apps/www`: photocn.dev, the docs and the shadcn registry. Registry source is in `apps/www/src/registry/`.
- [AGENTS.md](AGENTS.md) has the conventions; [docs/compose.md](docs/compose.md) explains crop & transform.

## Before you open a pull request

```bash
pnpm test                          # unit tests
pnpm typecheck
pnpm --filter www test:e2e         # every block in a real browser
pnpm --filter www test:install     # shadcn-add every block into a fresh app (slow)
```

- Add tests next to the code (`*.test.ts`) for changes in `packages/photocn/src`.
- Check UI changes in a browser at desktop and phone width.
- Don't edit `apps/www/public/r/*` or `apps/www/registry.json` by hand. `pnpm --filter www registry:build` regenerates them.
- Keep the attribution headers in `packages/photocn/src/gl/` and `src/exif/`.

## Releases

Maintainers bump `packages/photocn/package.json`, then push a `v*` tag. GitHub Actions publishes to npm.

By contributing, you agree that your work is released under the [MIT License](LICENSE).
