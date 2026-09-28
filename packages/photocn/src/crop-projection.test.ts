import { describe, expect, it } from "vitest";

import { cropBoxesEqual, stageRectToImageRect } from "./crop-projection";

describe("stageRectToImageRect", () => {
  it("matches stage and image 1:1 when aspect ratios are identical", () => {
    // Square stage, square image: stage-percent maps directly to image-pixels.
    const result = stageRectToImageRect(
      { x: 25, y: 25, width: 50, height: 50 },
      { width: 400, height: 400 },
      { width: 800, height: 800 },
    );
    expect(result).toEqual({ left: 200, top: 200, width: 400, height: 400 });
  });

  it("clamps to image bounds when crop covers the full stage", () => {
    const result = stageRectToImageRect(
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 400, height: 400 },
      { width: 1280, height: 720 },
    );
    // Wide image is letterboxed top/bottom inside the square stage; cropping
    // the entire stage should still come out as the entire image.
    expect(result).toEqual({ left: 0, top: 0, width: 1280, height: 720 });
  });

  it("ignores letterbox bands when image is wider than stage (top/bottom letterbox)", () => {
    // Square stage (400×400), wide image (1280×720). Image displays as 400×225,
    // letterboxed (87.5px top, 87.5px bottom). The user draws a crop in the
    // *middle band* — only the part overlapping the image counts.
    const stage = { width: 400, height: 400 };
    const image = { width: 1280, height: 720 };
    // Crop the right half of the image: stage-percent x=50, full height.
    // Image display rect inside stage: x=0..400, y=87.5..312.5 (height 225).
    // Only the y∈[87.5, 312.5] band is image; outside is letterbox.
    const result = stageRectToImageRect(
      { x: 50, y: 0, width: 50, height: 100 },
      stage,
      image,
    );
    // Right half of image: left=640, top=0, width=640, height=720.
    expect(result).toEqual({ left: 640, top: 0, width: 640, height: 720 });
  });

  it("ignores letterbox bands when image is taller than stage (left/right letterbox)", () => {
    // Wide stage (800×400), tall image (400×800). Image displays as 200×400
    // centered (left letterbox 300px, right letterbox 300px).
    const stage = { width: 800, height: 400 };
    const image = { width: 400, height: 800 };
    // Crop the central image strip exactly: stage-percent x=37.5, width=25.
    // 37.5% of 800 = 300px (image left edge); 25% of 800 = 200px (image width).
    const result = stageRectToImageRect(
      { x: 37.5, y: 0, width: 25, height: 100 },
      stage,
      image,
    );
    expect(result).toEqual({ left: 0, top: 0, width: 400, height: 800 });
  });

  it("clamps a crop drawn entirely inside the letterbox band to the image edge", () => {
    // Wide stage (800×400), tall image (400×800). Image displays at x=300..500.
    // User draws a crop entirely in the left letterbox (x=0..200) — should be
    // clamped to the image's left edge with minimal width.
    const stage = { width: 800, height: 400 };
    const image = { width: 400, height: 800 };
    const result = stageRectToImageRect(
      { x: 0, y: 0, width: 25, height: 100 },
      stage,
      image,
    );
    // Crop ends at stage-x=200, image starts at stage-x=300 — no overlap.
    expect(result).toBeNull();
  });

  it("returns null for degenerate inputs", () => {
    expect(
      stageRectToImageRect(
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 0, height: 0 },
        { width: 800, height: 600 },
      ),
    ).toBeNull();
    expect(
      stageRectToImageRect(
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 400, height: 400 },
        { width: 0, height: 0 },
      ),
    ).toBeNull();
  });

  it("regression: a centered 50% stage-crop on a wide image picks the centered image region (the bug)", () => {
    // This test pins down the exact bug the user reported. Before the fix,
    // `cropRectToImageCrop` mapped stage-percent directly to image pixels,
    // which means a 50% stage-crop translated to a 50% image crop *measured
    // from the stage origin*, not the image origin — producing a result that
    // did not match what the user saw bounded.
    //
    // With the fix, the same overlay should land on the centered image region.
    const stage = { width: 600, height: 600 };
    const image = { width: 1200, height: 800 };
    // Image display: width=600 (fills stage width), height=400, top letterbox
    // = (600-400)/2 = 100, bottom letterbox = 100.
    // Crop the central 50% of the stage: x=25..75, y=25..75.
    // In stage pixels: 150..450 horizontally, 150..450 vertically.
    // Image display rect: y=100..500. Intersection: y=150..450 (full overlap).
    // → image pixels: x=300..900 (50% width), y=100..700 — wait let me recompute.
    // Actually: scale = imageWidth / displayW = 1200/600 = 2.
    // Image-pixel left = (150 - 0) * 2 = 300.
    // Image-pixel top = (150 - 100) * 2 = 100.
    // Image-pixel width = (300) * 2 = 600.
    // Image-pixel height = (300) * 2 = 600.
    const result = stageRectToImageRect(
      { x: 25, y: 25, width: 50, height: 50 },
      stage,
      image,
    );
    expect(result).toEqual({ left: 300, top: 100, width: 600, height: 600 });
  });
});

describe("cropBoxesEqual", () => {
  it("treats two null/undefined inputs as equal", () => {
    expect(cropBoxesEqual(null, null)).toBe(true);
    expect(cropBoxesEqual(undefined, undefined)).toBe(true);
    expect(cropBoxesEqual(null, undefined)).toBe(true);
  });

  it("treats one null/undefined and one box as different", () => {
    expect(cropBoxesEqual(null, { left: 0, top: 0, width: 1, height: 1 })).toBe(false);
    expect(cropBoxesEqual({ left: 0, top: 0, width: 1, height: 1 }, null)).toBe(false);
  });

  it("compares all four fields", () => {
    const a = { left: 10, top: 20, width: 100, height: 200 };
    expect(cropBoxesEqual(a, { ...a })).toBe(true);
    expect(cropBoxesEqual(a, { ...a, left: 11 })).toBe(false);
    expect(cropBoxesEqual(a, { ...a, top: 21 })).toBe(false);
    expect(cropBoxesEqual(a, { ...a, width: 101 })).toBe(false);
    expect(cropBoxesEqual(a, { ...a, height: 201 })).toBe(false);
  });
});
