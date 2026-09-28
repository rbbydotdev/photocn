"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorAdjustments } from "@/registry/image-editor/adjustments-panel";
import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorExportDialog } from "@/registry/image-editor/export-dialog";
import {
  ImageEditorCompareButton,
  ImageEditorRedoButton,
  ImageEditorUndoButton,
} from "@/registry/image-editor/toolbar";

export default function ComposeYourOwnExample() {
  return (
    <ImageEditorProvider src="/samples/street.jpg">
      <div className="grid h-[560px] grid-rows-[auto_1fr] overflow-hidden rounded-xl border bg-background md:grid-cols-[1fr_300px]">
        <header className="flex items-center gap-1 border-b p-2 md:col-span-2">
          <ImageEditorUndoButton />
          <ImageEditorRedoButton />
          <div className="ml-auto flex gap-2">
            <ImageEditorCompareButton />
            <ImageEditorExportDialog />
          </div>
        </header>
        <ImageEditorCanvas className="min-h-64 p-3" />
        <aside className="overflow-y-auto border-t md:border-t-0 md:border-l">
          <ImageEditorAdjustments />
        </aside>
      </div>
    </ImageEditorProvider>
  );
}
