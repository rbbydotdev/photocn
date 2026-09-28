import { describe, expect, it } from "vitest";
import {
  clampCropInsets,
  hitTestCropHandle,
  moveCropInsets,
  resizeCropInsets,
  type CropDragBounds,
  type CropInsets,
  type CropRect,
} from "./crop-geometry";

const bounds: CropDragBounds = { width: 1000, height: 800 };

function rect(left: number, top: number, width: number, height: number): CropRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

describe("hitTestCropHandle", () => {
  const fullRect = rect(100, 100, 600, 400);

  it("hits top-left corner when pointer is near both edges", () => {
    expect(hitTestCropHandle({ x: 105, y: 105 }, fullRect)).toBe("top-left");
  });

  it("hits bottom-right corner", () => {
    expect(hitTestCropHandle({ x: 695, y: 495 }, fullRect)).toBe("bottom-right");
  });

  it("hits a single edge when only one side is in the hotspot", () => {
    expect(hitTestCropHandle({ x: 400, y: 110 }, fullRect)).toBe("top");
    expect(hitTestCropHandle({ x: 110, y: 300 }, fullRect)).toBe("left");
  });

  it("returns null when pointer is well inside the rect", () => {
    expect(hitTestCropHandle({ x: 400, y: 300 }, fullRect)).toBeNull();
  });

  it("respects a custom hotspot size", () => {
    // With a small hotspot, the same near-edge point no longer counts.
    expect(hitTestCropHandle({ x: 130, y: 110 }, fullRect, 5)).toBeNull();
  });
});

describe("clampCropInsets", () => {
  it("never lets opposite insets eat into the min size", () => {
    const insets: CropInsets = { top: 0, right: 0, bottom: 0, left: 950 };
    const clamped = clampCropInsets(insets, bounds, 100);
    // bounds.width 1000 - left 900 (max) leaves 100 for the crop, matching minSize.
    expect(clamped.left).toBe(900);
    expect(bounds.width - clamped.left - clamped.right).toBeGreaterThanOrEqual(100);
  });

  it("clamps negative insets to zero", () => {
    const clamped = clampCropInsets(
      { top: -50, right: -10, bottom: -1, left: -100 },
      bounds,
    );
    expect(clamped).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("collapses gracefully when minSize exceeds bounds", () => {
    const tiny: CropDragBounds = { width: 50, height: 50 };
    const clamped = clampCropInsets({ top: 0, right: 0, bottom: 0, left: 0 }, tiny, 100);
    expect(clamped).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe("moveCropInsets", () => {
  const baseInsets: CropInsets = { top: 100, right: 200, bottom: 100, left: 200 };

  it("translates the crop by the delta", () => {
    const moved = moveCropInsets(baseInsets, { x: 50, y: 25 }, bounds);
    expect(moved.left).toBe(250);
    expect(moved.right).toBe(150);
    expect(moved.top).toBe(125);
    expect(moved.bottom).toBe(75);
  });

  it("preserves the crop size", () => {
    const moved = moveCropInsets(baseInsets, { x: 9999, y: -9999 }, bounds);
    const beforeWidth = bounds.width - baseInsets.left - baseInsets.right;
    const beforeHeight = bounds.height - baseInsets.top - baseInsets.bottom;
    const afterWidth = bounds.width - moved.left - moved.right;
    const afterHeight = bounds.height - moved.top - moved.bottom;
    expect(afterWidth).toBe(beforeWidth);
    expect(afterHeight).toBe(beforeHeight);
  });

  it("clamps motion to the bounds", () => {
    const moved = moveCropInsets(baseInsets, { x: 9999, y: 9999 }, bounds);
    expect(moved.left).toBe(bounds.width - (bounds.width - baseInsets.left - baseInsets.right));
    expect(moved.right).toBe(0);
    expect(moved.bottom).toBe(0);
  });
});

describe("resizeCropInsets — freeform", () => {
  const baseInsets: CropInsets = { top: 100, right: 200, bottom: 100, left: 200 };

  it("shrinks from the right edge when dragging left", () => {
    const next = resizeCropInsets(baseInsets, "right", { x: -100, y: 0 }, bounds);
    expect(next.right).toBe(300);
    expect(next.left).toBe(baseInsets.left);
  });

  it("grows the bottom edge when dragging down", () => {
    const next = resizeCropInsets(baseInsets, "bottom", { x: 0, y: 50 }, bounds);
    expect(next.bottom).toBe(50);
  });

  it("respects minSize on edge resize", () => {
    const next = resizeCropInsets(
      baseInsets,
      "right",
      { x: 9999, y: 0 },
      bounds,
      { minSize: 100 },
    );
    // left 200 + width 100 = 300, so right inset must be at most width-300 = 700.
    expect(next.right).toBeLessThanOrEqual(700);
  });

  it("moves both adjacent edges on a corner", () => {
    const next = resizeCropInsets(
      baseInsets,
      "top-left",
      { x: 30, y: 40 },
      bounds,
    );
    expect(next.left).toBe(230);
    expect(next.top).toBe(140);
    expect(next.right).toBe(baseInsets.right);
    expect(next.bottom).toBe(baseInsets.bottom);
  });
});

describe("resizeCropInsets — locked aspect", () => {
  const baseInsets: CropInsets = { top: 100, right: 100, bottom: 100, left: 100 };

  it("maintains the aspect ratio when dragging a corner", () => {
    const next = resizeCropInsets(
      baseInsets,
      "bottom-right",
      { x: 100, y: 0 },
      bounds,
      { aspectRatio: 2, minSize: 50 },
    );
    const width = bounds.width - next.left - next.right;
    const height = bounds.height - next.top - next.bottom;
    expect(width / height).toBeCloseTo(2, 3);
  });

  it("ignores invalid aspect ratios and falls back to freeform", () => {
    const free = resizeCropInsets(
      baseInsets,
      "right",
      { x: 50, y: 0 },
      bounds,
      { aspectRatio: NaN },
    );
    // Freeform: top/bottom unchanged.
    expect(free.top).toBe(baseInsets.top);
    expect(free.bottom).toBe(baseInsets.bottom);
  });
});
