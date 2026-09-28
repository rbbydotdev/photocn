"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { AlertCircleIcon, ImagePlusIcon, Loader2Icon, Maximize2Icon } from "lucide-react";
import { errorMessage, useImageEditor } from "photocn/react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BlurCenterOverlay } from "./blur-center-overlay";
import {
  CornerHandlesOverlay,
  CropFrameOverlay,
  fitView,
  rectToStage,
  type StageSize,
  type StageView,
} from "./crop-overlay";

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
  /** Space (px) kept around the image. Default 24. */
  padding?: number;
  /** Extra layers rendered above the image, positioned over it. */
  children?: ReactNode;
}

type UserView = { scale: number; x: number; y: number };
const IDENTITY_VIEW: UserView = { scale: 1, x: 0, y: 0 };

const SETTLE_MS = 240;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Blend two views so the point under the stage center travels in a straight
 * line and the zoom changes geometrically (no wobble).
 */
function blendViews(from: StageView, to: StageView, stage: StageSize, t: number): StageView {
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  const fromX = (cx - from.ox) / from.k;
  const fromY = (cy - from.oy) / from.k;
  const toX = (cx - to.ox) / to.k;
  const toY = (cy - to.oy) / to.k;
  const k = from.k * (to.k / from.k) ** t;
  const x = fromX + (toX - fromX) * t;
  const y = fromY + (toY - fromY) * t;
  return { k, ox: cx - x * k, oy: cy - y * k };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * The image stage. In the crop tool it shows the whole image dimmed around
 * the crop frame (drag handles, move, zoom, perspective corners); in every
 * other tool it shows the result, with pinch/⌘-scroll zoom, blur focus and
 * press-and-hold to compare.
 */
export function ImageEditorCanvas({
  className,
  alt = "Image being edited",
  allowDrop = true,
  showOpenButton = true,
  emptyState,
  padding = 24,
  children,
}: ImageEditorCanvasProps) {
  const editor = useImageEditor();
  const { geometry } = editor;
  const [stage, setStage] = useState<StageSize | null>(null);
  const [frozenView, setFrozenView] = useState<StageView | null>(null);
  // After a drag, ease from the frozen view to the re-fitted one (Photos-style).
  const [settle, setSettle] = useState<{ from: StageView; start: number } | null>(null);
  const [, setFrame] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const freezeView = (next: StageView | null) => {
    if (next === null && frozenView && !reducedMotion) {
      setSettle({ from: frozenView, start: performance.now() });
    } else if (next !== null) {
      setSettle(null);
    }
    setFrozenView(next);
  };
  useEffect(() => {
    if (!settle) return;
    let raf = 0;
    const tick = () => {
      if (performance.now() - settle.start >= SETTLE_MS) {
        setSettle(null);
        return;
      }
      setFrame((frame) => frame + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settle]);
  const [userView, setUserView] = useState<UserView>(IDENTITY_VIEW);
  const [isDragOver, setIsDragOver] = useState(false);
  const stageRef = editor.stageRef;

  const isCropView = geometry.view === "full";
  const isCorners = geometry.editingCorners;
  const isBlur = editor.tool === "blur";

  // Measure the stage.
  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [stageRef, editor.imageSrc]);

  // A new image, or switching between crop and result, starts un-zoomed.
  const viewKey = `${editor.imageSrc}|${geometry.view}`;
  const [trackedKey, setTrackedKey] = useState(viewKey);
  if (viewKey !== trackedKey) {
    setTrackedKey(viewKey);
    setUserView(IDENTITY_VIEW);
    setFrozenView(null);
    setSettle(null);
  }

  const oriented = geometry.orientedSize;
  let view: StageView | null = null;
  if (stage && oriented) {
    if (frozenView) {
      view = frozenView;
    } else if (isCropView) {
      // The frame stays put: fit the crop (or, while dragging corners, the
      // whole image) and let the image move and zoom under it.
      view = fitView(isCorners ? geometry.bounds : geometry.crop, oriented, stage, padding * 1.5);
      if (settle) {
        const t = Math.min(1, (performance.now() - settle.start) / SETTLE_MS);
        view = blendViews(settle.from, view, stage, easeOutCubic(t));
      }
    } else {
      const fit = fitView(geometry.displayRect, oriented, stage, padding);
      view = {
        k: fit.k * userView.scale,
        ox: fit.ox * userView.scale + userView.x,
        oy: fit.oy * userView.scale + userView.y,
      };
    }
  }
  const canvasBox = view && oriented ? rectToStage(view, oriented, geometry.displayRect) : null;

  // ⌘/Ctrl-scroll or pinch zooms the result; plain scroll pans once zoomed.
  const zoomRef = useRef<(event: WheelEvent) => void>(() => {});
  zoomRef.current = (event: WheelEvent) => {
    if (isCropView || !stage) return;
    const zooming = event.ctrlKey || event.metaKey;
    if (!zooming && userView.scale === 1) return;
    event.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    setUserView((prev) => {
      if (!zooming) return { ...prev, x: prev.x - event.deltaX, y: prev.y - event.deltaY };
      const scale = Math.min(8, Math.max(1, prev.scale * Math.exp(-event.deltaY * 0.01)));
      const f = scale / prev.scale;
      if (scale === 1) return IDENTITY_VIEW;
      return { scale, x: cx - (cx - prev.x) * f, y: cy - (cy - prev.y) * f };
    });
  };
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => zoomRef.current(event);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [stageRef, editor.imageSrc]);

  // Press and hold the result to see the original.
  const comparePointer = useRef<number | null>(null);
  const canCompare = !isCropView && !isBlur && !editor.disabled;
  const onStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canCompare || (event.pointerType === "mouse" && event.button !== 0)) return;
    comparePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    editor.compare.setActive(true);
  };
  const endCompare = (event: PointerEvent<HTMLDivElement>) => {
    if (comparePointer.current !== event.pointerId) return;
    comparePointer.current = null;
    editor.compare.setActive(false);
  };

  const dropProps = allowDrop
    ? {
        onDragOver: (event: DragEvent) => {
          if (!Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) return;
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
      data-settling={settle ? "" : undefined}
      data-view={isCropView ? "crop" : "result"}
      {...dropProps}
    >
      {editor.imageSrc ? (
        <div
          className={cn(
            "relative size-full touch-none overflow-hidden rounded-md border bg-muted/40 select-none",
            "bg-[conic-gradient(var(--muted)_25%,transparent_0_50%,var(--muted)_0_75%,transparent_0)] bg-[length:16px_16px]",
          )}
          data-slot="image-editor-stage"
          onPointerCancel={endCompare}
          onPointerDown={onStagePointerDown}
          onPointerUp={endCompare}
          ref={stageRef}
        >
          {/* One <canvas> for the image's lifetime: transferControlToOffscreen is one-shot. */}
          <canvas
            aria-label={alt}
            className="pointer-events-none absolute block"
            key={editor.imageSrc}
            ref={editor.canvasRef}
            role="img"
            style={
              canvasBox
                ? { left: canvasBox.left, top: canvasBox.top, width: canvasBox.width, height: canvasBox.height }
                : { visibility: "hidden" }
            }
          />
          {!editor.isReady && editor.status !== "error" ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {view && stage && isCropView && !isCorners ? (
            <CropFrameOverlay
              disabled={editor.disabled}
              geometry={geometry}
              onFreezeView={freezeView}
              stage={stage}
              view={view}
            />
          ) : null}
          {view && stage && isCropView && isCorners ? (
            <CornerHandlesOverlay
              disabled={editor.disabled}
              geometry={geometry}
              onFreezeView={freezeView}
              stage={stage}
              view={view}
            />
          ) : null}
          {canvasBox && !isCropView ? (
            <div className="pointer-events-none absolute" style={canvasBox}>
              {isBlur ? (
                <BlurCenterOverlay
                  centerX={editor.blur.value.centerX}
                  centerY={editor.blur.value.centerY}
                  className="pointer-events-auto"
                  disabled={editor.disabled}
                  onCenterChange={editor.blur.setCenter}
                  onCenterCommit={editor.blur.commitCenter}
                />
              ) : null}
              {children}
            </div>
          ) : null}
          {!isCropView && userView !== IDENTITY_VIEW ? (
            <Button
              aria-label="Fit to screen"
              className="absolute right-2 bottom-2"
              onClick={() => setUserView(IDENTITY_VIEW)}
              onPointerDown={(event) => event.stopPropagation()}
              size="icon-sm"
              type="button"
              variant="secondary"
            >
              <Maximize2Icon />
            </Button>
          ) : null}
        </div>
      ) : (
        (emptyState ?? <ImageEditorEmptyState showOpenButton={showOpenButton} />)
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
