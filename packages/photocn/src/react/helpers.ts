import {
  cloneEditorParams,
  type EditorCropRect,
  type EditorParamSection,
  type EditorParams,
} from "../editor-params";

export type ParamPatch = {
  section: EditorParamSection;
  patch: Record<string, unknown>;
};

export type PreviewSize = {
  width: number;
  height: number;
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

export function parseAspectRatio(
  value: string,
  imageAspectRatio: number,
): number | null {
  if (value === "free") return null;
  if (value === "original") {
    return imageAspectRatio > 0 ? imageAspectRatio : null;
  }

  const [width, height] = value.split(":").map(Number);
  if (!width || !height) return null;

  return width / height;
}

export function inferAspectRatioLabel(
  ar: number,
  imageAr: number,
  options: readonly { value: string }[],
): string {
  if (!ar) return "free";
  const tolerance = 1e-3;
  if (imageAr > 0 && Math.abs(ar - imageAr) < tolerance) return "original";
  for (const option of options) {
    if (option.value === "free" || option.value === "original") continue;
    const [w, h] = option.value.split(":").map(Number);
    if (!w || !h) continue;
    if (Math.abs(ar - w / h) < tolerance) return option.value;
  }
  return "free";
}

export function resolvePreviewSize(
  renderer: { width?: number; height?: number } | null | undefined,
  image: HTMLImageElement | null,
): PreviewSize | null {
  if (renderer?.width && renderer.height) {
    return { width: renderer.width, height: renderer.height };
  }

  const width = image?.naturalWidth || image?.width || 0;
  const height = image?.naturalHeight || image?.height || 0;

  return width > 0 && height > 0 ? { width, height } : null;
}

export function rotationFitScale(
  size: PreviewSize | null,
  angleDegrees: number,
): number {
  if (!size?.width || !size.height || !Number.isFinite(angleDegrees)) {
    return 1;
  }

  const radians = (Math.abs(angleDegrees) * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const rotatedWidth = size.width * cos + size.height * sin;
  const rotatedHeight = size.width * sin + size.height * cos;

  return Math.min(size.width / rotatedWidth, size.height / rotatedHeight, 1);
}

/**
 * Narrow `params.crop.currentcrop` (typed `unknown` in core because the
 * legacy js cropper writes a different shape there) to the modern
 * stage-percent rect. Returns `null` for anything else, so the workbench
 * can fall back to its default overlay rect.
 */
export function extractCropRect(currentcrop: unknown): EditorCropRect | null {
  if (
    currentcrop &&
    typeof currentcrop === "object" &&
    "width" in currentcrop &&
    "height" in currentcrop
  ) {
    return currentcrop as EditorCropRect;
  }
  return null;
}

/**
 * Compute the best-fit crop for a target aspect ratio: the largest rectangle
 * of `aspectRatio` (width/height in image pixels) that fits inside the image,
 * centered. The result is returned in stage-percent coordinates so it can be
 * fed straight into the crop overlay, which is positioned in stage-percent.
 *
 * The image is rendered with object-contain inside the stage, so its display
 * rect (and therefore the crop overlay's reference frame) depends on both the
 * stage's CSS aspect ratio and the image's aspect ratio.
 */
export function bestFitCropForAspect(
  stageSize: PreviewSize,
  imageSize: PreviewSize,
  aspectRatio: number,
): EditorCropRect {
  if (
    !stageSize.width ||
    !stageSize.height ||
    !imageSize.width ||
    !imageSize.height ||
    !aspectRatio
  ) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  // Image display rect within the stage (object-contain).
  const stageRatio = stageSize.width / stageSize.height;
  const imageRatio = imageSize.width / imageSize.height;
  let imgDisplayW: number;
  let imgDisplayH: number;
  if (imageRatio >= stageRatio) {
    imgDisplayW = stageSize.width;
    imgDisplayH = stageSize.width / imageRatio;
  } else {
    imgDisplayH = stageSize.height;
    imgDisplayW = stageSize.height * imageRatio;
  }
  const imgLeft = (stageSize.width - imgDisplayW) / 2;
  const imgTop = (stageSize.height - imgDisplayH) / 2;

  // Largest rectangle of target ratio that fits inside the image display rect.
  let cropW: number;
  let cropH: number;
  if (aspectRatio >= imgDisplayW / imgDisplayH) {
    cropW = imgDisplayW;
    cropH = imgDisplayW / aspectRatio;
  } else {
    cropH = imgDisplayH;
    cropW = imgDisplayH * aspectRatio;
  }
  const cropLeft = imgLeft + (imgDisplayW - cropW) / 2;
  const cropTop = imgTop + (imgDisplayH - cropH) / 2;

  return {
    x: (cropLeft / stageSize.width) * 100,
    y: (cropTop / stageSize.height) * 100,
    width: (cropW / stageSize.width) * 100,
    height: (cropH / stageSize.height) * 100,
  };
}

export function reshapeCropToAspect(
  crop: EditorCropRect,
  aspectRatio: number,
): EditorCropRect {
  // Stage is 100x100 in percent space. Aspect ratios are width/height in image
  // pixels — but the stage is also rendered as a square overlay regardless of
  // the underlying image, so we reshape relative to the current crop's center.
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  const currentRatio = crop.width / crop.height;

  let width: number;
  let height: number;
  if (aspectRatio >= currentRatio) {
    width = crop.width;
    height = width / aspectRatio;
  } else {
    height = crop.height;
    width = height * aspectRatio;
  }

  // Recenter and clamp to [0, 100].
  let x = cx - width / 2;
  let y = cy - height / 2;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + width > 100) x = 100 - width;
  if (y + height > 100) y = 100 - height;

  return { x, y, width, height };
}
