import { describe, expect, it } from "vitest";

import {
  apply,
  composeMatrix,
  createGeometry,
  cropForAspectRatio,
  effectiveCrop,
  flipGeometry,
  homography,
  imagePolygon,
  orientedSize,
  outputPixelSize,
  rectInsidePolygon,
  rotateGeometry,
  setCornerTarget,
  sourceToCanvas,
  type GeometryParams,
  type Quad,
  type Vec2,
} from "./compose";

const source = { width: 3000, height: 2000 };
const full = { x: 0, y: 0, width: 1, height: 1 };
const g = (patch: Partial<GeometryParams> = {}): GeometryParams => ({ ...createGeometry(), ...patch });

const close = (a: Vec2, b: Vec2, digits = 6) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

const samples: Vec2[] = [
  [0.1, 0.2],
  [0.5, 0.5],
  [0.9, 0.35],
  [0.3, 0.8],
];

const warped = g({
  quarterTurns: 1,
  flipX: true,
  straighten: 7,
  perspectiveX: 0.2,
  perspectiveY: -0.3,
  crop: { x: 0.2, y: 0.25, width: 0.5, height: 0.4 },
});

describe("composeMatrix", () => {
  it("is the identity for default geometry", () => {
    const m = composeMatrix(g(), source, full);
    for (const p of samples) close(apply(m, p), p);
  });

  it("maps output corners for a clockwise quarter turn", () => {
    const m = composeMatrix(g({ quarterTurns: 1 }), source, full);
    close(apply(m, [0, 0]), [0, 1]); // top-left shows the source's bottom-left
    close(apply(m, [1, 0]), [0, 0]);
    close(apply(m, [1, 1]), [1, 0]);
  });

  it("mirrors with flipX", () => {
    const m = composeMatrix(g({ flipX: true }), source, full);
    close(apply(m, [0, 0]), [1, 0]);
    close(apply(m, [0.25, 0.5]), [0.75, 0.5]);
  });

  it("maps a crop window onto its part of the source", () => {
    const rect = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
    const m = composeMatrix(g(), source, rect);
    close(apply(m, [0, 0]), [0.5, 0.5]);
    close(apply(m, [1, 1]), [1, 1]);
  });

  it("inverts sourceToCanvas for any geometry", () => {
    const rect = effectiveCrop(warped, source);
    const m = composeMatrix(warped, source, rect);
    for (const uv of samples) {
      const c = sourceToCanvas(warped, source, uv);
      const st: Vec2 = [(c[0] - rect.x) / rect.width, (c[1] - rect.y) / rect.height];
      close(apply(m, st), uv, 5);
    }
  });
});

describe("output size", () => {
  it("swaps dimensions on a quarter turn", () => {
    expect(orientedSize(source, { quarterTurns: 1 })).toEqual({ width: 2000, height: 3000 });
    expect(outputPixelSize(g({ quarterTurns: 3 }), source, full)).toEqual({ width: 2000, height: 3000 });
  });

  it("follows the crop", () => {
    expect(outputPixelSize(g(), source, { x: 0, y: 0, width: 0.5, height: 0.25 })).toEqual({
      width: 1500,
      height: 500,
    });
  });
});

describe("limit to image", () => {
  it("renders everything when nothing is warped or cropped", () => {
    expect(effectiveCrop(g(), source)).toEqual(full);
  });

  it("shrinks the crop about its center to hide empty corners, keeping the ratio", () => {
    const straight = g({ straighten: 10 });
    const crop = effectiveCrop(straight, source);
    expect(crop.width).toBeLessThan(1);
    expect(crop.x + crop.width / 2).toBeCloseTo(0.5, 5);
    expect(crop.y + crop.height / 2).toBeCloseTo(0.5, 5);
    expect((crop.width * 3000) / (crop.height * 2000)).toBeCloseTo(1.5, 3);
    expect(rectInsidePolygon(crop, imagePolygon(straight, source), orientedSize(source, straight))).toBe(true);
  });

  it("keeps the user's crop as intent: straightening back restores it", () => {
    const userCrop = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
    const tilted = effectiveCrop(g({ crop: userCrop, straighten: 20 }), source);
    expect(tilted.width).toBeLessThan(userCrop.width);
    expect(effectiveCrop(g({ crop: userCrop }), source)).toEqual(userCrop);
  });

  it("keeps keystoned crops inside the image", () => {
    const k = g({ perspectiveY: 0.8, perspectiveX: -0.5 });
    const crop = effectiveCrop(k, source);
    expect(rectInsidePolygon(crop, imagePolygon(k, source), orientedSize(source, k))).toBe(true);
  });
});

