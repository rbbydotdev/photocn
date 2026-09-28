import { describe, expect, it } from "vitest";
import {
  canvasSizeForAngle,
  cropAspectPresetIndexForLabel,
  cropAspectPresetLabels,
  defaultCropAspectPresetValues,
  imageAspectRatio,
  inverseAspectRatio,
  isCanvasAngleQuarterTurn,
  normalizeCanvasAngle,
  resolveCropAspectPresetValues,
  resolveCropAspectRatio,
  resolveImageAspectRatios,
  rotateCanvasAngle,
  resizeDimensionsFromHeight,
  resizeDimensionsFromWidth,
  resizePercent,
} from "./composition";

describe("imageAspectRatio", () => {
  it("returns width / height for valid sizes", () => {
    expect(imageAspectRatio({ width: 1600, height: 900 })).toBeCloseTo(16 / 9);
  });

  it("returns 0 for non-positive or non-finite dimensions", () => {
    expect(imageAspectRatio({ width: 0, height: 100 })).toBe(0);
    expect(imageAspectRatio({ width: 100, height: 0 })).toBe(0);
    expect(imageAspectRatio({ width: NaN, height: 100 })).toBe(0);
  });
});

describe("inverseAspectRatio", () => {
  it("inverts a positive ratio", () => {
    expect(inverseAspectRatio(2)).toBe(0.5);
  });

  it("returns 0 for invalid ratios", () => {
    expect(inverseAspectRatio(0)).toBe(0);
    expect(inverseAspectRatio(-1)).toBe(0);
    expect(inverseAspectRatio(NaN)).toBe(0);
  });
});

describe("resolveImageAspectRatios", () => {
  it("derives both ratios from a Size", () => {
    const result = resolveImageAspectRatios({ width: 800, height: 400 });
    expect(result.aspectRatio).toBe(2);
    expect(result.inverseAspectRatio).toBe(0.5);
  });

  it("accepts a number directly", () => {
    expect(resolveImageAspectRatios(1.5)).toEqual({
      aspectRatio: 1.5,
      inverseAspectRatio: 1 / 1.5,
    });
  });
});

describe("crop aspect presets", () => {
  it("indexes labels by position", () => {
    expect(cropAspectPresetIndexForLabel("free")).toBe(0);
    expect(cropAspectPresetIndexForLabel("1:1")).toBe(3);
    expect(cropAspectPresetIndexForLabel("16:9")).toBe(5);
  });

  it("resolves preset values for a given image size", () => {
    const values = resolveCropAspectPresetValues({ width: 1600, height: 800 });
    expect(values[0]).toBe(0);
    expect(values[1]).toBe(2);
    expect(values[2]).toBe(0.5);
    expect(values.slice(3)).toEqual(defaultCropAspectPresetValues.slice(3));
  });

  it("resolves the ratio by label or by index", () => {
    expect(resolveCropAspectRatio("1:1")).toBe(1);
    expect(resolveCropAspectRatio("4:3")).toBeCloseTo(4 / 3);
    expect(resolveCropAspectRatio(5)).toBe(16 / 9);
  });

  it("treats out-of-range indices as 'free'", () => {
    expect(resolveCropAspectRatio(99)).toBe(0);
    expect(resolveCropAspectRatio(-1)).toBe(0);
  });

  it("exposes a stable label order", () => {
    expect(cropAspectPresetLabels).toEqual([
      "free",
      "pic",
      "1:pic",
      "1:1",
      "4:3",
      "16:9",
      "3:4",
      "9:16",
    ]);
  });
});

describe("resize helpers", () => {
  it("derives height from width and aspect ratio", () => {
    expect(resizeDimensionsFromWidth(1600, 16 / 9)).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it("derives width from height and aspect ratio", () => {
    expect(resizeDimensionsFromHeight(900, 16 / 9)).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it("respects the minimum dimension", () => {
    expect(resizeDimensionsFromWidth(10, 1, 100)).toEqual({ width: 100, height: 100 });
    expect(resizeDimensionsFromHeight(10, 1, 100)).toEqual({ width: 100, height: 100 });
  });

  it("falls back to the min dimension when the aspect ratio is invalid", () => {
    expect(resizeDimensionsFromWidth(800, 0)).toEqual({ width: 800, height: 100 });
  });
});

describe("resizePercent", () => {
  it("returns one-decimal percent of the original width", () => {
    expect(resizePercent(800, 1600)).toBe(50);
    expect(resizePercent(1234, 1000)).toBe(123.4);
  });

  it("returns 0 for an invalid original", () => {
    expect(resizePercent(800, 0)).toBe(0);
  });
});

describe("canvas angle helpers", () => {
  it("normalises any angle into [0, 360)", () => {
    expect(normalizeCanvasAngle(0)).toBe(0);
    expect(normalizeCanvasAngle(360)).toBe(0);
    expect(normalizeCanvasAngle(450)).toBe(90);
    expect(normalizeCanvasAngle(-90)).toBe(270);
  });

  it("rotates by a delta", () => {
    expect(rotateCanvasAngle(90, 90)).toBe(180);
    expect(rotateCanvasAngle(270, 90)).toBe(0);
    expect(rotateCanvasAngle(0, -90)).toBe(270);
  });

  it("identifies quarter turns", () => {
    expect(isCanvasAngleQuarterTurn(0)).toBe(false);
    expect(isCanvasAngleQuarterTurn(90)).toBe(true);
    expect(isCanvasAngleQuarterTurn(180)).toBe(false);
    expect(isCanvasAngleQuarterTurn(270)).toBe(true);
  });

  it("swaps width and height on a quarter turn", () => {
    const size = { width: 800, height: 600 };
    expect(canvasSizeForAngle(size, 90)).toEqual({ width: 600, height: 800 });
    expect(canvasSizeForAngle(size, 180)).toEqual({ width: 800, height: 600 });
  });
});
