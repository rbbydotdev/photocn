"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorCrop } from "@/registry/image-editor/crop-panel";

export default function CropDemo() {
  return (
    <ImageEditorProvider src="/samples/street.jpg" defaultTool="compose">
      <div className="grid h-[520px] grid-rows-[1fr_auto] overflow-hidden rounded-xl border bg-background sm:grid-cols-[1fr_300px] sm:grid-rows-1">
        <ImageEditorCanvas className="min-h-0 p-2" />
        <aside className="max-h-60 overflow-y-auto border-t sm:max-h-none sm:border-t-0 sm:border-l">
          <ImageEditorCrop />
        </aside>
      </div>
    </ImageEditorProvider>
  );
}
