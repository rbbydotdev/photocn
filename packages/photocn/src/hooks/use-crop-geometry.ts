import { useCallback, useMemo, useState } from "react";

import {
  clampCropInsets,
  hitTestCropHandle,
  moveCropInsets,
  resizeCropInsets,
  type CropDragBounds,
  type CropHandle,
  type CropInsets,
  type CropPointer,
  type CropRect,
} from "..";

export type {
  CropDragBounds,
  CropHandle,
  CropInsets,
  CropPointer,
  CropRect,
} from "..";

const defaultInsets: CropInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export type CropDragMode = "move" | "resize";

export interface CropGeometryChange {
  insets: CropInsets;
  rect: CropRect;
  mode: CropDragMode;
  handle: CropHandle | null;
}

export interface UseCropGeometryOptions {
  bounds: CropDragBounds;
  initialInsets?: CropInsets;
  insets?: CropInsets;
  aspectRatio?: number | null;
  minSize?: number;
  hotspot?: number;
  onInsetsChange?: (change: CropGeometryChange) => void;
}

export interface CropDragSnapshot {
  pointer: CropPointer;
  insets: CropInsets;
  handle: CropHandle | null;
}

export interface UseCropGeometryResult {
  insets: CropInsets;
  rect: CropRect;
  activeHandle: CropHandle | null;
  isDragging: boolean;
  hitTest: (pointer: CropPointer) => CropHandle | null;
  startDrag: (pointer: CropPointer, handle?: CropHandle | null) => boolean;
  moveDrag: (pointer: CropPointer) => CropInsets;
  endDrag: () => void;
  reset: (nextInsets?: CropInsets) => void;
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

function isPointInsideRect(pointer: CropPointer, rect: CropRect): boolean {
  return pointer.x >= rect.left
    && pointer.x <= rect.right
    && pointer.y >= rect.top
    && pointer.y <= rect.bottom;
}

export function useCropGeometry({
  bounds,
  initialInsets = defaultInsets,
  insets: controlledInsets,
  aspectRatio,
  minSize,
  hotspot,
  onInsetsChange,
}: UseCropGeometryOptions): UseCropGeometryResult {
  const [internalInsets, setInternalInsets] = useState(() =>
    clampCropInsets(initialInsets, bounds, minSize),
  );
  const [activeDrag, setActiveDrag] = useState<CropDragSnapshot | null>(null);
  const currentInsets = controlledInsets ?? internalInsets;
  const clampedInsets = useMemo(
    () => clampCropInsets(currentInsets, bounds, minSize),
    [bounds, currentInsets, minSize],
  );
  const rect = useMemo(
    () => insetsToRect(clampedInsets, bounds),
    [bounds, clampedInsets],
  );

  const updateInsets = useCallback(
    (nextInsets: CropInsets, mode: CropDragMode, handle: CropHandle | null) => {
      const next = clampCropInsets(nextInsets, bounds, minSize);

      if (!controlledInsets) {
        setInternalInsets(next);
      }

      onInsetsChange?.({
        insets: next,
        rect: insetsToRect(next, bounds),
        mode,
        handle,
      });

      return next;
    },
    [bounds, controlledInsets, minSize, onInsetsChange],
  );

  const hitTest = useCallback(
    (pointer: CropPointer) => hitTestCropHandle(pointer, rect, hotspot),
    [hotspot, rect],
  );

  const startDrag = useCallback(
    (pointer: CropPointer, handle?: CropHandle | null) => {
      const nextHandle = handle === undefined ? hitTest(pointer) : handle;

      if (nextHandle === null && !isPointInsideRect(pointer, rect)) {
        return false;
      }

      setActiveDrag({
        pointer,
        insets: clampedInsets,
        handle: nextHandle,
      });

      return true;
    },
    [clampedInsets, hitTest, rect],
  );

  const moveDrag = useCallback(
    (pointer: CropPointer) => {
      if (!activeDrag) {
        return clampedInsets;
      }

      const delta = {
        x: pointer.x - activeDrag.pointer.x,
        y: pointer.y - activeDrag.pointer.y,
      };
      const nextInsets = activeDrag.handle
        ? resizeCropInsets(activeDrag.insets, activeDrag.handle, delta, bounds, {
          aspectRatio,
          minSize,
        })
        : moveCropInsets(activeDrag.insets, delta, bounds, minSize);

      return updateInsets(
        nextInsets,
        activeDrag.handle ? "resize" : "move",
        activeDrag.handle,
      );
    },
    [activeDrag, aspectRatio, bounds, clampedInsets, minSize, updateInsets],
  );

  const endDrag = useCallback(() => {
    setActiveDrag(null);
  }, []);

  const reset = useCallback(
    (nextInsets: CropInsets = initialInsets) => {
      setActiveDrag(null);
      updateInsets(nextInsets, "move", null);
    },
    [initialInsets, updateInsets],
  );

  return {
    insets: clampedInsets,
    rect,
    activeHandle: activeDrag?.handle ?? null,
    isDragging: activeDrag !== null,
    hitTest,
    startDrag,
    moveDrag,
    endDrag,
    reset,
  };
}
