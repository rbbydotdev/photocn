import { describe, expect, it } from "vitest";

import { effectiveCrop, imagePolygon, sourceToCanvas } from "./compose";
import { createEditorParams } from "./editor-params";
import { isLegacyEditorParams, normalizeEditorParams } from "./legacy";

const sourceSize = { width: 3000, height: 2000 };

// Shape of params saved by the previous editor.
const legacyBase = () => ({
  trs: { translateX: 0, translateY: 0, angle: 0, scale: 0, flipv: 0, fliph: 0 },
  crop: { currentcrop: 0, glcrop: 0, appliedCrop: 0 as const, canvas_angle: 0, ar: 0, arindex: 0 },
  lights: { brightness: 0, exposure: 0.4, gamma: 0, contrast: 0, shadows: 0, highlights: 0, bloom: 0 },
  perspective: { quad: 0, modified: 0 },
  perspective2: { before: 0 as const, after: 0 as const, modified: 0 },
  resizer: { width: 0, height: 0 },
});

describe("normalizeEditorParams", () => {
  it("passes current params through untouched", () => {
    const params = createEditorParams();
    params.geometry = { ...params.geometry, straighten: 3 };
    const result = normalizeEditorParams(params);
    expect(result.migrated).toBe(false);
    expect(result.params.geometry.straighten).toBe(3);
    expect(isLegacyEditorParams(params)).toBe(false);
  });

  it("keeps non-geometry sections of legacy params", () => {
    const result = normalizeEditorParams(legacyBase());
    expect(result.migrated).toBe(true);
    expect(result.params.lights.exposure).toBe(0.4);
    expect(result.params).not.toHaveProperty("trs");
    expect(result.params.geometry.quarterTurns).toBe(0);
  });

  it("folds canvas turns and the rotate slider into quarter turns + straighten", () => {
    const legacy = legacyBase();
    legacy.crop.canvas_angle = 90;
    legacy.trs.angle = 100; // 190° total = 2 turns + 10°
    const { geometry } = normalizeEditorParams(legacy).params;
    expect(geometry.quarterTurns).toBe(2);
    expect(geometry.straighten).toBeCloseTo(10);
  });

  it("maps flips (vertical = horizontal + half turn)", () => {
    const legacy = legacyBase();
    legacy.trs.flipv = 1;
    const { geometry } = normalizeEditorParams(legacy).params;
    // Top of the source ends up at the bottom, left stays left.
    const top = sourceToCanvas(geometry, sourceSize, [0.2, 0]);
    expect(top[0]).toBeCloseTo(0.2);
    expect(top[1]).toBeCloseTo(1);
  });

  it("converts a pixel crop once the source size is known", () => {
    const legacy = legacyBase();
    legacy.crop.appliedCrop = { left: 300, top: 200, width: 1500, height: 1000 } as never;
    const pending = normalizeEditorParams(legacy);
    expect(pending.needsSourceSize).toBe(true);
    expect(pending.params.geometry.crop).toBeNull();

    const { params } = normalizeEditorParams(legacy, { sourceSize });
    const crop = params.geometry.crop!;
    expect(crop.x).toBeCloseTo(0.1);
    expect(crop.y).toBeCloseTo(0.1);
    expect(crop.width).toBeCloseTo(0.5);
    expect(crop.height).toBeCloseTo(0.5);
  });

  it("turns the old zoom into a smaller centered crop", () => {
    const legacy = legacyBase();
    legacy.trs.scale = 1; // 200%
    const crop = normalizeEditorParams(legacy).params.geometry.crop!;
    expect(crop.width).toBeCloseTo(0.5);
    expect(crop.x).toBeCloseTo(0.25);
  });

  it("turns before/after perspective quads into corners", () => {
    const legacy = legacyBase() as ReturnType<typeof legacyBase> & {
      perspective2: { before: unknown; after: unknown };
    };
    legacy.perspective2 = {
      before: [[0, 0], [1, 0], [1, 1], [0, 1]],
      after: [[0.1, 0], [0.9, 0], [1, 1], [0, 1]],
      modified: 1,
    } as never;
    const { geometry } = normalizeEditorParams(legacy).params;
    const polygon = imagePolygon(geometry, sourceSize);
    expect(polygon[0][0]).toBeCloseTo(0.1);
    expect(polygon[1][0]).toBeCloseTo(0.9);
    // Limit-to-image keeps the rendered crop inside the keystoned shape.
    expect(effectiveCrop(geometry, sourceSize).width).toBeLessThan(1);
  });

  it("reports the old resizer as an output size", () => {
    const legacy = legacyBase();
    legacy.resizer = { width: 1200, height: 800 };
    expect(normalizeEditorParams(legacy).outputSize).toEqual({ width: 1200, height: 800 });
  });
});
