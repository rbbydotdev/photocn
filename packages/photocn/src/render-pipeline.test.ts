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
    readPixels: vi.fn(() => new Uint8Array(width * height * 4)),
    loadGeometry: vi.fn(),
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
    expect(renderer.loadGeometry).toHaveBeenCalledTimes(1);
    expect(renderer.paintCanvas).toHaveBeenCalled();
  });

  it("calls filterAdjustments even when nothing is set", () => {
    renderEditorPipeline({ renderer, params: createEditorParams() });
    expect(renderer.filterAdjustments).toHaveBeenCalledTimes(1);
  });

  it("renders geometry first, from the original, with the crop view by default", () => {
    const renderer = createMockRenderer();
    const params = createEditorParams();
    params.geometry = { ...params.geometry, straighten: 12, quarterTurns: 1 };
    renderEditorPipeline({ renderer, params });
    expect(renderer.loadGeometry).toHaveBeenCalledWith({
      geometry: expect.objectContaining({ straighten: 12, quarterTurns: 1 }),
      view: "crop",
      outputSize: null,
    });
    const geometryOrder = vi.mocked(renderer.loadGeometry).mock.invocationCallOrder[0];
    const adjustOrder = vi.mocked(renderer.filterAdjustments).mock.invocationCallOrder[0];
    expect(geometryOrder).toBeLessThan(adjustOrder);
  });

  it("passes render-only hints ($view, $outputSize) without leaking them into geometry", () => {
    const renderer = createMockRenderer();
    const params = createEditorParams();
    params.geometry = { ...params.geometry, $view: "full", $outputSize: { width: 800, height: 600 } };
    renderEditorPipeline({ renderer, params });
    const spec = vi.mocked(renderer.loadGeometry).mock.calls[0][0];
    expect(spec.view).toBe("full");
    expect(spec.outputSize).toEqual({ width: 800, height: 600 });
    expect(spec.geometry).not.toHaveProperty("$view");
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
