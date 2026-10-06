import { afterEach, describe, expect, it, vi } from "vitest";

import { createMatrixPreset } from "../filters";

const rendered: Array<{ outputSize: unknown; view: unknown; exposure: number }> = [];

// No WebGL in happy-dom: stand in a renderer that records what it was asked
// to draw, and a capture that returns a blob of the requested size.
vi.mock("../dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../dom")>();
  let size = { width: 0, height: 0 };
  const renderer = {
    width: 0,
    height: 0,
    loadGeometry: (spec: { outputSize: { width: number; height: number } | null; view: unknown }) => {
      size = spec.outputSize ?? { width: 400, height: 200 };
      rendered.push({ outputSize: spec.outputSize, view: spec.view, exposure: NaN });
    },
    filterAdjustments: (params: { exposure?: number }) => {
      rendered[rendered.length - 1]!.exposure = params.exposure ?? 0;
    },
    filterBlend: () => {},
    filterBloom: () => {},
    filterNoise: () => {},
    filterHighlightsShadows: () => {},
    filterCurves: () => {},
    filterInsta: () => {},
    filterBlurBokeh: () => {},
    filterBlurGaussian: () => {},
    paintCanvas: () => {},
    readPixels: () => new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
  };
  return {
    ...actual,
    createMiniGlEditor: () => ({ renderer, dispose: () => {} }),
    captureRendererBlob: async (_renderer: unknown, options: { format?: string }) => ({
      blob: new Blob(["x"], { type: `image/${options.format}` }),
      type: `image/${options.format}`,
      ...size,
    }),
  };
});

const { Photo } = await import("./index");

const image = { naturalWidth: 400, naturalHeight: 200, width: 400, height: 200 } as HTMLImageElement;
const kodak = createMatrixPreset("kodak", "kodachrome");
const photos: InstanceType<typeof Photo>[] = [];
const create = (options: ConstructorParameters<typeof Photo>[3] = {}) => {
  const photo = new Photo(image, "beach.jpg", undefined, { filterPresets: [kodak], ...options });
  photos.push(photo);
  return photo;
};

afterEach(() => {
  photos.splice(0).forEach((photo) => photo.dispose());
  rendered.length = 0;
});

describe("Photo", () => {
  it("chains edits and undoes them one at a time", () => {
    const photo = create();
    photo.adjust({ exposure: 0.4, saturation: -1, vignette: 2 }).rotate(1);
    expect(photo.params.lights.exposure).toBe(0.4);
    expect(photo.params.colors.saturation).toBe(-1);
    expect(photo.params.effects.vignette).toBe(1);
    expect(photo.geometry.quarterTurns).toBe(1);
    expect(photo.outputSize).toEqual({ width: 200, height: 400 });

    photo.undo();
    expect(photo.geometry.quarterTurns).toBe(0);
    photo.undo();
    expect(photo.params.lights.exposure).toBe(0);
    expect(photo.canUndo).toBe(false);
    photo.redo();
    expect(photo.params.lights.exposure).toBe(0.4);
    expect(photo.canRedo).toBe(true);
  });

  it("rejects unknown adjustments and filters", () => {
    const photo = create();
    expect(() => photo.adjust({ sharpness: 1 } as never)).toThrow(/Unknown adjustment/);
    expect(() => photo.filter("nope")).toThrow(/Unknown filter/);
  });

  it("applies a filter once it loads, at the given strength", async () => {
    const photo = create();
    const changes = vi.fn();
    photo.subscribe(changes);
    photo.filter("kodak", 0.25);
    expect(photo.filterValue.label).toBeNull();
    await photo.ready();
    expect(photo.filterValue).toEqual({ label: "kodak", strength: 0.25 });
    expect(changes).toHaveBeenCalledTimes(1);
    photo.filter(null);
    expect(photo.filterValue.label).toBeNull();
  });

  it("locks the crop to a ratio and straightens inside the image", () => {
    const photo = create();
    photo.aspectRatio("1:1");
    expect(photo.outputSize).toEqual({ width: 200, height: 200 });
    photo.aspectRatio(null).straighten(90);
    expect(photo.geometry.straighten).toBe(45);
    photo.crop({ x: 0, y: 0, width: 0.5, height: 1 });
    expect(photo.outputSize.width).toBeLessThanOrEqual(200);
  });

  it("round-trips params and recipes", async () => {
    const source = create().adjust({ contrast: 0.3 }).filter("kodak");
    await source.ready();
    const recipe = source.recipe!;
    expect(recipe).toMatchObject({ lights: { contrast: 0.3 }, filters: { label: "kodak" } });

    const copy = create({ params: source.params });
    expect(copy.params.lights.contrast).toBe(0.3);

    const fresh = create();
    await fresh.applyRecipe(recipe);
    expect(fresh.filterValue.label).toBe("kodak");
    fresh.reset();
    expect(fresh.recipe).toBeNull();
  });

  it("exports at full or requested size with the edit applied", async () => {
    const photo = create().adjust({ exposure: 0.5 }).aspectRatio("1:1");
    const full = await photo.export({ format: "jpeg" });
    expect(full).toMatchObject({ width: 200, height: 200, type: "image/jpeg", filename: "beach.jpg" });
    expect(rendered[rendered.length - 1]).toMatchObject({ view: "crop", exposure: 0.5 });

    const small = await photo.export({ format: "webp", width: 50 });
    expect(small).toMatchObject({ width: 50, height: 50, filename: "beach.webp" });
  });

  it("computes a histogram of the result", async () => {
    const histogram = await create().histogram();
    expect(histogram.pixels).toBeGreaterThan(0);
  });

  it("can't be edited after dispose", () => {
    const photo = create();
    photo.dispose();
    expect(() => photo.adjust({ exposure: 1 })).toThrow(/disposed/);
  });
});
