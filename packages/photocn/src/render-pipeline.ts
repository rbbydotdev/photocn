import type { GeometryRenderSpec } from "./gl/minigl";
import type {
  BlurParams,
  CurveChannels,
  EditorParams,
  FilterOption,
} from "./editor-params";

export type Point = readonly [number, number];

export type LoadableImage = CanvasImageSource | ImageData;

export interface EditorRenderer {
  width: number;
  height: number;
  img: CanvasImageSource;
  gl: {
    canvas: {
      width: number;
      height: number;
    };
  };
  loadImage(image?: LoadableImage): void;
  /** Samples the original through the geometry and sizes the canvas to the result. */
  loadGeometry(spec: GeometryRenderSpec): void;
  readPixels(): Uint8Array;
  filterBlend(blendmap: CanvasImageSource, blendmix: number): void;
  filterAdjustments(params: Record<string, unknown>): void;
  filterBloom(strength: number): void;
  filterNoise(strength: number): void;
  filterHighlightsShadows(highlights: number, shadows: number): void;
  filterCurves(curvepoints: CurveChannels): void;
  filterInsta(opt: FilterOption, mix: number): void;
  filterBlurBokeh(params: BlurParams): void;
  filterBlurGaussian(params: BlurParams): void;
  paintCanvas(): void;
}

export interface RenderEditorPipelineOptions {
  renderer: EditorRenderer;
  params: EditorParams;
  onHistogramUpdate?: () => void;
}

function collectAdjustmentParams(params: EditorParams): Record<string, unknown> {
  return {
    ...(!params.lights.$skip ? params.lights : {}),
    ...(!params.colors.$skip ? params.colors : {}),
    ...(!params.effects.$skip ? params.effects : {}),
  };
}

export function renderEditorPipeline({
  renderer,
  params,
  onHistogramUpdate,
}: RenderEditorPipelineOptions): void {
  // Geometry first, always from the original pixels (docs/compose.md), so
  // every later pass (and the vignette / blur focus) works on the result.
  const { $view, $outputSize, ...geometry } = params.geometry;
  renderer.loadGeometry({ geometry, view: $view ?? "crop", outputSize: $outputSize ?? null });

  if (!params.blender.$skip && params.blender.blendmap) {
    renderer.filterBlend(params.blender.blendmap, params.blender.blendmix);
  }

  const adjustmentParams = collectAdjustmentParams(params);
  renderer.filterAdjustments(adjustmentParams);

  const bloom = adjustmentParams.bloom;
  if (typeof bloom === "number" && bloom) renderer.filterBloom(bloom);

  const noise = adjustmentParams.noise;
  if (typeof noise === "number" && noise) renderer.filterNoise(noise);

  const shadows = adjustmentParams.shadows;
  const highlights = adjustmentParams.highlights;
  if (
    (typeof shadows === "number" && shadows) ||
    (typeof highlights === "number" && highlights)
  ) {
    renderer.filterHighlightsShadows(
      typeof highlights === "number" ? highlights : 0,
      typeof shadows === "number" ? -shadows : 0,
    );
  }

  if (!params.curve.$skip && params.curve.curvepoints) {
    renderer.filterCurves(params.curve.curvepoints);
  }

  if (!params.filters.$skip && params.filters.opt) {
    renderer.filterInsta(params.filters.opt, params.filters.mix);
  }

  if (!params.blur.$skip && params.blur.bokehstrength) {
    renderer.filterBlurBokeh(params.blur);
  }

  if (!params.blur.$skip && params.blur.gaussianstrength) {
    renderer.filterBlurGaussian(params.blur);
  }

  renderer.paintCanvas();
  onHistogramUpdate?.();
}
