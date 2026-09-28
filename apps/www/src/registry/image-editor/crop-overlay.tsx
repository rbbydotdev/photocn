"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  fitRectInPolygon,
  rectInsidePolygon,
  type NormalizedRect,
  type Quad,
  type Vec2,
} from "photocn";
import type { ImageEditorGeometryApi } from "photocn/react";

import { cn } from "@/lib/utils";

/** Maps oriented px (X, Y) to stage px: (ox + X·k, oy + Y·k). */
export interface StageView {
  k: number;
  ox: number;
  oy: number;
}

export interface StageSize {
  width: number;
  height: number;
}

type Size = { width: number; height: number };

/** View that fits `rect` (normalized oriented) inside the stage with padding. */
export function fitView(rect: NormalizedRect, oriented: Size, stage: StageSize, padding: number): StageView {
  const rw = Math.max(1e-6, rect.width * oriented.width);
  const rh = Math.max(1e-6, rect.height * oriented.height);
  const k = Math.max(
    1e-6,
    Math.min((stage.width - padding * 2) / rw, (stage.height - padding * 2) / rh),
  );
  return {
    k,
    ox: stage.width / 2 - (rect.x * oriented.width + rw / 2) * k,
    oy: stage.height / 2 - (rect.y * oriented.height + rh / 2) * k,
  };
}

export function toStage(view: StageView, oriented: Size, [x, y]: Vec2): Vec2 {
  return [view.ox + x * oriented.width * view.k, view.oy + y * oriented.height * view.k];
}

export function toNormalized(view: StageView, oriented: Size, [x, y]: Vec2): Vec2 {
  return [(x - view.ox) / (oriented.width * view.k), (y - view.oy) / (oriented.height * view.k)];
}

export function rectToStage(view: StageView, oriented: Size, rect: NormalizedRect) {
  const [left, top] = toStage(view, oriented, [rect.x, rect.y]);
  return {
    left,
    top,
    width: rect.width * oriented.width * view.k,
    height: rect.height * oriented.height * view.k,
  };
}

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLES: { id: Handle; label: string; className: string }[] = [
  { id: "nw", label: "Resize from top left", className: "left-0 top-0 cursor-nwse-resize" },
  { id: "n", label: "Resize from top", className: "left-1/2 top-0 cursor-ns-resize" },
  { id: "ne", label: "Resize from top right", className: "left-full top-0 cursor-nesw-resize" },
  { id: "e", label: "Resize from right", className: "left-full top-1/2 cursor-ew-resize" },
  { id: "se", label: "Resize from bottom right", className: "left-full top-full cursor-nwse-resize" },
  { id: "s", label: "Resize from bottom", className: "left-1/2 top-full cursor-ns-resize" },
  { id: "sw", label: "Resize from bottom left", className: "left-0 top-full cursor-nesw-resize" },
  { id: "w", label: "Resize from left", className: "left-0 top-1/2 cursor-ew-resize" },
];

/** Resize a px rect by a pointer delta from one handle, honoring a locked ratio. */
function resizeRect(
  start: { x: number; y: number; w: number; h: number },
  handle: Handle,
  dx: number,
  dy: number,
  ratio: number | null,
  min: number,
) {
  let { x, y, w, h } = start;
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");

  if (!ratio) {
    if (east) w = Math.max(min, start.w + dx);
    if (west) {
      w = Math.max(min, start.w - dx);
      x = start.x + start.w - w;
    }
    if (south) h = Math.max(min, start.h + dy);
    if (north) {
      h = Math.max(min, start.h - dy);
      y = start.y + start.h - h;
    }
    return { x, y, w, h };
  }

  const isCorner = (east || west) && (north || south);
  if (isCorner) {
    // Follow whichever axis moved more, keep the opposite corner anchored.
    const dw = east ? dx : -dx;
    const dh = south ? dy : -dy;
    w = Math.max(min, Math.abs(dw) >= Math.abs(dh * ratio) ? start.w + dw : start.w + dh * ratio);
    h = w / ratio;
    if (h < min) {
      h = min;
      w = h * ratio;
    }
    x = west ? start.x + start.w - w : start.x;
    y = north ? start.y + start.h - h : start.y;
  } else if (east || west) {
    w = Math.max(min, start.w + (east ? dx : -dx));
    h = w / ratio;
    x = west ? start.x + start.w - w : start.x;
    y = start.y + start.h / 2 - h / 2;
  } else {
    h = Math.max(min, start.h + (south ? dy : -dy));
    w = h * ratio;
    y = north ? start.y + start.h - h : start.y;
    x = start.x + start.w / 2 - w / 2;
  }
  return { x, y, w, h };
}

