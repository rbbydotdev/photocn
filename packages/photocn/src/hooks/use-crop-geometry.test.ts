import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useCropGeometry,
  type CropDragBounds,
  type CropGeometryChange,
  type CropInsets,
  type UseCropGeometryOptions,
} from "./use-crop-geometry";

const bounds: CropDragBounds = { width: 1000, height: 800 };
const baseInsets: CropInsets = { top: 100, right: 200, bottom: 100, left: 200 };

function renderCropHook(options: Partial<UseCropGeometryOptions> = {}) {
  const onInsetsChange = vi.fn<(change: CropGeometryChange) => void>();

  const hook = renderHook(({ overrides }: { overrides: Partial<UseCropGeometryOptions> }) =>
    useCropGeometry({
      bounds,
      initialInsets: baseInsets,
      onInsetsChange,
      ...overrides,
    }),
  {
    initialProps: { overrides: options },
  });

  return { ...hook, onInsetsChange };
}

describe("useCropGeometry", () => {
  describe("initial state", () => {
    it("derives the rect from initialInsets and bounds", () => {
      const { result } = renderCropHook();

      expect(result.current.insets).toEqual(baseInsets);
      expect(result.current.rect).toEqual({
        top: 100,
        right: 800,
        bottom: 700,
        left: 200,
        width: 600,
        height: 600,
      });
      expect(result.current.activeHandle).toBeNull();
      expect(result.current.isDragging).toBe(false);
    });

    it("falls back to a zero-inset rect when no initialInsets is given", () => {
      const { result } = renderHook(() => useCropGeometry({ bounds }));

      expect(result.current.insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(result.current.rect.width).toBe(bounds.width);
      expect(result.current.rect.height).toBe(bounds.height);
    });
  });

  describe("hitTest", () => {
    it("returns the handle when the pointer is near a corner", () => {
      const { result } = renderCropHook();

      // top-left of the rect is (200, 100); a pointer just inside hits the corner.
      expect(result.current.hitTest({ x: 205, y: 105 })).toBe("top-left");
    });

    it("returns null deep inside the rect", () => {
      const { result } = renderCropHook();

      expect(result.current.hitTest({ x: 500, y: 400 })).toBeNull();
    });
  });

  describe("startDrag", () => {
    it("starts a resize drag when an explicit handle is supplied", () => {
      const { result } = renderCropHook();

      let started = false;
      act(() => {
        started = result.current.startDrag({ x: 800, y: 700 }, "bottom-right");
      });

      expect(started).toBe(true);
      expect(result.current.isDragging).toBe(true);
      expect(result.current.activeHandle).toBe("bottom-right");
    });

    it("auto-detects the handle from a near-edge pointer", () => {
      const { result } = renderCropHook();

      let started = false;
      act(() => {
        started = result.current.startDrag({ x: 205, y: 105 });
      });

      expect(started).toBe(true);
      expect(result.current.activeHandle).toBe("top-left");
    });

    it("starts a move drag (null handle) when pointer is inside the rect", () => {
      const { result } = renderCropHook();

      let started = false;
      act(() => {
        started = result.current.startDrag({ x: 500, y: 400 });
      });

      expect(started).toBe(true);
      expect(result.current.isDragging).toBe(true);
      expect(result.current.activeHandle).toBeNull();
    });

    it("refuses to start when the pointer is outside the rect and no handle was hit", () => {
      const { result } = renderCropHook();

      let started = true;
      act(() => {
        started = result.current.startDrag({ x: 50, y: 50 });
      });

      expect(started).toBe(false);
      expect(result.current.isDragging).toBe(false);
    });
  });

  describe("moveDrag", () => {
    it("moves the rect by the pointer delta when dragging in move mode", () => {
      const { result, onInsetsChange } = renderCropHook();

      act(() => {
        result.current.startDrag({ x: 500, y: 400 }, null);
      });
      act(() => {
        result.current.moveDrag({ x: 550, y: 425 });
      });

      // Move-by-delta: left 200 + 50, top 100 + 25.
      expect(result.current.insets.left).toBe(250);
      expect(result.current.insets.top).toBe(125);
      // Width/height preserved by the move helper.
      expect(result.current.rect.width).toBe(600);
      expect(result.current.rect.height).toBe(600);

      const lastCall = onInsetsChange.mock.calls.at(-1)?.[0];
      expect(lastCall?.mode).toBe("move");
      expect(lastCall?.handle).toBeNull();
    });

    it("resizes the rect when dragging a handle", () => {
      const { result, onInsetsChange } = renderCropHook();

      act(() => {
        result.current.startDrag({ x: 800, y: 700 }, "bottom-right");
      });
      act(() => {
        // Drag inwards (left + up) shrinks the right and bottom of the rect.
        result.current.moveDrag({ x: 700, y: 650 });
      });

      // bottom-right: right inset grows by -delta.x; bottom inset by -delta.y.
      expect(result.current.insets.right).toBe(300);
      expect(result.current.insets.bottom).toBe(150);
      // Other edges unchanged.
      expect(result.current.insets.left).toBe(baseInsets.left);
      expect(result.current.insets.top).toBe(baseInsets.top);

      const lastCall = onInsetsChange.mock.calls.at(-1)?.[0];
      expect(lastCall?.mode).toBe("resize");
      expect(lastCall?.handle).toBe("bottom-right");
    });

    it("returns the current insets and is a no-op when no drag is active", () => {
      const { result, onInsetsChange } = renderCropHook();

      let returned: CropInsets | null = null;
      act(() => {
        returned = result.current.moveDrag({ x: 999, y: 999 });
      });

      expect(returned).toEqual(baseInsets);
      expect(onInsetsChange).not.toHaveBeenCalled();
    });

    it("respects an aspect ratio when resizing a corner", () => {
      const { result } = renderCropHook({ aspectRatio: 2, minSize: 50 });

      act(() => {
        result.current.startDrag({ x: 800, y: 700 }, "bottom-right");
      });
      act(() => {
        result.current.moveDrag({ x: 900, y: 700 });
      });

      const width = bounds.width - result.current.insets.left - result.current.insets.right;
      const height = bounds.height - result.current.insets.top - result.current.insets.bottom;
      expect(width / height).toBeCloseTo(2, 3);
    });

    it("clamps the rect inside bounds even with a giant delta", () => {
      const { result } = renderCropHook();

      act(() => {
        result.current.startDrag({ x: 500, y: 400 }, null);
      });
      act(() => {
        result.current.moveDrag({ x: 99999, y: 99999 });
      });

      // Insets stay within bounds; rect right/bottom can't exceed bounds dimensions.
      expect(result.current.rect.right).toBeLessThanOrEqual(bounds.width);
      expect(result.current.rect.bottom).toBeLessThanOrEqual(bounds.height);
      expect(result.current.insets.left).toBeGreaterThanOrEqual(0);
      expect(result.current.insets.top).toBeGreaterThanOrEqual(0);
    });
  });

  describe("endDrag", () => {
    it("clears active drag state without touching the insets", () => {
      const { result } = renderCropHook();

      act(() => {
        result.current.startDrag({ x: 800, y: 700 }, "bottom-right");
      });
      act(() => {
        result.current.moveDrag({ x: 750, y: 650 });
      });
      const insetsDuringDrag = result.current.insets;

      act(() => {
        result.current.endDrag();
      });

      expect(result.current.isDragging).toBe(false);
      expect(result.current.activeHandle).toBeNull();
      expect(result.current.insets).toEqual(insetsDuringDrag);
    });
  });

  describe("reset", () => {
    it("returns to initialInsets and ends any active drag", () => {
      const { result, onInsetsChange } = renderCropHook();

      act(() => {
        result.current.startDrag({ x: 800, y: 700 }, "bottom-right");
      });
      act(() => {
        result.current.moveDrag({ x: 750, y: 650 });
      });
      expect(result.current.isDragging).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.isDragging).toBe(false);
      expect(result.current.insets).toEqual(baseInsets);

      const lastCall = onInsetsChange.mock.calls.at(-1)?.[0];
      expect(lastCall?.mode).toBe("move");
      expect(lastCall?.handle).toBeNull();
    });

    it("accepts an explicit nextInsets argument", () => {
      const { result } = renderCropHook();
      const target: CropInsets = { top: 50, right: 50, bottom: 50, left: 50 };

      act(() => {
        result.current.reset(target);
      });

      expect(result.current.insets).toEqual(target);
    });
  });
});