describe("display-side turns and flips", () => {
  const G_CW = (p: Vec2): Vec2 => [0.5 - (p[1] - 0.5), 0.5 + (p[0] - 0.5)];

  it("rotating turns the whole picture, warp included", () => {
    const turned = rotateGeometry(warped, 1);
    for (const uv of samples) {
      close(sourceToCanvas(turned, source, uv), G_CW(sourceToCanvas(warped, source, uv)), 6);
    }
  });

  it("rotates the crop with the picture and flips the ratio", () => {
    const withRatio = { ...warped, aspectRatio: 4 / 5 };
    const turned = rotateGeometry(withRatio, 1);
    expect(turned.aspectRatio).toBeCloseTo(5 / 4);
    const c = warped.crop!;
    const t = turned.crop!;
    expect(t.width).toBeCloseTo(c.height);
    expect(t.height).toBeCloseTo(c.width);
  });

  it("four turns (or a turn and back) are the identity", () => {
    let r = warped;
    for (let i = 0; i < 4; i++) r = rotateGeometry(r, 1);
    expect(r.quarterTurns).toBe(warped.quarterTurns);
    expect(r.flipX).toBe(warped.flipX);
    expect(r.straighten).toBeCloseTo(warped.straighten);
    expect(r.perspectiveX).toBeCloseTo(warped.perspectiveX);
    expect(r.perspectiveY).toBeCloseTo(warped.perspectiveY);
    expect(rotateGeometry(rotateGeometry(warped, 1), -1).crop!.x).toBeCloseTo(warped.crop!.x);
  });

  it("flipping mirrors what you see and negates straighten", () => {
    const flipped = flipGeometry(warped, "horizontal");
    expect(flipped.straighten).toBeCloseTo(-warped.straighten);
    for (const uv of samples) {
      const before = sourceToCanvas(warped, source, uv);
      close(sourceToCanvas(flipped, source, uv), [1 - before[0], before[1]], 6);
    }
    const twice = flipGeometry(flipGeometry(warped, "vertical"), "vertical");
    expect(twice.quarterTurns).toBe(warped.quarterTurns);
    expect(twice.flipX).toBe(warped.flipX);
  });

  it("turns advanced corners with the picture", () => {
    const cornered = setCornerTarget(g(), source, 0, [0.1, 0.05]);
    const turned = rotateGeometry(cornered, 1);
    for (const uv of samples) {
      close(sourceToCanvas(turned, source, uv), G_CW(sourceToCanvas(cornered, source, uv)), 6);
    }
  });
});

describe("corners and ratios", () => {
  it("homography maps quad onto quad", () => {
    const from: Quad = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const to: Quad = [[0.1, 0], [0.9, 0.1], [1, 1], [0, 0.8]];
    const h = homography(from, to);
    from.forEach((p, i) => close(apply(h, p), to[i]));
  });

  it("puts a dragged corner exactly under the pointer, even with straighten/keystone", () => {
    const base = g({ straighten: 5, perspectiveY: 0.3 });
    const moved = setCornerTarget(base, source, 2, [0.85, 0.9]);
    close(imagePolygon(moved, source)[2], [0.85, 0.9], 6);
  });

  it("aspect presets produce that pixel ratio inside the image", () => {
    const square = cropForAspectRatio(g({ straighten: 3 }), source, 1);
    const crop = square.crop!;
    expect((crop.width * 3000) / (crop.height * 2000)).toBeCloseTo(1, 3);
    expect(rectInsidePolygon(crop, imagePolygon(square, source), orientedSize(source, square))).toBe(true);
  });
});
