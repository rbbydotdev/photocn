# photocn

A GPU photo editor for React, distributed the [shadcn/ui](https://ui.shadcn.com) way. Use the whole editor, compose its pieces like Lego, or go fully headless. Inspired by [mapcn](https://github.com/AnmolSaini16/mapcn).

```bash
pnpm dlx shadcn@latest add https://<your-domain>/r/image-editor.json
```

```tsx
import { ImageEditor } from "@/components/image-editor/image-editor";

<ImageEditor src="/photo.jpg" onSave={({ blob }) => upload(blob)} />
```

## Three layers

| Layer | Where it lives | Use it when |
| --- | --- | --- |
| `<ImageEditor />` | registry (`image-editor`) | you want the complete editor |
| `<ImageEditorProvider>` + `ImageEditorCanvas`, `ImageEditorFilters`, `ImageEditorUndoButton`, … | registry (one item per piece) | you want your own layout |
| `useImageEditorState()` / `useImageEditor()` | npm (`photocn/react`) | you want your own UI entirely |

The **engine** (WebGL filters, render worker, EXIF, history, headless controller) ships on npm as `photocn`, so it gets bug fixes through normal updates. The **UI** ships through the registry and is copied into your project, so you own it.

## Repo layout

```
packages/photocn      npm package: engine + photocn/react controller
  src/react/          useImageEditorState, ImageEditorProvider, types
  src/worker/         OffscreenCanvas render worker (inlined into the bundle as a Blob)
  src/filters/        LUT presets (inlined as data URLs)
apps/www              Next.js docs site + registry host
  src/registry/image-editor/   registry source (what `shadcn add` copies)
  src/examples/                live docs examples (source is shown on the page)
  scripts/build-registry.mjs   generates registry.json (deps derived from imports) + shadcn build
```

## Develop

```bash
pnpm install
pnpm dev            # tsup --watch for photocn + next dev for the site
pnpm test           # photocn unit tests
pnpm build          # builds photocn, the registry (public/r) and the site
```

Set `NEXT_PUBLIC_SITE_URL` to the deployed origin before `pnpm build`. The same value is used in install commands and in the registry's cross-item `registryDependencies` URLs.

## Release

1. `cd packages/photocn && npm publish` (bump `version` first). Registry items depend on `photocn@^<version>`.
2. Deploy `apps/www` (e.g. Vercel, root `apps/www`, with `NEXT_PUBLIC_SITE_URL` set).
3. Optional: add the `@photocn` namespace to the [shadcn registry index](https://ui.shadcn.com/docs/registry/namespace) so users can run `shadcn add @photocn/image-editor`.

To test installs before publishing to npm, point the registry at a tarball:

```bash
cd packages/photocn && pnpm pack
PHOTOCN_SPEC="photocn@file:$PWD/photocn-0.1.0.tgz" REGISTRY_URL=http://localhost:3000 \
  node ../../apps/www/scripts/build-registry.mjs
```

## Notes

- The components target the **Radix** flavor of shadcn/ui (`shadcn init -b radix`). A Base UI flavor is not built yet.
- Rendering uses a Web Worker with OffscreenCanvas when available and falls back to the main thread otherwise. Under a strict CSP without `worker-src blob:`, pass `spawnWorker`.
