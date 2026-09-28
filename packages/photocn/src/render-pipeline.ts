import { cropBoxesEqual } from "./crop-projection";
import type {
  BlurParams,
  CropBox,
  CurveChannels,
  EditorParams,
  FilterOption,
  TransformParams,
} from "./editor-params";

export type Point = readonly [number, number];

export type LoadableImage = CanvasImageSource | ImageData;

export interface EditorRenderer {
  width: number;
  height: number;
  img: CanvasImageSource;
  img_cropped?: CanvasImageSource;
  /** Mirror of the renderer's current cropped state, set by `crop()`/`resetCrop()`. */
  appliedCrop?: CropBox;
  gl: {
    canvas: {
      width: number;
      height: number;
    };
  };
  loadImage(image?: LoadableImage): void;
  resetCrop?(): void;
  readPixels(): Uint8Array;
  filterMatrix(params: TransformParams): void;
  filterPerspective(
    before: Array<[number, number]>,
    after: Array<[number, number]>,
    horizontal: boolean,
    vertical: boolean,
  ): void;
  crop(crop: CropBox): void;
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

function transformIsDefault(trs: TransformParams): boolean {
  return (
    trs.translateX === 0 &&
    trs.translateY === 0 &&
    trs.angle === 0 &&
    trs.scale === 0 &&
    !trs.flipv &&
    !trs.fliph
  );
}

function scalePoints(
  points: readonly Point[],
  canvas: { width: number; height: number },
): Array<[number, number]> {
  return points.map((point) => [
    point[0] * canvas.width,
    point[1] * canvas.height,
  ]);
}

function hasPerspectivePoints(value: unknown): value is readonly Point[] {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number",
    )
  );
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
  // Reconcile renderer's persistent cropped-state with `params.crop.appliedCrop`.
  // This is what makes undo/redo of a crop work: when history rewinds past the
  // crop entry, `appliedCrop` clears here and we restore the original texture.
  // Done before `loadImage` so the rest of the pipeline runs against the right
  // source texture (cropped or original).
  const desiredApplied =
    params.crop.appliedCrop && typeof params.crop.appliedCrop === "object"
      ? params.crop.appliedCrop
      : null;
  const currentApplied = renderer.appliedCrop ?? null;
  if (!cropBoxesEqual(desiredApplied, currentApplied)) {
    if (currentApplied && renderer.resetCrop) renderer.resetCrop();
    if (desiredApplied) {
      // Apply transforms first so the crop rect aligns with the transformed
      // image, then crop. Mirrors what `commitCrop` did imperatively before.
      renderer.loadImage();
      const reapplyHasTransform =
        !transformIsDefault(params.trs) || params.crop.canvas_angle !== 0;
      const reapplyHasPerspective =
        hasPerspectivePoints(params.perspective2.before) &&
        hasPerspectivePoints(params.perspective2.after);
      if (reapplyHasTransform || reapplyHasPerspective) {
        params.trs.angle += params.crop.canvas_angle;
        renderer.filterMatrix(params.trs);
        params.trs.angle -= params.crop.canvas_angle;
        if (reapplyHasPerspective) {
          const { canvas } = renderer.gl;
          renderer.filterPerspective(
            scalePoints(params.perspective2.before as readonly Point[], canvas),
            scalePoints(params.perspective2.after as readonly Point[], canvas),
            false,
            false,
          );
        }
      }
      renderer.crop(desiredApplied);
    }
  }

  renderer.loadImage();

  const hasTransform = !transformIsDefault(params.trs) || params.crop.canvas_angle !== 0;
  const hasPerspective =
    hasPerspectivePoints(params.perspective2.before) &&
    hasPerspectivePoints(params.perspective2.after);

  if (hasTransform || hasPerspective || params.crop.glcrop) {
    params.trs.angle += params.crop.canvas_angle;
    renderer.filterMatrix(params.trs);
    params.trs.angle -= params.crop.canvas_angle;

    if (hasPerspective) {
      const { canvas } = renderer.gl;
      renderer.filterPerspective(
        scalePoints(params.perspective2.before as readonly Point[], canvas),
        scalePoints(params.perspective2.after as readonly Point[], canvas),
        false,
        false,
      );
    }
  }

  if (params.crop.glcrop) {
    const crop = params.crop.glcrop;
    renderer.crop(crop);
    params.crop.glcrop = 0;
    renderEditorPipeline({ renderer, params, onHistogramUpdate });
    return;
  }

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
