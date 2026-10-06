"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorCanvas } from "@/registry/image-editor/canvas";

// Scroll with ⌘/Ctrl or pinch to zoom · press and hold to see the original ·
// drop another photo onto it.
export default function CanvasDemo() {
  return (
    <ImageEditorProvider src="/samples/mountain-lake.jpg">
      <ImageEditorCanvas className="h-[420px] rounded-xl border p-2" />
    </ImageEditorProvider>
  );
}
