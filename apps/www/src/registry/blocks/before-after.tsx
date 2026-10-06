"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useImageEditorState, type AdjustLightValue } from "photocn/react";

import { cn } from "@/lib/utils";

export interface BeforeAfterProps {
  src: string;
  /** Filter preset label to apply, e.g. "juno". */
  filter?: string;
  /** Light adjustments to apply, -1..1. */
  lights?: Partial<AdjustLightValue>;
  className?: string;
}

/**
 * Drag the handle to compare the original with the edit. The original is a
 * plain <img>; the edit is the editor's canvas, clipped by the handle.
 */
export function BeforeAfter({ src, filter = "juno", lights, className }: BeforeAfterProps) {
  const editor = useImageEditorState({ src, keyboardShortcuts: false });
  const [split, setSplit] = useState(50);
  const stage = useRef<HTMLDivElement | null>(null);
  const applied = useRef(false);

  useEffect(() => {
    if (!editor.isReady || applied.current) return;
    applied.current = true;
    if (lights) editor.adjust.setLights({ ...editor.adjust.value.lights, ...lights });
    void editor.filters.select(filter);
  }, [editor, filter, lights]);

  const size = editor.imageSize;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || (event.type === "pointermove" && event.buttons === 0)) return;
    setSplit(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)));
  };

  return (
    <div
      className={cn("relative mx-auto w-full touch-none select-none overflow-hidden rounded-xl bg-muted", className)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }}
      onPointerMove={move}
      ref={(node) => {
        stage.current = node;
        editor.rootRef.current = node;
      }}
      style={{ aspectRatio: size ? `${size.width} / ${size.height}` : "4 / 3" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Before" className="absolute inset-0 size-full object-cover" draggable={false} src={src} />
      <div className="absolute inset-0" ref={editor.stageRef} style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        {editor.imageSrc ? (
          <canvas
            aria-label="After"
            className="absolute inset-0 size-full"
            key={editor.canvasKey}
            ref={editor.canvasRef}
          />
        ) : null}
      </div>
      <div aria-hidden className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }}>
        <div className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-medium text-black shadow">
          ⇆
        </div>
      </div>
      <span className="absolute top-3 left-3 rounded bg-black/50 px-2 py-0.5 text-xs text-white">Before</span>
      <span className="absolute top-3 right-3 rounded bg-black/50 px-2 py-0.5 text-xs text-white">After</span>
      <input
        aria-label="Compare position"
        className="sr-only"
        max={100}
        min={0}
        onChange={(event) => setSplit(Number(event.target.value))}
        type="range"
        value={Math.round(split)}
      />
    </div>
  );
}
