import type { CurveChannels } from "../editor-params";

/**
 * Tools the built-in editor knows how to show. Custom UIs are free to ignore
 * this list — `tool` is plain state and accepts any string.
 */
export type ImageEditorToolId =
  | "adjust"
  | "compose"
  | "curves"
  | "effects"
  | "filters"
  | "blender"
  | "blur"
  | "metadata"
  | (string & {});

export interface AdjustLightValue {
  brightness: number;
  exposure: number;
  gamma: number;
  contrast: number;
  shadows: number;
  highlights: number;
  bloom: number;
}

export interface AdjustColorValue {
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  sepia: number;
}

export interface AdjustEffectValue {
  clarity: number;
  noise: number;
  vignette: number;
}

export interface AdjustValue {
  lights: AdjustLightValue;
  colors: AdjustColorValue;
  effects: AdjustEffectValue;
}

export type AdjustSection = keyof AdjustValue;

export const adjustDefaultValue: AdjustValue = {
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
};

export interface BlurValue {
  bokehStrength: number;
  bokehLensOut: number;
  gaussianStrength: number;
  gaussianLensOut: number;
  /** Focus center, normalized 0..1. */
  centerX: number;
  /** Focus center, normalized 0..1. */
  centerY: number;
}

export const blurDefaultValue: BlurValue = {
  bokehStrength: 0,
  bokehLensOut: 0.5,
  gaussianStrength: 0,
  gaussianLensOut: 0.5,
  centerX: 0.5,
  centerY: 0.5,
};

export function isBlurValueDefault(value: BlurValue): boolean {
  return (
    value.bokehStrength === blurDefaultValue.bokehStrength &&
    value.bokehLensOut === blurDefaultValue.bokehLensOut &&
    value.gaussianStrength === blurDefaultValue.gaussianStrength &&
    value.gaussianLensOut === blurDefaultValue.gaussianLensOut &&
    value.centerX === blurDefaultValue.centerX &&
    value.centerY === blurDefaultValue.centerY
  );
}

export interface FiltersValue {
  /** Label of the active preset, or `null` when no filter is applied. */
  label: string | null;
  /** 0 = original photo, 1 = full filter. */
  strength: number;
}

/**
 * The renderer stores filter intensity as an offset around full strength
 * (`params.filters.mix`: 0 = 100%, -1 = 0%). These convert to/from the
 * 0..1 strength every UI shows.
 */
export function filterMixToStrength(mix: number): number {
  return Math.min(1, Math.max(0, (mix ?? 0) + 1));
}

export function filterStrengthToMix(strength: number): number {
  return Math.min(1, Math.max(0, strength)) - 1;
}

export interface BlendValue {
  /** Blend strength, 0..1. */
  blendMix: number;
}

export interface AspectRatioOption {
  value: string;
  label: string;
}

/**
 * Crop ratio presets. Ratios are written landscape-first; the editor applies
 * them in the crop's current orientation and the portrait/landscape toggle
 * flips them (a "4:3" preset on a portrait crop is 3:4).
 */
export const aspectRatioOptions = [
  { value: "free", label: "Freeform" },
  { value: "original", label: "Original" },
  { value: "1:1", label: "Square" },
  { value: "16:9", label: "16:9" },
  { value: "5:4", label: "5:4" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
] as const satisfies readonly AspectRatioOption[];

export type { CurveChannels };
