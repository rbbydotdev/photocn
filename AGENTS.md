# AGENTS.md

Guide for coding agents working in this repo.

## What this is

photocn: a WebGL photo editor for React, shipped two ways:

- `packages/photocn`: the npm package. Engine (WebGL renderer, render worker, EXIF, filters), params model, non-destructive geometry (`src/compose.ts`), and the headless React controller (`src/react`, `useImageEditorState` / `useImageEditor`).
- `apps/www`: Next.js docs site (photocn.dev) that also serves the shadcn registry at `/r/{name}.json`. Registry source lives in `apps/www/src/registry/image-editor/`; `scripts/build-registry.mjs` generates `registry.json` (dependencies derived from imports) and runs `shadcn build`.

## Commands

```bash
pnpm install
pnpm dev                    # tsup --watch (photocn) + next dev (www) on :3000
pnpm test                   # vitest (photocn)
pnpm typecheck
pnpm build                  # photocn, registry, site
```

## Conventions

- TypeScript strict. Match the surrounding code's naming and comment density.
- Registry components use shadcn **Radix** primitives via `@/components/ui/*`; siblings import each other relatively (`./canvas`) so they install into one folder.
- Connected components are named `ImageEditor*` and read `useImageEditor()`; each panel file also exports a plain controlled version (`value` / `onChange`).
- Geometry is non-destructive and rendered from the original in a fixed order (see `docs/compose.md`). Never bake pixels.
- A `<canvas>` given to the render worker can't be reused: key it with `canvasKey`.
- Tailwind v4, mobile-first. Prefer container queries for editor layout.
- Add tests next to code (`*.test.ts`) for anything in `packages/photocn/src`.
- Verify UI changes in a real browser (Playwright, desktop + phone size).

## Don't

- Don't edit `apps/www/public/r/*` or `apps/www/registry.json` by hand; rebuild them.
- Don't remove the attribution headers in `packages/photocn/src/gl/` and `src/exif/` (MIT, see THIRD_PARTY_NOTICES.md).
