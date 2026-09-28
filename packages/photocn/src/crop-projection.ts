import type { CropBox } from "./editor-params";

export interface Size {
  width: number;
  height: number;
}

/**
 * A crop rectangle in stage-percent coordinates.
 *
 * The crop overlay sits inside a stage container that hosts an image rendered
 * with `object-contain`. So the rectangle the user draws is in stage-percent
 * space (0..100), but the image only occupies a centered subset of the stage
 * (letterboxed when stage and image aspect ratios differ).
 */
export interface StageCropRect {
  /** Left edge as a percent of stage width (0..100). */
  x: number;
  /** Top edge as a percent of stage height (0..100). */
  y: number;
  /** Width as a percent of stage width (0..100). */
  width: number;
  /** Height as a percent of stage height (0..100). */
  height: number;
}

/**
 * Project a crop rectangle drawn in stage-percent coords to image-pixel coords.
 *
 * Accounts for the `object-contain` letterbox: parts of the crop that fall in
 * the empty stage area outside the image are clamped to the image bounds.
 *
 * Returns `null` if the inputs are degenerate (zero stage/image, no overlap
 * with the image, etc.) — caller should treat this as "nothing to crop".
 */
export function stageRectToImageRect(
  cropPercent: StageCropRect,
  stageSize: Size,
  imageSize: Size,
): CropBox | null {
  if (
    stageSize.width <= 0 ||
    stageSize.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return null;
  }

  // Image's display rect inside the stage (object-contain).
  const imageRatio = imageSize.width / imageSize.height;
  const stageRatio = stageSize.width / stageSize.height;
  let displayW: number;
  let displayH: number;
  if (imageRatio >= stageRatio) {
    displayW = stageSize.width;
    displayH = stageSize.width / imageRatio;
  } else {
    displayH = stageSize.height;
    displayW = stageSize.height * imageRatio;
  }
  const displayLeft = (stageSize.width - displayW) / 2;
  const displayTop = (stageSize.height - displayH) / 2;

  // Crop in stage-pixel coords.
  const cropLeftPx = (cropPercent.x / 100) * stageSize.width;
  const cropTopPx = (cropPercent.y / 100) * stageSize.height;
  const cropRightPx = cropLeftPx + (cropPercent.width / 100) * stageSize.width;
  const cropBottomPx = cropTopPx + (cropPercent.height / 100) * stageSize.height;

  // Intersect with the image's display rect (clamps any letterbox overlap).
  const dispLeft = Math.max(cropLeftPx, displayLeft);
  const dispTop = Math.max(cropTopPx, displayTop);
  const dispRight = Math.min(cropRightPx, displayLeft + displayW);
  const dispBottom = Math.min(cropBottomPx, displayTop + displayH);
  if (dispRight <= dispLeft || dispBottom <= dispTop) return null;

  // Stage-display pixel → image-pixel.
  const scale = imageSize.width / displayW;
  const imgLeft = (dispLeft - displayLeft) * scale;
  const imgTop = (dispTop - displayTop) * scale;
  const imgWidth = (dispRight - dispLeft) * scale;
  const imgHeight = (dispBottom - dispTop) * scale;

  return {
    left: clampInt(Math.round(imgLeft), 0, imageSize.width),
    top: clampInt(Math.round(imgTop), 0, imageSize.height),
    width: Math.max(1, clampInt(Math.round(imgWidth), 1, imageSize.width)),
    height: Math.max(1, clampInt(Math.round(imgHeight), 1, imageSize.height)),
  };
}

export function cropBoxesEqual(a: CropBox | null | undefined, b: CropBox | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
