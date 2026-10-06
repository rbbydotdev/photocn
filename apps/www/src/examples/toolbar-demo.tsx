"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorToolPanel } from "@/registry/image-editor/tool-panel";
import {
  ImageEditorCompareButton,
  ImageEditorOpenButton,
  ImageEditorRedoButton,
  ImageEditorResetButton,
  ImageEditorToolbar,
  ImageEditorUndoButton,
} from "@/registry/image-editor/toolbar";

export default function ToolbarDemo() {
  return (
    <ImageEditorProvider src="/samples/dog.jpg">
      <div className="flex h-[560px] flex-col overflow-hidden rounded-xl border bg-background">
        <div className="flex flex-wrap items-center gap-1 border-b p-2">
          <ImageEditorUndoButton />
          <ImageEditorRedoButton />
          <ImageEditorOpenButton />
          <div className="ml-auto flex gap-2">
            <ImageEditorResetButton />
            <ImageEditorCompareButton />
          </div>
        </div>
        <div className="border-b p-2">
          <ImageEditorToolbar />
        </div>
        <div className="grid min-h-0 flex-1 sm:grid-cols-[1fr_300px]">
          <ImageEditorCanvas className="min-h-48 p-2" />
          <aside className="hidden overflow-y-auto border-l sm:block">
            <ImageEditorToolPanel />
          </aside>
        </div>
      </div>
    </ImageEditorProvider>
  );
}
