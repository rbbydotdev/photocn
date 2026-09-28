import {
  cloneEditorParams,
  type EditorParamSection,
  type EditorParams,
} from "../editor-params";
import type { AspectRatioOption } from "./types";

export type ParamPatch = {
  section: EditorParamSection;
  patch: Record<string, unknown>;
};

export function patchEditorParams(
  params: EditorParams,
  sectionOrPatches: EditorParamSection | readonly ParamPatch[],
  patch?: Record<string, unknown>,
): EditorParams {
  const next = cloneEditorParams(params);

  if (typeof sectionOrPatches === "string") {
    Object.assign(next[sectionOrPatches], patch);
  } else {
    for (const paramPatch of sectionOrPatches) {
      Object.assign(next[paramPatch.section], paramPatch.patch);
    }
  }

  return next;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unable to load image.";
}

const RATIO_TOLERANCE = 1e-3;

/** "16:9" → 16/9, "original" → the image's ratio, "free" → null. */
export function parseAspectRatio(value: string, imageRatio: number): number | null {
  if (value === "free") return null;
  if (value === "original") return imageRatio > 0 ? imageRatio : null;
  const [w, h] = value.split(":").map(Number);
  return w && h ? w / h : null;
}

/**
 * The preset matching `ratio` in either orientation ("free" when none), and
 * whether the ratio is portrait.
 */
export function matchAspectRatio(
  ratio: number | null,
  imageRatio: number,
  options: readonly AspectRatioOption[],
): { value: string; portrait: boolean } {
  if (!ratio) return { value: "free", portrait: false };
  const portrait = ratio < 1 - RATIO_TOLERANCE;
  if (imageRatio > 0 && Math.abs(ratio - imageRatio) < RATIO_TOLERANCE) {
    return { value: "original", portrait };
  }
  for (const option of options) {
    const r = parseAspectRatio(option.value, imageRatio);
    if (!r || option.value === "original") continue;
    if (Math.abs(ratio - r) < RATIO_TOLERANCE || Math.abs(ratio - 1 / r) < RATIO_TOLERANCE) {
      return { value: option.value, portrait };
    }
  }
  return { value: "free", portrait };
}
