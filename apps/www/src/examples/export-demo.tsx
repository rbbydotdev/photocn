"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorExportDialog } from "@/registry/image-editor/export-dialog";

export default function ExportDemo() {
  return (
    <ImageEditorProvider src="/samples/portrait.jpg">
      <div className="relative h-[420px] overflow-hidden rounded-xl border bg-background">
        <ImageEditorCanvas className="p-2" />
        <div className="absolute top-4 right-4">
          <ImageEditorExportDialog
            onSave={async ({ blob, filename }) => {
              // Upload it anywhere, e.g. await fetch("/api/photos", { method: "POST", body: blob })
              console.log("save", filename, blob.size);
            }}
          />
        </div>
      </div>
    </ImageEditorProvider>
  );
}
