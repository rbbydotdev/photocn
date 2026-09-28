import { createGeometry, type GeometryParams, type Size } from "./compose";

export interface SkippableSection {
  $skip?: boolean;
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

export interface BlenderParams extends SkippableSection {
  blendmap: CanvasImageSource | 0;
  blendmix: number;
}

export interface BlurParams extends SkippableSection {
  bokehstrength: number;
  bokehlensout: number;
  gaussianstrength: number;
  gaussianlensout: number;
  centerX: number;
  centerY: number;
}

/**
 * Geometry plus render-only hints. `$view` and `$outputSize` are set on the
 * params handed to the renderer (crop-tool view, export resize) and never
 * stored in history or recipes.
 */
export interface GeometrySection extends GeometryParams {
  $view?: "crop" | "full";
  $outputSize?: Size | null;
}

export interface EditorParams {
  geometry: GeometrySection;
  lights: LightParams;
  colors: ColorParams;
  effects: EffectParams;
  curve: CurveParams;
  filters: FilterParams;
  blender: BlenderParams;
  blur: BlurParams;
}

export type EditorParamSection = keyof EditorParams;

export const editorParamSections = [
  "geometry",
  "lights",
  "colors",
  "effects",
  "curve",
  "filters",
  "blender",
  "blur",
] as const satisfies readonly EditorParamSection[];

export function createEditorParams(): EditorParams {
  return {
    geometry: createGeometry(),
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
    blender: {
      blendmap: 0,
      blendmix: 0.5,
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
