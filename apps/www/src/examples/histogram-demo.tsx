"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorAdjustments } from "@/registry/image-editor/adjustments-panel";
import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorHistogram } from "@/registry/image-editor/histogram";

// Move a slider and watch the histogram follow (it's computed off-thread).
export default function HistogramDemo() {
  return (
    <ImageEditorProvider src="/samples/street.jpg">
      <div className="grid h-[520px] grid-rows-[1fr_auto] overflow-hidden rounded-xl border bg-background sm:grid-cols-[1fr_300px] sm:grid-rows-1">
        <ImageEditorCanvas className="min-h-0 p-2" />
        <aside className="max-h-64 overflow-y-auto border-t sm:max-h-none sm:border-t-0 sm:border-l">
          <ImageEditorHistogram className="border-b bg-muted/30 px-3 py-2" />
          <ImageEditorAdjustments />
        </aside>
      </div>
    </ImageEditorProvider>
  );
}
