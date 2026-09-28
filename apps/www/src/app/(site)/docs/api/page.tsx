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
            ["aspectRatioOptions", "{ value, label }[]", "Crop aspect ratios, e.g. { value: \"3:2\", label: \"3:2\" }."],
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
            ["crop", "{ rect, setAspectRatio, commitDrag, apply, clear, rotate, transform, setTransform, resize, setResize, reset, … }", "Composition."],
            ["perspective", "{ isEditing, quad, toggle, change, commit, reset }", "Corner-drag perspective."],
            ["compare", "{ active, setActive }", "Show the original while held."],
            ["recipes", "{ current, apply }", "Serializable looks."],
            ["histogram", "{ data, canvasRef }", "Live RGB histogram."],
            ["exportImage / download", "(options?) => Promise<ExportResult>", "Full-resolution encode (png, jpeg, webp); JPEG keeps EXIF."],
            ["canvasRef / stageRef / rootRef", "RefObject", "Attach to the preview canvas, its container and the editor root."],
            ["engine / worker", "UseMiniPhotoEditorResult / WorkerEditor", "Escape hatches to the renderer, EXIF and the worker bridge."],
          ]}
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
