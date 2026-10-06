"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorBlur } from "@/registry/image-editor/blur-panel";

export default function BlurDemo() {
  return (
    <ImageEditorProvider src="/samples/dog.jpg" defaultTool="blur">
      <div className="grid h-[520px] grid-rows-[1fr_auto] overflow-hidden rounded-xl border bg-background sm:grid-cols-[1fr_300px] sm:grid-rows-1">
        <ImageEditorCanvas className="min-h-0 p-2" />
        <aside className="max-h-60 overflow-y-auto border-t sm:max-h-none sm:border-t-0 sm:border-l">
          <ImageEditorBlur />
        </aside>
      </div>
    </ImageEditorProvider>
  );
}
