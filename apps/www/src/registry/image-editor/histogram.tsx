"use client";

import { useImageEditor } from "photocn/react";

import { cn } from "@/lib/utils";

export interface ImageEditorHistogramProps {
  className?: string;
  /** Show the "Histogram" label and pixel count. Default `true`. */
  showHeader?: boolean;
}

/** Live RGB histogram of the rendered image (computed off-thread). */
export function ImageEditorHistogram({
  className,
  showHeader = true,
}: ImageEditorHistogramProps) {
  const editor = useImageEditor();
  const pixels = editor.histogram.data?.pixels;
  return (
    <div className={cn("flex flex-col gap-1", className)} data-slot="image-editor-histogram">
      {showHeader ? (
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Histogram</span>
          <span className="font-mono normal-case tracking-normal tabular-nums">
            {pixels ? pixels.toLocaleString() : "—"}
          </span>
        </div>
      ) : null}
      <canvas
        aria-hidden="true"
        className="block h-16 w-full rounded-sm bg-background/60"
        height={64}
        ref={editor.histogram.canvasRef}
        width={256}
      />
    </div>
  );
}
