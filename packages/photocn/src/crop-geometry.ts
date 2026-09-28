import { clamp } from "./util";

export interface CropInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CropPointer {
  x: number;
  y: number;
}

export interface CropDragBounds {
  width: number;
  height: number;
}

export interface CropRect extends CropDragBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CropEdge = "top" | "right" | "bottom" | "left";
export type CropCorner = "top-left" | "top-right" | "bottom-right" | "bottom-left";
export type CropHandle = CropEdge | CropCorner;

export interface CropResizeOptions {
  aspectRatio?: number | null;
  minSize?: number;
}

const legacyOuterHotspot = 10;

function minCropSize(minSize: number | undefined, bounds: CropDragBounds): number {
  return Math.max(0, Math.min(minSize ?? 100, bounds.width, bounds.height));
}

function minCropDimension(minSize: number, maxSize: number): number {
  return Math.max(0, Math.min(minSize, maxSize));
}

function horizontalInsetLimit(bounds: CropDragBounds, oppositeInset: number, minSize: number): number {
  return Math.max(0, bounds.width - oppositeInset - minSize);
}

function verticalInsetLimit(bounds: CropDragBounds, oppositeInset: number, minSize: number): number {
  return Math.max(0, bounds.height - oppositeInset - minSize);
}

function insetsToRect(insets: CropInsets, bounds: CropDragBounds): CropRect {
  return {
    top: insets.top,
    right: bounds.width - insets.right,
    bottom: bounds.height - insets.bottom,
    left: insets.left,
    width: bounds.width - insets.left - insets.right,
    height: bounds.height - insets.top - insets.bottom,
  };
}

function rectToInsets(rect: CropRect, bounds: CropDragBounds): CropInsets {
  return {
    top: rect.top,
    right: bounds.width - rect.right,
    bottom: bounds.height - rect.bottom,
    left: rect.left,
  };
}

function isHotspot(distanceFromEdge: number, hotspot: number): boolean {
  return distanceFromEdge >= -legacyOuterHotspot
    && distanceFromEdge <= Math.max(0, hotspot - legacyOuterHotspot);
}

function handleFromEdges(
  top: boolean,
  right: boolean,
  bottom: boolean,
  left: boolean,
): CropHandle | null {
  if (top && left) return "top-left";
  if (top && right) return "top-right";
  if (bottom && right) return "bottom-right";
  if (bottom && left) return "bottom-left";
  if (top) return "top";
  if (right) return "right";
  if (bottom) return "bottom";
  if (left) return "left";
  return null;
}

function handleEdges(handle: CropHandle): Record<CropEdge, boolean> {
  return {
    top: handle === "top" || handle === "top-left" || handle === "top-right",
    right: handle === "right" || handle === "top-right" || handle === "bottom-right",
    bottom: handle === "bottom" || handle === "bottom-left" || handle === "bottom-right",
    left: handle === "left" || handle === "top-left" || handle === "bottom-left",
  };
}

export function hitTestCropHandle(
  pointer: CropPointer,
  rect: CropRect,
  hotspot = 50,
): CropHandle | null {
  const top = isHotspot(pointer.y - rect.top, hotspot);
  const right = isHotspot(rect.right - pointer.x, hotspot);
  const bottom = isHotspot(rect.bottom - pointer.y, hotspot);
  const left = isHotspot(pointer.x - rect.left, hotspot);

  return handleFromEdges(top, right, bottom, left);
}

export function clampCropInsets(
  insets: CropInsets,
  bounds: CropDragBounds,
  minSize = 100,
): CropInsets {
  const minWidth = minCropDimension(minSize, bounds.width);
  const minHeight = minCropDimension(minSize, bounds.height);
  const left = clamp(insets.left, 0, Math.max(0, bounds.width - minWidth));
  const right = clamp(insets.right, 0, horizontalInsetLimit(bounds, left, minWidth));
  const top = clamp(insets.top, 0, Math.max(0, bounds.height - minHeight));
  const bottom = clamp(insets.bottom, 0, verticalInsetLimit(bounds, top, minHeight));

  return { top, right, bottom, left };
}

