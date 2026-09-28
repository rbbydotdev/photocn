import { CodeBlock } from "@/components/site/code-block";
import { DocsPage, P, PropsTable, Section } from "@/components/site/prose";

export const metadata = { title: "useImageEditor" };

export default function ApiPage() {
  return (
    <DocsPage
      description="The headless controller behind every component, from photocn/react."
      title="useImageEditor"
    >
      <Section>
        <CodeBlock
          code={`import {
  ImageEditorProvider, // owns state (pass options) or shares it (pass editor)
  useImageEditor,      // read the nearest provider
  useImageEditorState, // create state yourself
} from "photocn/react";`}
        />
      </Section>
      <Section id="options" title="Options">
        <P>
          Accepted by <code>useImageEditorState</code>, <code>{"<ImageEditorProvider>"}</code> and{" "}
          <code>{"<ImageEditor>"}</code>.
        </P>
        <PropsTable
          rows={[
            ["src", "string | File | Blob | ArrayBuffer | HTMLImageElement", "The image to edit."],
            ["defaultParams", "EditorParams", "Initial edit (e.g. a restored session)."],
            ["onParamsChange", "(params) => void", "Fires after every edit."],
            ["tool / defaultTool / onToolChange", "ImageEditorToolId", "Controlled or uncontrolled active tool. Default \"adjust\"."],
            ["onImageLoad / onImageError", "(result) / (error) => void", "Image decode lifecycle."],
            ["onExport", "(result) => void", "Called after every successful export."],
            ["disabled", "boolean", "Disable all interaction."],
            ["filterPresets", "FilterPreset[]", "Replace the built-in presets. Use createLutPreset() or createMatrixPreset() from photocn/filters."],
            ["aspectRatioOptions", "{ value, label }[]", "Crop ratio presets, written landscape-first (\"3:2\"); the portrait toggle flips them."],
            ["cropTool", "ImageEditorToolId", "Tool that shows the crop view. Default \"compose\"."],
            ["renderMode", "\"worker\" | \"main\"", "Defaults to worker when OffscreenCanvas is supported."],
            ["spawnWorker", "() => Worker", "Custom worker spawn (for strict CSP)."],
            ["proxyMaxDim", "number | resolver", "Long-edge cap for the interactive preview proxy. 0 disables."],
            ["keyboardShortcuts", "boolean", "Cmd+Z / Shift+Cmd+Z / Esc. With several editors, only the last one touched responds. Default true."],
            ["historyLimit / commitDelay", "number", "Undo depth (100) and slider-drag merge window in ms (400)."],
          ]}
        />
      </Section>
      <Section id="api" title="Returned API">
        <PropsTable
          rows={[
            ["status", "\"idle\" | \"loading\" | \"ready\" | \"error\"", "Also available as isLoading, isReady, hasImage and error."],
            ["params / setParams / patch", "EditorParams", "Raw params. patch(section, values, { transient }) merges slider drags into one undo step."],
            ["history", "{ undo, redo, canUndo, canRedo }", "Undo stack."],
            ["tool / setTool", "ImageEditorToolId", "The active tool."],
            ["openFile / load", "() / (src) => Promise<void>", "Open the file picker, or load an image programmatically."],
            ["adjust", "{ value, setLights, setColors, setEffects, resetSection, reset }", "Tone and color."],
            ["filters", "{ value, presets, loading, select, setMix, reset }", "select() takes a preset, a label or null."],
            ["curves", "{ value, histogram, set, commit, reset }", "Four channels: RGB, R, G, B."],
            ["blur", "{ value, set, setCenter, commitCenter, reset }", "Bokeh and gaussian."],
            ["blend", "{ value, hasImage, setImage, setMix, reset }", "Second-image blend."],
            ["geometry", "{ value, crop, polygon, setCrop, rotate, flip, setStraighten, setPerspective, setCorner, setAspectRatio, toggleOrientation, reset, … }", "Non-destructive crop & transform, applied in a fixed order from the original. Design notes: docs/compose.md in the repo."],
            ["compare", "{ active, setActive }", "Show the original while held."],
            ["recipes", "{ current, apply }", "Serializable looks."],
            ["histogram", "{ data, canvasRef }", "Live RGB histogram."],
            ["exportImage / download", "({ format, quality, width, height }?) => Promise<ExportResult>", "Encode at full resolution, or resize with width/height (ratio kept if you give one side). JPEG keeps EXIF."],
            ["canvasRef / stageRef / rootRef", "RefObject", "Attach to the preview canvas, its container and the editor root."],
            ["engine / worker", "UseMiniPhotoEditorResult / WorkerEditor", "Escape hatches to the renderer, EXIF and the worker bridge."],
          ]}
        />
      </Section>
      <Section id="geometry" title="Geometry">
        <P>
          Crop, straighten, perspective, quarter turns and flips are stored as one small state and
          rendered from the original pixels every frame, always in the same order: orientation,
          perspective, straighten, crop. The crop is only a window, so it can be widened again at any
          time. Straightening shrinks the rendered crop just enough to hide empty corners, and your
          crop comes back when you straighten back.
        </P>
        <CodeBlock
          code={`const { geometry } = useImageEditor();

geometry.rotate(1);                      // quarter turn; the crop turns with the picture
geometry.setAspectRatio("16:9");         // follows the crop's orientation
geometry.toggleOrientation();            // 16:9 ⇄ 9:16
geometry.setStraighten(3.5);             // ±45°, frame stays put, auto-zoom
geometry.setPerspective({ y: 0.25 });    // keystone sliders, -1..1
geometry.setCrop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }); // normalized
geometry.outputSize;                     // { width, height } at full resolution

await editor.exportImage({ format: "jpeg", width: 1600 }); // resize happens at export`}
        />
      </Section>
      <Section title="Custom filters">
        <CodeBlock
          code={`import { createLutPreset, filterPresets } from "photocn/filters";

// A 33×1089 3D LUT strip (the same format as the built-ins).
const presets = [...filterPresets, createLutPreset("teal-orange", "/luts/teal-orange.png")];

<ImageEditor src={src} filterPresets={presets} />`}
        />
      </Section>
    </DocsPage>
  );
}
