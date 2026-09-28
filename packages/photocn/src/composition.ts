import type { Size } from "./geometry";

export const cropAspectPresetLabels = [
  "free",
  "pic",
  "1:pic",
  "1:1",
  "4:3",
  "16:9",
  "3:4",
  "9:16",
] as const;

export type CropAspectPresetLabel = typeof cropAspectPresetLabels[number];
export type CropAspectPresetIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CropAspectState {
  ar: number;
  arindex: CropAspectPresetIndex;
}

export interface ResizeDimensions {
  width: number;
  height: number;
}

export const defaultCropAspectPresetValues = [
  0,
  0,
  0,
  1,
  4 / 3,
  16 / 9,
  3 / 4,
  9 / 16,
] as const satisfies readonly number[];

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampCropAspectPresetIndex(index: number): CropAspectPresetIndex {
  if (!Number.isInteger(index)) return 0;
  if (index < 0) return 0;
  if (index >= cropAspectPresetLabels.length) return 0;
  return index as CropAspectPresetIndex;
}

export function imageAspectRatio(size: Size): number {
  return isPositiveFinite(size.width) && isPositiveFinite(size.height)
    ? size.width / size.height
    : 0;
}

export function inverseAspectRatio(aspectRatio: number): number {
  return isPositiveFinite(aspectRatio) ? 1 / aspectRatio : 0;
}

export function resolveImageAspectRatios(
  sizeOrAspectRatio: Size | number,
): { aspectRatio: number; inverseAspectRatio: number } {
  const aspectRatio = typeof sizeOrAspectRatio === "number"
    ? (isPositiveFinite(sizeOrAspectRatio) ? sizeOrAspectRatio : 0)
    : imageAspectRatio(sizeOrAspectRatio);

  return {
    aspectRatio,
    inverseAspectRatio: inverseAspectRatio(aspectRatio),
  };
}

export function cropAspectPresetIndexForLabel(
  label: CropAspectPresetLabel,
): CropAspectPresetIndex {
  return cropAspectPresetLabels.indexOf(label) as CropAspectPresetIndex;
}

export function resolveCropAspectPresetValues(
  sizeOrAspectRatio: Size | number = 0,
): readonly number[] {
  const imageAspects = resolveImageAspectRatios(sizeOrAspectRatio);

  return [
    defaultCropAspectPresetValues[0],
    imageAspects.aspectRatio,
    imageAspects.inverseAspectRatio,
    ...defaultCropAspectPresetValues.slice(3),
  ];
}

export function resolveCropAspectRatio(
  preset: CropAspectPresetIndex | CropAspectPresetLabel | number,
  sizeOrAspectRatio: Size | number = 0,
): number {
  const index = typeof preset === "string"
    ? cropAspectPresetIndexForLabel(preset)
    : clampCropAspectPresetIndex(preset);

  return resolveCropAspectPresetValues(sizeOrAspectRatio)[index] ?? 0;
}

export function createCropAspectState(
  preset: CropAspectPresetIndex | CropAspectPresetLabel | number = 0,
  sizeOrAspectRatio: Size | number = 0,
): CropAspectState {
  const arindex = typeof preset === "string"
    ? cropAspectPresetIndexForLabel(preset)
    : clampCropAspectPresetIndex(preset);

  return {
    ar: resolveCropAspectRatio(arindex, sizeOrAspectRatio),
    arindex,
  };
}

export function resetCropAspectState(): CropAspectState {
  return createCropAspectState(0);
}

export function resizeDimensionsFromWidth(
  width: number,
  aspectRatio: number,
  minDimension = 100,
): ResizeDimensions {
  const nextWidth = Math.max(minDimension, width);

  return {
    width: nextWidth,
    height: isPositiveFinite(aspectRatio) ? Math.floor(nextWidth / aspectRatio) : minDimension,
  };
}

export function resizeDimensionsFromHeight(
  height: number,
  aspectRatio: number,
  minDimension = 100,
): ResizeDimensions {
  const nextHeight = Math.max(minDimension, height);

  return {
    width: isPositiveFinite(aspectRatio) ? Math.floor(nextHeight * aspectRatio) : minDimension,
    height: nextHeight,
  };
}

export function resizePercent(width: number, originalWidth: number): number {
  return isPositiveFinite(originalWidth) ? Math.round(width / originalWidth * 1000) / 10 : 0;
}

export function normalizeCanvasAngle(angleDegrees: number): number {
  if (!Number.isFinite(angleDegrees)) return 0;

  return ((angleDegrees % 360) + 360) % 360;
}

export function rotateCanvasAngle(currentAngle: number, deltaDegrees: number): number {
  return normalizeCanvasAngle(currentAngle + deltaDegrees);
}

export function isCanvasAngleQuarterTurn(angleDegrees: number): boolean {
  return normalizeCanvasAngle(angleDegrees) % 180 !== 0;
}

export function canvasSizeForAngle(size: Size, angleDegrees: number): Size {
  return isCanvasAngleQuarterTurn(angleDegrees)
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}
