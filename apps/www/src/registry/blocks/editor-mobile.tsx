"use client";

import type { ImageEditorExportResult } from "photocn/react";

import { ImageEditor } from "@/registry/image-editor/image-editor";

/**
 * A full-screen phone editor: photo first, tools at the bottom, controls in
 * a sheet. Add it to a page and open it on any phone.
 */
export function EditorMobileBlock({
  src,
  onSave,
}: {
  src?: string | File | Blob;
  onSave?: (result: ImageEditorExportResult) => void | Promise<void>;
}) {
  return <ImageEditor className="h-dvh min-h-0" layout="compact" onSave={onSave} src={src} />;
}
