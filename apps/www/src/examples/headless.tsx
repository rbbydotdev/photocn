"use client";

import { useImageEditorState, type AdjustLightValue } from "photocn/react";

// No provider, no registry components: the headless hook plus a <canvas>.
export default function HeadlessExample() {
  const editor = useImageEditorState({ src: "/samples/portrait.jpg" });
  const { lights } = editor.adjust.value;

  const slider = (key: keyof AdjustLightValue, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums text-muted-foreground">{lights[key].toFixed(2)}</span>
      </span>
      <input
        max={1}
        min={-1}
        onChange={(event) =>
          editor.adjust.setLights({ ...lights, [key]: Number(event.target.value) })
        }
        step={0.01}
        type="range"
        value={lights[key]}
      />
    </label>
  );

  return (
    <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_220px]" ref={editor.rootRef}>
      <div className="relative h-[480px] overflow-hidden rounded-lg bg-muted" ref={editor.stageRef}>
        {editor.imageSrc ? (
          <canvas className="absolute inset-0 size-full object-contain" key={editor.imageSrc} ref={editor.canvasRef} />
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        {slider("exposure", "Exposure")}
        {slider("contrast", "Contrast")}
        {slider("highlights", "Highlights")}
        {slider("shadows", "Shadows")}
        <div className="mt-auto flex gap-2">
          <button className="rounded-md border px-3 py-1.5 text-sm" disabled={!editor.history.canUndo} onClick={editor.history.undo} type="button">
            Undo
          </button>
          <button
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background"
            disabled={!editor.isReady}
            onClick={() => void editor.download({ format: "jpeg", quality: 0.9 })}
            type="button"
          >
            Download JPEG
          </button>
        </div>
      </div>
    </div>
  );
}
