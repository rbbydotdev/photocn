# photocn

The engine behind [photocn](https://photocn.dev), the photo editor for shadcn/ui: WebGL adjustments, curves, 3D-LUT filters, crop and perspective, lens blur and blending. Rendering runs off the main thread, JPEG export keeps EXIF, and the headless React controller handles edits and history.

```bash
npm i photocn
```

```tsx
import { useImageEditorState } from "photocn/react";

function QuickEdit({ src }: { src: string }) {
  const editor = useImageEditorState({ src });
  return (
    <div ref={editor.rootRef}>
      <div ref={editor.stageRef} style={{ position: "relative", height: 480 }}>
        {editor.imageSrc && <canvas key={editor.canvasKey} ref={editor.canvasRef} style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
      </div>
      <button onClick={() => editor.filters.select("juno")}>Juno</button>
      <button onClick={editor.history.undo} disabled={!editor.history.canUndo}>Undo</button>
      <button onClick={() => editor.download({ format: "jpeg" })}>Download</button>
    </div>
  );
}
```

Without React, `createPhoto()` gives you a stateful photo to edit and export:

```ts
import { createPhoto } from "photocn/photo";

const photo = await createPhoto(file);
photo.adjust({ exposure: 0.3, saturation: -1 }).filter("juno").aspectRatio("1:1");
const { blob } = await photo.export({ format: "jpeg", width: 1080 });
```

## Entry points

| Import | Contents |
| --- | --- |
| `photocn` | params model, geometry, recipes (framework-agnostic) |
| `photocn/photo` | `createPhoto()`: edit and export without React |
| `photocn/react` | `useImageEditorState`, `ImageEditorProvider`, `useImageEditor`, value types |
| `photocn/hooks` | lower-level hooks (`useMiniPhotoEditor`, `useEditorHistory`, …) |
| `photocn/filters` | `filterPresets`, `createLutPreset`, `createMatrixPreset` |
| `photocn/dom`, `photocn/gl`, `photocn/exif` | renderer, image IO, EXIF |
| `photocn/worker`, `photocn/worker/entry` | worker bridge; worker script for custom spawning |

Pre-styled components install through the shadcn registry:

```bash
npx shadcn@latest registry add @photocn=https://photocn.dev/r/{name}.json
npx shadcn@latest add @photocn/image-editor
```

Docs: [photocn.dev](https://photocn.dev) · Source: [github.com/rbbydotdev/photocn](https://github.com/rbbydotdev/photocn)

MIT. Builds on [mini-photo-editor](https://github.com/xdadda/mini-photo-editor) and [glfx.js](https://github.com/evanw/glfx.js); see THIRD_PARTY_NOTICES.md.
