"use client";

import { ImageEditorProvider } from "photocn/react";

import { Kbd } from "@/components/ui/kbd";
import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorCommandMenu } from "@/registry/image-editor/command-menu";

export default function CommandMenuDemo() {
  return (
    <ImageEditorProvider src="/samples/strawberries.jpg">
      <div className="relative h-[420px] overflow-hidden rounded-xl border bg-background">
        <ImageEditorCanvas className="p-2" />
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          Click the photo, then press <Kbd>⌘</Kbd> <Kbd>K</Kbd>
        </p>
        <ImageEditorCommandMenu />
      </div>
    </ImageEditorProvider>
  );
}