/** Largest t in [0, 1] for which `candidate(t)` is valid (binary search). */
function constrain<T>(candidate: (t: number) => T, valid: (value: T) => boolean): T {
  if (valid(candidate(1))) return candidate(1);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (valid(candidate(mid))) lo = mid;
    else hi = mid;
  }
  return candidate(lo);
}

type Drag =
  | { kind: "resize"; handle: Handle; pointerId: number; start: Vec2; rect: NormalizedRect; view: StageView }
  | { kind: "pan"; pointerId: number; start: Vec2; rect: NormalizedRect; view: StageView };

export interface CropFrameOverlayProps {
  geometry: ImageEditorGeometryApi;
  view: StageView;
  stage: StageSize;
  disabled?: boolean;
  /** Freeze the view during a handle drag (null to release). */
  onFreezeView: (view: StageView | null) => void;
}

const MIN_CROP_PX = 32;

/**
 * The crop frame: dimmed outside, rule-of-thirds inside, 8 handles. Drag a
 * handle to resize, drag inside to move the image under the frame, scroll
 * or pinch to zoom. Everything is limited to the (warped) image.
 */
export function CropFrameOverlay({ geometry, view, stage, disabled, onFreezeView }: CropFrameOverlayProps) {
  const oriented = geometry.orientedSize;
  const polygon = geometry.polygon;
  const drag = useRef<Drag | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wheelRef = useRef<(event: WheelEvent) => void>(() => {});
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Native + non-passive so zooming the crop doesn't also scroll the page.
    const onWheel = (event: WheelEvent) => wheelRef.current(event);
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [oriented, polygon]);
  if (!oriented || !polygon) return null;

  const frame = rectToStage(view, oriented, geometry.crop);
  const ratio = geometry.value.aspectRatio;
  const inside = (rect: NormalizedRect) => rectInsidePolygon(rect, polygon, oriented);

  const toNorm = (r: { x: number; y: number; w: number; h: number }): NormalizedRect => ({
    x: r.x / oriented.width,
    y: r.y / oriented.height,
    width: r.w / oriented.width,
    height: r.h / oriented.height,
  });
  const toPx = (r: NormalizedRect) => ({
    x: r.x * oriented.width,
    y: r.y * oriented.height,
    w: r.width * oriented.width,
    h: r.height * oriented.height,
  });

  const resizeBy = (handle: Handle, rect: NormalizedRect, k: number, dx: number, dy: number) =>
    constrain(
      (t) => toNorm(resizeRect(toPx(rect), handle, (dx * t) / k, (dy * t) / k, ratio, MIN_CROP_PX / k)),
      inside,
    );

  const panBy = (rect: NormalizedRect, k: number, dx: number, dy: number) =>
    constrain(
      (t) => ({
        ...rect,
        x: rect.x - (dx * t) / k / oriented.width,
        y: rect.y - (dy * t) / k / oriented.height,
      }),
      inside,
    );

  const begin = (event: PointerEvent<HTMLElement>, handle: Handle | null) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const common = {
      pointerId: event.pointerId,
      start: [event.clientX, event.clientY] as Vec2,
      rect: geometry.crop,
      view,
    };
    drag.current = handle ? { kind: "resize", handle, ...common } : { kind: "pan", ...common };
    if (handle) onFreezeView(view);
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const dx = event.clientX - d.start[0];
    const dy = event.clientY - d.start[1];
    const next =
      d.kind === "resize"
        ? resizeBy(d.handle, d.rect, d.view.k, dx, dy)
        : panBy(d.rect, view.k, dx, dy);
    geometry.setCrop(next, { transient: true });
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    geometry.commit();
    onFreezeView(null);
  };

  wheelRef.current = (event: WheelEvent) => {
    if (disabled) return;
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.002);
    const rect = geometry.crop;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const minW = MIN_CROP_PX / view.k / oriented.width;
    const width = Math.max(minW, rect.width * factor);
    const height = (rect.height * width) / rect.width;
    let next: NormalizedRect = { x: cx - width / 2, y: cy - height / 2, width, height };
    if (!inside(next)) next = fitRectInPolygon(next, polygon, oriented);
    geometry.setCrop(next, { transient: true });
  };

  const onHandleKey = (handle: Handle) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 20 : 4;
    const delta: Record<string, Vec2> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[event.key];
    if (!d || disabled) return;
    event.preventDefault();
    geometry.setCrop(resizeBy(handle, geometry.crop, view.k, d[0], d[1]), { transient: true });
  };

  const maskPath = `M0 0H${stage.width}V${stage.height}H0Z M${frame.left} ${frame.top}v${frame.height}h${frame.width}v${-frame.height}Z`;

  return (
    <div className="absolute inset-0" data-slot="image-editor-crop-overlay" ref={rootRef}>
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" height={stage.height} width={stage.width}>
        <path className="fill-black/55" d={maskPath} fillRule="evenodd" />
      </svg>
      <div
        aria-label="Crop area. Drag to move the image, scroll to zoom."
        className={cn(
          "absolute touch-none outline outline-1 -outline-offset-1 outline-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]",
          disabled ? "pointer-events-none" : "cursor-move",
        )}
        onPointerCancel={end}
        onPointerDown={(event) => begin(event, null)}
        onPointerMove={move}
        onPointerUp={end}
        role="group"
        style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
        </div>
        {HANDLES.map((handle) => (
          <button
            aria-label={handle.label}
            className={cn(
              "absolute z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none touch-none focus-visible:ring-2 focus-visible:ring-ring",
              handle.className,
            )}
            disabled={disabled}
            key={handle.id}
            onKeyDown={onHandleKey(handle.id)}
            onKeyUp={() => geometry.commit()}
            onPointerCancel={end}
            onPointerDown={(event) => begin(event, handle.id)}
            onPointerMove={move}
            onPointerUp={end}
            type="button"
          >
            <span
              className={cn(
                "block rounded-full border border-black/30 bg-white shadow",
                handle.id.length === 2 ? "size-3.5" : "size-2.5",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export interface CornerHandlesOverlayProps {
  geometry: ImageEditorGeometryApi;
  view: StageView;
  stage: StageSize;
  disabled?: boolean;
  onFreezeView: (view: StageView | null) => void;
}

const CORNER_LABELS = ["top left", "top right", "bottom right", "bottom left"] as const;

/** Advanced perspective: drag each corner of the image. */
export function CornerHandlesOverlay({ geometry, view, stage, disabled, onFreezeView }: CornerHandlesOverlayProps) {
  const oriented = geometry.orientedSize;
  const polygon = geometry.polygon;
  const drag = useRef<{ index: 0 | 1 | 2 | 3; pointerId: number; view: StageView; origin: Vec2 } | null>(null);
  if (!oriented || !polygon) return null;

  const points = polygon.map((p) => toStage(view, oriented, p)) as Quad;

  const begin = (index: 0 | 1 | 2 | 3) => (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = { index, pointerId: event.pointerId, view, origin: [rect.left, rect.top] };
    onFreezeView(view);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const stagePoint: Vec2 = [event.clientX - d.origin[0], event.clientY - d.origin[1]];
    geometry.setCorner(d.index, toNormalized(d.view, oriented, stagePoint), { transient: true });
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    geometry.commit();
    onFreezeView(null);
  };

  return (
    <div className="absolute inset-0" data-slot="image-editor-corner-overlay">
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" height={stage.height} width={stage.width}>
        <polygon
          className="fill-none stroke-white/90"
          points={points.map((p) => p.join(",")).join(" ")}
          strokeWidth={1.5}
        />
      </svg>
      {points.map((point, index) => (
        <button
          aria-label={`Move ${CORNER_LABELS[index]} corner`}
          className="absolute flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full outline-none touch-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          disabled={disabled}
          key={CORNER_LABELS[index]}
          onPointerCancel={end}
          onPointerDown={begin(index as 0 | 1 | 2 | 3)}
          onPointerMove={move}
          onPointerUp={end}
          style={{ left: point[0], top: point[1] }}
          type="button"
        >
          <span className="block size-4 rounded-full border-2 border-white bg-primary shadow" />
        </button>
      ))}
    </div>
  );
}