export function moveCropInsets(
  insets: CropInsets,
  delta: CropPointer,
  bounds: CropDragBounds,
  minSize = 100,
): CropInsets {
  const current = clampCropInsets(insets, bounds, minSize);
  const width = bounds.width - current.left - current.right;
  const height = bounds.height - current.top - current.bottom;
  const left = clamp(current.left + delta.x, 0, bounds.width - width);
  const top = clamp(current.top + delta.y, 0, bounds.height - height);

  return {
    top,
    right: bounds.width - left - width,
    bottom: bounds.height - top - height,
    left,
  };
}

function resizeFreeformInsets(
  insets: CropInsets,
  handle: CropHandle,
  delta: CropPointer,
  bounds: CropDragBounds,
  minSize: number,
): CropInsets {
  const edges = handleEdges(handle);
  const next = { ...insets };

  if (edges.top) {
    next.top = clamp(insets.top + delta.y, 0, verticalInsetLimit(bounds, insets.bottom, minSize));
  }

  if (edges.bottom) {
    next.bottom = clamp(insets.bottom - delta.y, 0, verticalInsetLimit(bounds, insets.top, minSize));
  }

  if (edges.left) {
    next.left = clamp(insets.left + delta.x, 0, horizontalInsetLimit(bounds, insets.right, minSize));
  }

  if (edges.right) {
    next.right = clamp(insets.right - delta.x, 0, horizontalInsetLimit(bounds, insets.left, minSize));
  }

  return next;
}

function resizeAspectInsets(
  insets: CropInsets,
  handle: CropHandle,
  delta: CropPointer,
  bounds: CropDragBounds,
  aspectRatio: number,
  minSize: number,
): CropInsets {
  const edges = handleEdges(handle);
  const rect = insetsToRect(insets, bounds);
  const movesLeft = edges.left || (!edges.left && !edges.right);
  const movesTop = edges.top || (!edges.top && !edges.bottom);
  const anchorX = movesLeft ? rect.right : rect.left;
  const anchorY = movesTop ? rect.bottom : rect.top;
  const maxWidth = movesLeft ? anchorX : bounds.width - anchorX;
  const maxHeight = movesTop ? anchorY : bounds.height - anchorY;
  const requestedMinWidth = Math.max(minSize, minSize * aspectRatio);
  const minWidth = Math.min(requestedMinWidth, maxWidth, maxHeight * aspectRatio);
  const maxAspectWidth = Math.max(minWidth, Math.min(maxWidth, maxHeight * aspectRatio));
  const requestedWidth = edges.left
    ? rect.width - delta.x
    : edges.right
      ? rect.width + delta.x
      : rect.width + (Math.abs(delta.x) >= Math.abs(delta.y) ? delta.x : delta.y * aspectRatio);
  const width = clamp(requestedWidth, minWidth, maxAspectWidth);
  const height = width / aspectRatio;
  const left = movesLeft ? anchorX - width : anchorX;
  const right = movesLeft ? anchorX : anchorX + width;
  const top = movesTop ? anchorY - height : anchorY;
  const bottom = movesTop ? anchorY : anchorY + height;

  return rectToInsets({ top, right, bottom, left, width, height }, bounds);
}

export function resizeCropInsets(
  insets: CropInsets,
  handle: CropHandle,
  delta: CropPointer,
  bounds: CropDragBounds,
  options: CropResizeOptions = {},
): CropInsets {
  const minSize = minCropSize(options.minSize, bounds);
  const current = clampCropInsets(insets, bounds, minSize);
  const aspectRatio = options.aspectRatio && Number.isFinite(options.aspectRatio)
    ? options.aspectRatio
    : 0;

  if (aspectRatio > 0) {
    return resizeAspectInsets(current, handle, delta, bounds, aspectRatio, minSize);
  }

  return resizeFreeformInsets(current, handle, delta, bounds, minSize);
}
