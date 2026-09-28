import { describe, expect, it } from "vitest";
import { rotationScaleForBounds, viewCropToImageCrop } from "./geometry";

describe("viewCropToImageCrop", () => {
  it("scales view-space rect into image-space pixels", () => {
    const result = viewCropToImageCrop(
      { left: 10, top: 5, width: 50, height: 25 },
      { width: 100, height: 100 },
      { width: 1000, height: 800 },
    );
    expect(result).toEqual({ left: 100, top: 40, width: 500, height: 200 });
  });

  it("rounds to integer pixels", () => {
    const result = viewCropToImageCrop(
      { left: 0, top: 0, width: 33.333, height: 33.333 },
      { width: 100, height: 100 },
      { width: 999, height: 999 },
    );
    expect(Number.isInteger(result.left)).toBe(true);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(result.width).toBeCloseTo(333, 0);
  });
});

describe("rotationScaleForBounds", () => {
  it("returns 0 at 0 degrees", () => {
    expect(rotationScaleForBounds({ width: 800, height: 600 }, 0)).toBeCloseTo(0);
  });

  it("returns a positive scale-up factor when rotated", () => {
    expect(rotationScaleForBounds({ width: 800, height: 600 }, 30)).toBeGreaterThan(0);
  });

  it("is symmetric in sign of the angle", () => {
    const a = rotationScaleForBounds({ width: 800, height: 600 }, 25);
    const b = rotationScaleForBounds({ width: 800, height: 600 }, -25);
    expect(a).toBeCloseTo(b);
  });

  it("returns 0 at a quarter turn for square bounds (rotation fits exactly)", () => {
    expect(rotationScaleForBounds({ width: 500, height: 500 }, 90)).toBeCloseTo(0);
  });
});
