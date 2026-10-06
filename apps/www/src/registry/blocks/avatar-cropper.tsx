"use client";

import { useEffect, useState } from "react";
import { ImageIcon, RotateCwSquareIcon } from "lucide-react";
import { ImageEditorProvider, useImageEditor } from "photocn/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageEditorCanvas } from "@/registry/image-editor/canvas";

export interface AvatarCropperProps {
  /** Current avatar URL. */
  value?: string | null;
  /** Called with the cropped square image (512×512 WebP). */
  onChange?: (avatar: { url: string; blob: Blob }) => void;
  /** Open the cropper with this image instead of asking for a file. */
  defaultSrc?: string;
}

/** Pick a photo, frame it in a square, save a 512px avatar. */
export function AvatarCropper({ value, onChange, defaultSrc }: AvatarCropperProps) {
  const [avatar, setAvatar] = useState<string | null>(value ?? null);
  const [source, setSource] = useState<string | File | null>(null);

  const pick = () => {
    if (defaultSrc && !avatar) {
      setSource(defaultSrc);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => input.files?.[0] && setSource(input.files[0]);
    input.click();
  };

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border bg-muted">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Avatar" className="size-full object-cover" src={avatar} />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>
      <Button onClick={pick} type="button" variant="outline">
        {avatar ? "Change photo" : "Upload photo"}
      </Button>
      <Dialog onOpenChange={(open) => !open && setSource(null)} open={source !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
            <DialogDescription>Drag to move. Scroll or pinch to zoom.</DialogDescription>
          </DialogHeader>
          {source ? (
            <ImageEditorProvider defaultTool="compose" keyboardShortcuts={false} src={source}>
              <SquareCrop
                onCancel={() => setSource(null)}
                onSave={(result) => {
                  setAvatar(result.url);
                  onChange?.(result);
                  setSource(null);
                }}
              />
            </ImageEditorProvider>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SquareCrop({
  onSave,
  onCancel,
}: {
  onSave: (avatar: { url: string; blob: Blob }) => void;
  onCancel: () => void;
}) {
  const editor = useImageEditor();
  const [saving, setSaving] = useState(false);
  // Lock the crop to a square once the photo is in.
  useEffect(() => {
    if (editor.isReady && editor.geometry.aspectRatio !== "1:1") editor.geometry.setAspectRatio("1:1");
  }, [editor.isReady, editor.geometry]);

  return (
    <>
      <ImageEditorCanvas className="h-80 rounded-md" padding={16} showOpenButton={false} />
      <DialogFooter className="flex-row items-center sm:justify-between">
        <Button
          aria-label="Rotate"
          disabled={!editor.isReady}
          onClick={() => editor.geometry.rotate(1)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <RotateCwSquareIcon />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!editor.isReady || saving}
            onClick={async () => {
              setSaving(true);
              try {
                const { blob } = await editor.exportImage({ format: "webp", quality: 0.9, width: 512, height: 512 });
                onSave({ url: URL.createObjectURL(blob), blob });
              } finally {
                setSaving(false);
              }
            }}
            type="button"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
