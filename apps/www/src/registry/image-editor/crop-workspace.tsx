"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  clamp,
  type CropDragBounds,
  type CropHandle,
  type CropInsets,
  type CropPointer,
  moveCropInsets,
  resizeCropInsets,
} from "photocn";
import { Maximize2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

const VIEW_SCALE_MIN = 0.25;
const VIEW_SCALE_MAX = 8;
const VIEW_IDENTITY: ViewTransform = { x: 0, y: 0, scale: 1 };

export interface EditorCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorCropTransform {
  zoom: number;
  rotation: number;
}

export interface EditorCropWorkspaceProps {
  src: string;
  alt: string;
  crop: EditorCropRect;
  transform: EditorCropTransform;
  preview?: ReactNode;
  aspectRatio?: number | null;
  minCropSize?: number;
  disabled?: boolean;
  withGrid?: boolean;
  showCropOverlay?: boolean;
  className?: string;
  stageClassName?: string;
  /** Optional ref to the inner stage element (for callers that need to read its measured size). */
  stageRef?: RefObject<HTMLDivElement | null>;
  onCropChange?: (crop: EditorCropRect) => void;
  onCropCommit?: (crop: EditorCropRect) => void;
  /**
   * Hold-to-compare. When provided, pressing the stage fires `(true)` and
   * releasing fires `(false)`. Disabled by passing `undefined` (e.g. in crop
   * mode where pointerdown is already used to draw the crop rect).
   */
  onComparePressedChange?: (pressed: boolean) => void;
}

interface DragState {
  bounds: CropDragBounds;
  /** Stage origin in client (page) coordinates. */
  stageOrigin: { left: number; top: number };
  handle: CropHandle | null;
  insets: CropInsets;
  pointerId: number;
  /** Pointer position in client coords at drag start. */
  start: CropPointer;
  /** True when the drag is creating a fresh crop from an empty stage. */
  isDrawNew: boolean;
}

const cropHandles = [
  { value: "top-left", label: "Resize from top left", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2" },
  { value: "top", label: "Resize from top", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" },
  { value: "top-right", label: "Resize from top right", className: "right-0 top-0 -translate-y-1/2 translate-x-1/2" },
  { value: "right", label: "Resize from right", className: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2" },
  { value: "bottom-right", label: "Resize from bottom right", className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2" },
  { value: "bottom", label: "Resize from bottom", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" },
  { value: "bottom-left", label: "Resize from bottom left", className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2" },
  { value: "left", label: "Resize from left", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" },
] as const satisfies readonly {
  value: CropHandle;
  label: string;
  className: string;
}[];

export function EditorCropWorkspace({
  src,
  alt,
  crop,
  transform,
  preview,
  aspectRatio = null,
  minCropSize = 48,
  disabled = false,
  withGrid = true,
  showCropOverlay = true,
  className,
  stageClassName,
  stageRef,
  onCropChange,
  onCropCommit,
  onComparePressedChange,
}: EditorCropWorkspaceProps) {
  const dragRef = useRef<DragState | null>(null);
  const comparePointerRef = useRef<number | null>(null);
  const latestCropRef = useRef(crop);
  latestCropRef.current = crop;

  // View transform (pan/zoom). State lives in the workspace so it persists
  // across tool switches — the user keeps their view when flipping between
  // Adjust / Compose / etc., and the transform doesn't get re-mounted away.
  const [viewTransform, setViewTransform] = useState<ViewTransform>(VIEW_IDENTITY);
  const viewScaleRef = useRef(1);
  viewScaleRef.current = viewTransform.scale;
  const localStageRef = useRef<HTMLDivElement | null>(null);
  const stageRefResolved = stageRef ?? localStageRef;

  // Reset view to identity when a new image loads (`src` changes). The
  // alternative would be `useEffect(() => setViewTransform(VIEW_IDENTITY),
  // [src])`, which is the "reset state on prop change" anti-pattern — the
  // skill's recommended pattern is to derive during render: track the prop
  // and schedule the reset before the next paint, no extra render cycle.
  const [trackedSrc, setTrackedSrc] = useState(src);
  if (src !== trackedSrc) {
    setTrackedSrc(src);
    setViewTransform(VIEW_IDENTITY);
  }

  // Native wheel listener (React's onWheel is passive by default in React 17+,
  // so preventDefault inside it is a no-op). Listener captures a closure over
  // a setter callback, so we don't re-bind on every transform change.
  useEffect(() => {
    const stage = stageRefResolved.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      // Plain scrolling over an un-zoomed image scrolls the page; pinch /
      // Cmd+scroll zooms, and once zoomed in, scrolling pans.
      const zooming = event.ctrlKey || event.metaKey;
      if (!zooming && viewScaleRef.current === 1) return;
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      // Trackpad pinch on macOS sets ctrlKey on the wheel event;
      // we also accept metaKey for keyboard-driven zoom.
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.01);
        setViewTransform((prev) => {
          const desired = prev.scale * factor;
          const nextScale = clamp(desired, VIEW_SCALE_MIN, VIEW_SCALE_MAX);
          // Actual factor after clamp — keeps the cursor's image-pixel
          // anchored under the cursor when at the bounds.
          const f = nextScale / prev.scale;
          return {
            x: prev.x * f + cursorX * (1 - f),
            y: prev.y * f + cursorY * (1 - f),
            scale: nextScale,
          };
        });
      } else {
        setViewTransform((prev) => ({
          ...prev,
          x: prev.x - event.deltaX,
          y: prev.y - event.deltaY,
        }));
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [stageRefResolved]);

  const resetView = () => setViewTransform(VIEW_IDENTITY);
  const isViewIdentity =
    viewTransform.x === 0 && viewTransform.y === 0 && viewTransform.scale === 1;

  const cropStyle = cropRectStyle(crop);
  // Pointer interaction is gated only by the explicit onCropChange callback,
  // not by showCropOverlay — that way drag-to-draw works even before the
  // overlay is rendered (initial empty state in compose mode).
  const canDragCrop = !disabled && !!onCropChange;
  const canCompare = !canDragCrop && !!onComparePressedChange && !disabled;
  const previewTransformStyle = {
    transform: `translate3d(0, 0, 0) rotate(${transform.rotation}deg) scale(${transform.zoom})`,
  } satisfies CSSProperties;
  const viewTransformStyle = {
    transform: `translate3d(${viewTransform.x}px, ${viewTransform.y}px, 0) scale(${viewTransform.scale})`,
    transformOrigin: "0 0",
  } satisfies CSSProperties;

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!canDragCrop || event.button !== 0) return;

    const target = event.target as Element;
    const handleElement = target.closest<HTMLElement>("[data-crop-handle]");
    const dragElement = target.closest<HTMLElement>("[data-crop-drag]");

    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const stageBounds = { width: rect.width, height: rect.height };
    const isDrawNew = !handleElement && !dragElement;
    let insets: CropInsets;
    let handle: CropHandle | null;

    if (isDrawNew) {
      // Drag-to-draw: start with a zero-area crop at the pointer. We compute
      // the rect directly from start-to-current pointer in updateDrag — no
      // resize math, so the corner stays *under* the cursor instead of being
      // shoved minSize ahead by clampCropInsets.
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      insets = {
        top: py,
        right: Math.max(0, rect.width - px),
        bottom: Math.max(0, rect.height - py),
        left: px,
      };
      handle = null;
      // Emit an initial 0×0 crop so callers can flip into "drawing" state.
      const initialCrop: EditorCropRect = {
        x: (px / rect.width) * 100,
        y: (py / rect.height) * 100,
        width: 0,
        height: 0,
      };
      latestCropRef.current = initialCrop;
      onCropChange?.(initialCrop);
    } else {
      insets = cropToInsets(crop, stageBounds);
      handle = (handleElement?.dataset.cropHandle as CropHandle | null) ?? null;
    }

    const dragState: DragState = {
      bounds: stageBounds,
      stageOrigin: { left: rect.left, top: rect.top },
      handle,
      insets,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      isDrawNew,
    };

    dragRef.current = dragState;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (
      !dragState ||
      dragState.pointerId !== event.pointerId ||
      !canDragCrop ||
      !onCropChange
    ) {
      return;
    }

    let nextCrop: EditorCropRect;

    if (dragState.isDrawNew) {
      // Compute the rect directly from start-pointer to current-pointer in
      // stage-local coords. Works regardless of drag direction.
      const startX = dragState.start.x - dragState.stageOrigin.left;
      const startY = dragState.start.y - dragState.stageOrigin.top;
      const endX = event.clientX - dragState.stageOrigin.left;
      const endY = event.clientY - dragState.stageOrigin.top;
      const left = clamp(Math.min(startX, endX), 0, dragState.bounds.width);
      const top = clamp(Math.min(startY, endY), 0, dragState.bounds.height);
      let right = clamp(Math.max(startX, endX), 0, dragState.bounds.width);
      let bottom = clamp(Math.max(startY, endY), 0, dragState.bounds.height);

      if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
        // Lock the rect to the requested aspect by shrinking whichever side
        // is over-provisioned relative to its partner.
        const w = right - left;
        const h = bottom - top;
        if (w / Math.max(h, 1) > aspectRatio) {
          right = left + h * aspectRatio;
        } else {
          bottom = top + w / aspectRatio;
        }
      }

      const insets: CropInsets = {
        top,
        right: dragState.bounds.width - right,
        bottom: dragState.bounds.height - bottom,
        left,
      };
      nextCrop = insetsToCrop(insets, dragState.bounds);
    } else {
      const delta = {
        x: event.clientX - dragState.start.x,
        y: event.clientY - dragState.start.y,
      };
      const nextInsets = dragState.handle
        ? resizeCropInsets(
            dragState.insets,
            dragState.handle,
            delta,
            dragState.bounds,
            { aspectRatio, minSize: minCropSize },
          )
        : moveCropInsets(dragState.insets, delta, dragState.bounds, minCropSize);
      nextCrop = insetsToCrop(nextInsets, dragState.bounds);
    }

    latestCropRef.current = nextCrop;
    onCropChange(nextCrop);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onCropCommit?.(latestCropRef.current);
  };

  const startCompare = (event: PointerEvent<HTMLDivElement>) => {
    if (!canCompare || event.button !== 0) return;
    if (comparePointerRef.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    comparePointerRef.current = event.pointerId;
    onComparePressedChange?.(true);
  };

  const endCompare = (event: PointerEvent<HTMLDivElement>) => {
    if (comparePointerRef.current !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released by the browser (e.g. on pointercancel).
    }
    comparePointerRef.current = null;
    onComparePressedChange?.(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startDrag(event);
    startCompare(event);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    endDrag(event);
    endCompare(event);
  };

  // Transparency-grid behind the image, like Photoshop/GIMP. Uses theme
  // vars via color-mix so opacity composes correctly on top of oklch
  // values (plain `hsl(var(--foo) / x)` doesn't work — the vars hold
  // oklch triples, not HSL). Two stacked linear-gradients offset by
  // half a tile form the checker.
  const checkerSquare = "color-mix(in oklab, var(--foreground) 7%, transparent)";
  const checkerStyle = {
    backgroundColor: "var(--background)",
    backgroundImage:
      `linear-gradient(45deg, ${checkerSquare} 25%, transparent 25%, transparent 75%, ${checkerSquare} 75%, ${checkerSquare}), ` +
      `linear-gradient(45deg, ${checkerSquare} 25%, transparent 25%, transparent 75%, ${checkerSquare} 75%, ${checkerSquare})`,
    backgroundPosition: "0 0, 8px 8px",
    backgroundSize: "16px 16px",
  } satisfies CSSProperties;

  return (
    <section
      aria-label="Crop workspace"
      className={cn(
        "grid min-h-0 grid-rows-[1fr] overflow-hidden p-4 text-foreground md:p-6",
        className,
      )}
      data-slot="editor-crop-workspace"
      style={checkerStyle}
    >
      <div
        className={cn(
          "relative min-h-64 min-w-0 touch-none overflow-hidden",
          stageClassName,
        )}
        data-slot="editor-crop-stage"
        ref={stageRefResolved}
      >
        {/* Content = the transformed (panned/zoomed) layer. Pointer handlers
            live here so percentage math is relative to content's transformed
            rect — scale-invariant, so existing crop drag / perspective drag
            work unchanged. */}
        <div
          className="absolute inset-0"
          data-slot="editor-crop-content"
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={updateDrag}
          onPointerUp={handlePointerUp}
          style={viewTransformStyle}
        >
          {preview ? (
            <div
              aria-label={alt}
              className="absolute inset-0 grid place-items-center will-change-transform"
              role="img"
              style={previewTransformStyle}
            >
              {preview}
            </div>
          ) : (
            <img
              alt={alt}
              className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain will-change-transform"
              draggable={false}
              src={src}
              style={previewTransformStyle}
            />
          )}

          {showCropOverlay ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-background/25" />

              <div
                aria-label="Crop selection"
                className={cn(
                  "absolute box-border border border-background shadow-[0_0_0_9999px_rgb(0_0_0/0.5)]",
                  canDragCrop ? "cursor-move" : "cursor-default",
                )}
                data-crop-drag
                data-slot="editor-crop-selection"
                role="region"
                style={cropStyle}
              >
                {withGrid ? <CropGrid /> : null}
                {cropHandles.map((handle) => (
                  <button
                    aria-label={handle.label}
                    className={cn(
                      "absolute size-4 rounded-full border border-background bg-primary shadow-sm outline-none ring-ring/50 transition-[box-shadow] hover:ring-4 focus-visible:ring-4",
                      handle.className,
                      canDragCrop
                        ? handleCursor(handle.value)
                        : "cursor-not-allowed opacity-50",
                    )}
                    data-crop-handle={handle.value}
                    disabled={!canDragCrop}
                    key={handle.value}
                    type="button"
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Fit-to-screen button — overlay in stage corner, only shown when
            the view transform is non-identity. */}
        {!isViewIdentity ? (
          <Button
            aria-label="Fit to screen"
            className="absolute right-2 top-2 z-10 shadow-sm"
            onClick={resetView}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Maximize2Icon aria-hidden="true" data-icon="inline-start" />
            Fit
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function CropGrid() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-y-0 left-1/3 border-l border-background/70" />
      <div className="absolute inset-y-0 left-2/3 border-l border-background/70" />
      <div className="absolute inset-x-0 top-1/3 border-t border-background/70" />
      <div className="absolute inset-x-0 top-2/3 border-t border-background/70" />
    </div>
  );
}

function cropRectStyle(crop: EditorCropRect): CSSProperties {
  return {
    left: `${crop.x}%`,
    top: `${crop.y}%`,
    width: `${crop.width}%`,
    height: `${crop.height}%`,
  };
}

function cropToInsets(crop: EditorCropRect, bounds: CropDragBounds): CropInsets {
  const left = (clamp(crop.x, 0, 100) / 100) * bounds.width;
  const top = (clamp(crop.y, 0, 100) / 100) * bounds.height;
  const width = (clamp(crop.width, 0, 100) / 100) * bounds.width;
  const height = (clamp(crop.height, 0, 100) / 100) * bounds.height;

  return {
    top,
    right: Math.max(0, bounds.width - left - width),
    bottom: Math.max(0, bounds.height - top - height),
    left,
  };
}

function insetsToCrop(insets: CropInsets, bounds: CropDragBounds): EditorCropRect {
  const width = Math.max(0, bounds.width - insets.left - insets.right);
  const height = Math.max(0, bounds.height - insets.top - insets.bottom);

  return {
    x: clamp((insets.left / bounds.width) * 100, 0, 100),
    y: clamp((insets.top / bounds.height) * 100, 0, 100),
    width: clamp((width / bounds.width) * 100, 0, 100),
    height: clamp((height / bounds.height) * 100, 0, 100),
  };
}

function handleCursor(handle: CropHandle): string {
  switch (handle) {
    case "top":
    case "bottom":
      return "cursor-ns-resize";
    case "left":
    case "right":
      return "cursor-ew-resize";
    case "top-left":
    case "bottom-right":
      return "cursor-nwse-resize";
    case "top-right":
    case "bottom-left":
      return "cursor-nesw-resize";
  }
}

