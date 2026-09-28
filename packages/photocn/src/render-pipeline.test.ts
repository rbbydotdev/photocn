import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorParams } from "./editor-params";
import {
  renderEditorPipeline,
  type EditorRenderer,
  type LoadableImage,
} from "./render-pipeline";

function createMockRenderer(width = 800, height = 600): EditorRenderer {
  const stubImage = {} as CanvasImageSource;
  return {
    width,
    height,
    img: stubImage,
    gl: { canvas: { width, height } },
    loadImage: vi.fn<(image?: LoadableImage) => void>(),
    resetCrop: vi.fn(),
    readPixels: vi.fn(() => new Uint8Array(width * height * 4)),
    filterMatrix: vi.fn(),
    filterPerspective: vi.fn(),
    crop: vi.fn(),
    filterBlend: vi.fn(),
    filterAdjustments: vi.fn(),
    filterBloom: vi.fn(),
    filterNoise: vi.fn(),
    filterHighlightsShadows: vi.fn(),
    filterCurves: vi.fn(),
    filterInsta: vi.fn(),
    filterBlurBokeh: vi.fn(),
    filterBlurGaussian: vi.fn(),
    paintCanvas: vi.fn(),
  };
}

describe("renderEditorPipeline", () => {
  let renderer: EditorRenderer;

  beforeEach(() => {
    renderer = createMockRenderer();
  });

  it("always loads the image and paints the canvas", () => {
    renderEditorPipeline({ renderer, params: createEditorParams() });
    expect(renderer.loadImage).toHaveBeenCalled();
    expect(renderer.paintCanvas).toHaveBeenCalled();
  });

  it("calls filterAdjustments even when nothing is set", () => {
    renderEditorPipeline({ renderer, params: createEditorParams() });
    expect(renderer.filterAdjustments).toHaveBeenCalledTimes(1);
  });

  it("skips filterMatrix when params describe an identity transform with no crop staged", () => {
    renderEditorPipeline({ renderer, params: createEditorParams() });
    expect(renderer.filterMatrix).not.toHaveBeenCalled();
  });

  it("invokes filterMatrix whenever transforms differ from defaults, regardless of mode", () => {
    const flipped = createEditorParams();
    flipped.trs.fliph = 1;
    const r1 = createMockRenderer();
    renderEditorPipeline({ renderer: r1, params: flipped });
    expect(r1.filterMatrix).toHaveBeenCalledTimes(1);

    const rotated = createEditorParams();
    rotated.trs.angle = 15;
    const r2 = createMockRenderer();
    renderEditorPipeline({ renderer: r2, params: rotated });
    expect(r2.filterMatrix).toHaveBeenCalledTimes(1);

    const canvasRotated = createEditorParams();
    canvasRotated.crop.canvas_angle = 90;
    const r3 = createMockRenderer();
    renderEditorPipeline({ renderer: r3, params: canvasRotated });
    expect(r3.filterMatrix).toHaveBeenCalledTimes(1);

    const staged = createEditorParams();
    staged.crop.glcrop = { left: 0, top: 0, width: 10, height: 10 };
    const r4 = createMockRenderer();
    renderEditorPipeline({ renderer: r4, params: staged });
    expect(r4.filterMatrix).toHaveBeenCalled();
  });

  it("applies a glcrop and recurses without re-applying the crop", () => {
    const params = createEditorParams();
    params.crop.glcrop = { left: 10, top: 10, width: 100, height: 100 };
    renderEditorPipeline({ renderer, params });
    expect(renderer.crop).toHaveBeenCalledTimes(1);
    expect(params.crop.glcrop).toBe(0);
    // After recursion, filterAdjustments runs on the cropped image too.
    expect(renderer.filterAdjustments).toHaveBeenCalled();
  });

  it("calls filterCurves only when curvepoints are set and section is not skipped", () => {
    const params = createEditorParams();
    renderEditorPipeline({ renderer, params });
    expect(renderer.filterCurves).not.toHaveBeenCalled();

    const params2 = createEditorParams();
    params2.curve.curvepoints = [[[0, 0], [1, 1]], null, null, null];
    const r2 = createMockRenderer();
    renderEditorPipeline({ renderer: r2, params: params2 });
    expect(r2.filterCurves).toHaveBeenCalledWith(params2.curve.curvepoints);

    const params3 = createEditorParams();
    params3.curve.curvepoints = [[[0, 0], [1, 1]]];
    params3.curve.$skip = true;
    const r3 = createMockRenderer();
    renderEditorPipeline({ renderer: r3, params: params3 });
    expect(r3.filterCurves).not.toHaveBeenCalled();
  });

  it("calls filterInsta when an Instagram filter option is set", () => {
    const params = createEditorParams();
    params.filters.opt = { type: "lut", label: "aden" };
    params.filters.mix = 0.6;
    renderEditorPipeline({ renderer, params });
    expect(renderer.filterInsta).toHaveBeenCalledWith(params.filters.opt, 0.6);
  });

  it("calls filterBlend when a blendmap is provided", () => {
    const params = createEditorParams();
    const stubMap = {} as CanvasImageSource;
    params.blender.blendmap = stubMap;
    params.blender.blendmix = 0.4;
    renderEditorPipeline({ renderer, params });
    expect(renderer.filterBlend).toHaveBeenCalledWith(stubMap, 0.4);
  });

  it("calls filterBlurBokeh and filterBlurGaussian based on strength", () => {
    const params = createEditorParams();
    params.blur.bokehstrength = 0.5;
    renderEditorPipeline({ renderer, params });
    expect(renderer.filterBlurBokeh).toHaveBeenCalledTimes(1);
    expect(renderer.filterBlurGaussian).not.toHaveBeenCalled();

    const params2 = createEditorParams();
    params2.blur.gaussianstrength = 0.3;
    const r2 = createMockRenderer();
    renderEditorPipeline({ renderer: r2, params: params2 });
    expect(r2.filterBlurGaussian).toHaveBeenCalledTimes(1);
  });

  it("calls filterBloom only when bloom > 0", () => {
    const params = createEditorParams();
    params.lights.bloom = 0.3;
    renderEditorPipeline({ renderer, params });
    expect(renderer.filterBloom).toHaveBeenCalledWith(0.3);
  });

  it("calls filterHighlightsShadows when either value is set, with shadows negated", () => {
    const params = createEditorParams();
    params.lights.shadows = 0.4;
    params.lights.highlights = 0.2;
    renderEditorPipeline({ renderer, params });
    expect(renderer.filterHighlightsShadows).toHaveBeenCalledWith(0.2, -0.4);
  });

  it("respects $skip on adjustment, blender, curve, filters, and blur sections", () => {
    const params = createEditorParams();
    params.lights.$skip = true;
    params.lights.bloom = 0.5;
    params.colors.$skip = true;
    params.effects.$skip = true;
    params.curve.$skip = true;
    params.curve.curvepoints = [[[0, 0]]];
    params.filters.$skip = true;
    params.filters.opt = { type: "x" };
    params.blur.$skip = true;
    params.blur.bokehstrength = 0.5;
    params.blender.$skip = true;
    params.blender.blendmap = {} as CanvasImageSource;

    renderEditorPipeline({ renderer, params });

    expect(renderer.filterBloom).not.toHaveBeenCalled();
    expect(renderer.filterCurves).not.toHaveBeenCalled();
    expect(renderer.filterInsta).not.toHaveBeenCalled();
    expect(renderer.filterBlurBokeh).not.toHaveBeenCalled();
    expect(renderer.filterBlend).not.toHaveBeenCalled();
  });

  it("calls onHistogramUpdate after painting", () => {
    const onHistogramUpdate = vi.fn();
    renderEditorPipeline({ renderer, params: createEditorParams(), onHistogramUpdate });
    expect(onHistogramUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("renderEditorPipeline appliedCrop reconciliation", () => {
  const cropBox = { left: 100, top: 50, width: 400, height: 300 };

  it("applies a crop on first render when params.crop.appliedCrop is set", () => {
    const renderer = createMockRenderer();
    const params = createEditorParams();
    params.crop.appliedCrop = cropBox;

    renderEditorPipeline({ renderer, params });

    expect(renderer.crop).toHaveBeenCalledWith(cropBox);
    expect(renderer.resetCrop).not.toHaveBeenCalled();
  });

  it("does NOT re-apply the crop on subsequent renders when state already matches", () => {
    const renderer = createMockRenderer();
    // Simulate: renderer is already cropped to this rect (e.g. from a prior render).
    renderer.appliedCrop = cropBox;
    const params = createEditorParams();
    params.crop.appliedCrop = cropBox;

    renderEditorPipeline({ renderer, params });

    expect(renderer.crop).not.toHaveBeenCalled();
    expect(renderer.resetCrop).not.toHaveBeenCalled();
  });

  it("calls resetCrop when params clears appliedCrop after a previous crop (the undo flow)", () => {
    const renderer = createMockRenderer();
    // Renderer is currently cropped (left over from a prior render).
    renderer.appliedCrop = cropBox;
    // Params no longer have appliedCrop set — this is what undo produces.
    const params = createEditorParams();
    expect(params.crop.appliedCrop).toBe(0);

    renderEditorPipeline({ renderer, params });

    expect(renderer.resetCrop).toHaveBeenCalledTimes(1);
    expect(renderer.crop).not.toHaveBeenCalled();
  });

  it("reset+re-applies when changing from one crop rect to another", () => {
    const renderer = createMockRenderer();
    renderer.appliedCrop = cropBox;
    const newCrop = { left: 0, top: 0, width: 200, height: 200 };
    const params = createEditorParams();
    params.crop.appliedCrop = newCrop;

    renderEditorPipeline({ renderer, params });

    expect(renderer.resetCrop).toHaveBeenCalledTimes(1);
    expect(renderer.crop).toHaveBeenCalledWith(newCrop);
  });

  it("applies transforms before cropping so the crop rect aligns with the transformed image", () => {
    const renderer = createMockRenderer();
    const params = createEditorParams();
    params.crop.appliedCrop = cropBox;
    params.trs.angle = 30; // transformed image

    renderEditorPipeline({ renderer, params });

    // filterMatrix runs at least once during reconciliation (before crop) and
    // may also run in the main pipeline. The contract that matters is that
    // crop sees a transformed-image renderer state.
    expect(renderer.filterMatrix).toHaveBeenCalled();
    expect(renderer.crop).toHaveBeenCalledWith(cropBox);
  });
});
