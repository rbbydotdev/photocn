"use client";

import { useState, type DragEvent } from "react";
import { ImageUpIcon } from "lucide-react";
import type { ImageEditorExportResult } from "photocn/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImageEditor } from "@/registry/image-editor/image-editor";
import { cn } from "@/lib/utils";

export interface UploadEditorProps {
  /** Receives the edited image. Upload it wherever you like. */
  onUpload?: (result: ImageEditorExportResult) => void | Promise<void>;
  className?: string;
}

/** Drop a photo, edit it, upload the result. */
export function UploadEditor({ onUpload, className }: UploadEditorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const accept = (next?: File | null) => {
    if (next?.type.startsWith("image/")) {
      setDone(null);
      setFile(next);
    }
  };

  if (file) {
    return (
      <Card className={cn("h-[640px] gap-0 overflow-hidden p-0", className)}>
        <ImageEditor
          className="min-h-0"
          onSave={async (result) => {
            await onUpload?.(result);
            setDone(result.filename);
            setFile(null);
          }}
          showOpenButton={false}
          src={file}
          toolbarExtra={
            <Button onClick={() => setFile(null)} size="sm" type="button" variant="ghost">
              Cancel
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <label
      className={cn(
        "flex h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        className,
      )}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event: DragEvent) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        setDragging(false);
        accept(event.dataTransfer.files[0]);
      }}
    >
      <ImageUpIcon className="size-8 text-muted-foreground" />
      <span className="font-medium">{done ? `Uploaded ${done}` : "Drop a photo or click to choose"}</span>
      <span className="text-sm text-muted-foreground">Edit it before it uploads.</span>
      <input accept="image/*" className="sr-only" onChange={(event) => accept(event.target.files?.[0])} type="file" />
    </label>
  );
}
