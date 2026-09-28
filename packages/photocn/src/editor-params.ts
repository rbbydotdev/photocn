import type { PerspectiveQuad } from "./perspective-geometry";

export interface SkippableSection {
  $skip?: boolean;
}

export interface TransformParams {
  translateX: number;
  translateY: number;
  angle: number;
  scale: number;
  flipv: number | boolean;
  fliph: number | boolean;
}

export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Crop rectangle in stage-percent coordinates (0..100). Used for the
 * in-progress crop overlay before it commits to `appliedCrop` (which is in
 * image-pixel coordinates via `CropBox`).
 */
export interface EditorCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropParams {
  /**
   * The user's current draft crop. Polymorphic across editor eras: the
   * shadcn workbench writes `EditorCropRect` (stage-percent), the legacy
   * `packages/core` cropper writes a DOMRect-shaped object. Each consumer
   * narrows on read; `0` means "no crop drawn yet" in both worlds.
   */
  currentcrop: unknown;
  /** One-shot trigger: when set, the next render applies this crop to the renderer. */
  glcrop: CropBox | 0;
  /** Persistent applied-crop state. The render pipeline reconciles the renderer's cropped texture with this on each render, so undo/redo can revert a crop. */
  appliedCrop: CropBox | 0;
  canvas_angle: number;
  ar: number;
  arindex: number;
}

export interface LightParams extends SkippableSection {
  brightness: number;
  exposure: number;
  gamma: number;
  contrast: number;
  shadows: number;
  highlights: number;
  bloom: number;
}

export interface ColorParams extends SkippableSection {
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  sepia: number;
}

export interface EffectParams extends SkippableSection {
  clarity: number;
  noise: number;
  vignette: number;
}

/** A single curve control point in normalized 0..1 coords: [input, output]. */
export type CurvePoint = [number, number];

/** Points for one channel of the curves filter, or `null` when the channel is identity. */
export type CurveChannelPoints = CurvePoint[] | null;

/** Per-channel curve definitions in render-pipeline order: [rgb, r, g, b]. */
export type CurveChannels = [
  CurveChannelPoints,
  CurveChannelPoints,
  CurveChannelPoints,
  CurveChannelPoints,
];

export interface CurveParams extends SkippableSection {
  curvepoints: CurveChannels | 0;
}

/**
 * A filter selection. `label` is the editor-facing identifier used by the
 * recipe serializer to round-trip filter picks; renderer-specific fields
 * (LUT textures, color matrices) live alongside it and are passed through
 * opaquely to `EditorRenderer.filterInsta`.
 */
export interface FilterOption {
  label: string;
}

export interface FilterParams extends SkippableSection {
  opt: FilterOption | 0;
  mix: number;
}

export interface PerspectiveParams {
  quad: PerspectiveQuad | 0;
  modified: number;
}

export interface Perspective2Params {
  before: PerspectiveQuad | 0;
  after: PerspectiveQuad | 0;
  modified: number;
}

export interface BlenderParams extends SkippableSection {
  blendmap: CanvasImageSource | 0;
  blendmix: number;
}

export interface ResizerParams {
  width: number;
  height: number;
}

export interface BlurParams extends SkippableSection {
  bokehstrength: number;
  bokehlensout: number;
  gaussianstrength: number;
  gaussianlensout: number;
  centerX: number;
  centerY: number;
}

export interface EditorParams {
  trs: TransformParams;
  crop: CropParams;
  lights: LightParams;
  colors: ColorParams;
  effects: EffectParams;
  curve: CurveParams;
  filters: FilterParams;
  perspective: PerspectiveParams;
  perspective2: Perspective2Params;
  blender: BlenderParams;
  resizer: ResizerParams;
  blur: BlurParams;
}

export type EditorParamSection = keyof EditorParams;

export const editorParamSections = [
  "trs",
  "crop",
  "lights",
  "colors",
  "effects",
  "curve",
  "filters",
  "perspective",
  "perspective2",
  "blender",
  "resizer",
  "blur",
] as const satisfies readonly EditorParamSection[];

export function createEditorParams(): EditorParams {
  return {
    trs: {
      translateX: 0,
      translateY: 0,
      angle: 0,
      scale: 0,
      flipv: 0,
      fliph: 0,
    },
    crop: {
      currentcrop: 0,
      glcrop: 0,
      appliedCrop: 0,
      canvas_angle: 0,
      ar: 0,
      arindex: 0,
    },
    lights: {
      brightness: 0,
      exposure: 0,
      gamma: 0,
      contrast: 0,
      shadows: 0,
      highlights: 0,
      bloom: 0,
    },
    colors: {
      temperature: 0,
      tint: 0,
      vibrance: 0,
      saturation: 0,
      sepia: 0,
    },
    effects: {
      clarity: 0,
      noise: 0,
      vignette: 0,
    },
    curve: {
      curvepoints: 0,
    },
    filters: {
      opt: 0,
      mix: 0,
    },
    perspective: {
      quad: 0,
      modified: 0,
    },
    perspective2: {
      before: 0,
      after: 0,
      modified: 0,
    },
    blender: {
      blendmap: 0,
      blendmix: 0.5,
    },
    resizer: {
      width: 0,
      height: 0,
    },
    blur: {
      bokehstrength: 0,
      bokehlensout: 0.5,
      gaussianstrength: 0,
      gaussianlensout: 0.5,
      centerX: 0.5,
      centerY: 0.5,
    },
  };
}

/**
 * Shallow-clone an EditorParams: each section is a fresh object whose own
 * keys come from `params`, so callers can mutate one section without
 * touching the original. Used by the history reducer, the workbench's
 * patch helpers, and anywhere a "next" snapshot is needed.
 */
export function cloneEditorParams(params: EditorParams): EditorParams {
  const next = createEditorParams();
  for (const section of editorParamSections) {
    Object.assign(next[section], params[section]);
  }
  return next;
}

export function resetEditorParams(params: EditorParams): void {
  const defaults = createEditorParams();

  for (const section of editorParamSections) {
    const target = params[section] as unknown as Record<string, unknown>;
    const source = defaults[section] as unknown as Record<string, unknown>;

    for (const key of Object.keys(target)) {
      delete target[key];
    }

    Object.assign(target, source);
  }
}

export function setSectionSkipped(
  params: EditorParams,
  section: EditorParamSection,
  skipped: boolean,
): void {
  const target = params[section] as SkippableSection;
  target.$skip = skipped;
}
