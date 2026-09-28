"use client";

import { ImageEditor } from "@/registry/image-editor/image-editor";

export default function FullEditorExample() {
  return <ImageEditor className="h-[680px] overflow-hidden rounded-xl border" src="/samples/mountain-lake.jpg" />;
}
