"use client";

import { ImageEditor } from "@/registry/image-editor/image-editor";

// The full editor forced into its phone layout. It switches automatically
// whenever the editor is narrower than 640px.
export default function CompactLayoutDemo() {
  return (
    <div className="mx-auto h-[640px] max-w-[390px] overflow-hidden rounded-[2rem] border-4 border-foreground/10 shadow-sm">
      <ImageEditor className="min-h-0" layout="compact" src="/samples/strawberries.jpg" />
    </div>
  );
}
