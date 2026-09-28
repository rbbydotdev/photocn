"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { AlertCircleIcon, ImagePlusIcon, Loader2Icon } from "lucide-react";
import { errorMessage, useImageEditor } from "photocn/react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BlurCenterOverlay } from "./blur-center-overlay";
import { EditorCropWorkspace } from "./crop-workspace";
import { PerspectiveOverlay } from "./perspective-overlay";

export interface ImageEditorCanvasProps {
  className?: string;
  /** Accessible name of the image. */
  alt?: string;
  /** Allow dropping an image file onto the canvas. Default `true`. */
  allowDrop?: boolean;
  /** Show an "Open image" button in the empty state. Default `true`. */
  showOpenButton?: boolean;
  /** Replace the empty state (no image loaded yet). */
  emptyState?: ReactNode;
  /** Extra layers rendered above the image (e.g. your own overlays). */
  children?: ReactNode;
}

/**
 * The image stage: GPU preview, pan/zoom (scroll, pinch), crop drawing in
 * the "compose" tool, blur focus in "blur", perspective handles, and
 * press-and-hold to compare with the original.
 */
export function ImageEditorCanvas({
  className,
  alt = "Image being edited",
  allowDrop = true,
  showOpenButton = true,
  emptyState,
  children,
}: ImageEditorCanvasProps) {
  const editor = useImageEditor();
  const [isDragOver, setIsDragOver] = useState(false);
  const isCompose = editor.tool === "compose";
  const isBlur = editor.tool === "blur";
  const { crop, perspective } = editor;
  const canEditCrop = isCompose && !perspective.isEditing;

  const dropProps = allowDrop
    ? {
        onDragOver: (event: DragEvent) => {
          if (!Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) {
            return;
          }
          event.preventDefault();
          setIsDragOver(true);
        },
        onDragLeave: () => setIsDragOver(false),
        onDrop: (event: DragEvent) => {
          const file = Array.from(event.dataTransfer.files).find((candidate) =>
            candidate.type.startsWith("image/"),
          );
          setIsDragOver(false);
          if (!file || editor.disabled) return;
          event.preventDefault();
          void editor.load(file).catch(() => undefined);
        },
      }
    : {};

  return (
    <div
      className={cn("relative h-full min-h-0", className)}
      data-drag-over={isDragOver || undefined}
      data-slot="image-editor-canvas"
      {...dropProps}
    >
      {editor.imageSrc ? (
        <EditorCropWorkspace
          alt={alt}
          aspectRatio={crop.aspectRatioValue}
          className="h-full rounded-md border shadow-sm"
          crop={crop.rect}
          disabled={editor.disabled}
          onComparePressedChange={isCompose ? undefined : editor.compare.setActive}
          onCropChange={canEditCrop ? crop.update : undefined}
          onCropCommit={canEditCrop ? crop.commitDrag : undefined}
          preview={
            <div className="absolute inset-0">
              {/* A fresh <canvas> per image: transferControlToOffscreen is one-shot. */}
              <canvas
                aria-label={alt}
                className="pointer-events-none absolute inset-0 block size-full select-none object-contain"
                key={editor.imageSrc}
                ref={editor.canvasRef}
              />
              {!editor.isReady && editor.status !== "error" ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : null}
              {isBlur && editor.imageSize ? (
                <BlurCenterOverlay
                  centerX={editor.blur.value.centerX}
                  centerY={editor.blur.value.centerY}
                  disabled={editor.disabled}
                  onCenterChange={editor.blur.setCenter}
                  onCenterCommit={editor.blur.commitCenter}
                />
              ) : null}
              {isCompose && perspective.isEditing && editor.imageSize ? (
                <PerspectiveOverlay
                  disabled={editor.disabled}
                  imageHeight={editor.imageSize.height}
                  imageWidth={editor.imageSize.width}
                  onQuadChange={perspective.change}
                  onQuadCommit={perspective.commit}
                  quad={perspective.quad}
                />
              ) : null}
              {children}
            </div>
          }
          showCropOverlay={canEditCrop && crop.isDrawn}
          src={editor.imageSrc}
          stageRef={editor.stageRef}
          transform={editor.view}
        />
      ) : (
        (emptyState ?? (
          <ImageEditorEmptyState showOpenButton={showOpenButton} />
        ))
      )}
      {isDragOver ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          Drop to open
        </div>
      ) : null}
    </div>
  );
}

/** Shown before an image is loaded, and when loading fails. */
export function ImageEditorEmptyState({
  showOpenButton = true,
  className,
}: {
  showOpenButton?: boolean;
  className?: string;
}) {
  const editor = useImageEditor();
  const error = editor.status === "error" ? editor.error : null;
  return (
    <div
      className={cn("flex h-full min-h-72 flex-col items-center justify-center p-6", className)}
      data-slot="image-editor-empty-state"
    >
      <Alert
        className={cn(
          "flex max-w-md flex-col items-center gap-2 text-center [&>svg]:translate-y-0",
          Boolean(error) && "border-destructive/30 bg-destructive/10",
        )}
        variant={error ? "destructive" : "default"}
      >
        {error ? <AlertCircleIcon aria-hidden="true" /> : null}
        {error ? <AlertTitle>Couldn&apos;t open this image</AlertTitle> : null}
        <AlertDescription className="items-center text-center">
          {error
            ? errorMessage(error)
            : editor.isLoading
              ? "Loading image…"
              : "Open or drop an image to start editing."}
        </AlertDescription>
        {showOpenButton ? (
          <Button
            disabled={editor.isLoading || editor.disabled}
            onClick={() => void editor.openFile()}
            size="sm"
            type="button"
            variant="outline"
          >
            <ImagePlusIcon aria-hidden="true" data-icon="inline-start" />
            {error ? "Open another image" : "Open image"}
          </Button>
        ) : null}
      </Alert>
    </div>
  );
}
