"use client";

import type { ImageEditorExportResult } from "photocn/react";

import { ImageEditorCommandMenu } from "@/registry/image-editor/command-menu";
import { ImageEditor } from "@/registry/image-editor/image-editor";

export interface EditorBlockProps {
  /** Image to open. Without it, the editor shows an "Open image" button. */
  src?: string | File | Blob;
  /** Adds a Save button to the export panel. */
  onSave?: (result: ImageEditorExportResult) => void | Promise<void>;
}

/** The full editor, filling the screen, with a ⌘K command menu. */
export function EditorBlock({ src, onSave }: EditorBlockProps) {
  return (
    <ImageEditor className="h-dvh min-h-0" onSave={onSave} src={src}>
      <ImageEditorCommandMenu />
    </ImageEditor>
  );
}
