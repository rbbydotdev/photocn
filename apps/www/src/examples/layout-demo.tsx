"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorCurves } from "@/registry/image-editor/curves-panel";
import { ImageEditorLayout } from "@/registry/image-editor/layout";
import { ImageEditorRedoButton, ImageEditorUndoButton } from "@/registry/image-editor/toolbar";

export default function LayoutDemo() {
  return (
    <ImageEditorProvider src="/samples/mountain-lake.jpg">
      <ImageEditorLayout
        className="h-[520px] overflow-hidden rounded-xl border"
        sidebar={<ImageEditorCurves />}
        sidebarDefaultSize="300px"
        toolbar={
          <>
            <ImageEditorUndoButton />
            <ImageEditorRedoButton />
          </>
        }
      >
        <ImageEditorCanvas />
      </ImageEditorLayout>
    </ImageEditorProvider>
  );
}
