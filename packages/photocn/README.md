# photocn

The engine behind the [photocn](../../README.md) shadcn/ui image editor: WebGL adjustments, curves, 3D-LUT filters, crop and perspective, lens blur and blending. Rendering runs off the main thread, JPEG export keeps EXIF, and the headless React controller handles edits and history.

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
        {editor.imageSrc && <canvas key={editor.imageSrc} ref={editor.canvasRef} style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
      </div>
      <button onClick={() => editor.filters.select("juno")}>Juno</button>
      <button onClick={editor.history.undo} disabled={!editor.history.canUndo}>Undo</button>
      <button onClick={() => editor.download({ format: "jpeg" })}>Download</button>
    </div>
  );
}
```

## Entry points

| Import | Contents |
| --- | --- |
| `photocn` | params model, geometry, recipes (framework-agnostic) |
| `photocn/react` | `useImageEditorState`, `ImageEditorProvider`, `useImageEditor`, value types |
| `photocn/hooks` | lower-level hooks (`useMiniPhotoEditor`, `useEditorHistory`, …) |
| `photocn/filters` | `filterPresets`, `createLutPreset`, `createMatrixPreset` |
| `photocn/dom`, `photocn/gl`, `photocn/exif` | renderer, image IO, EXIF |
| `photocn/worker`, `photocn/worker/entry` | worker bridge; worker script for custom spawning |

Pre-styled components are available through the shadcn registry. See the docs site.

MIT
