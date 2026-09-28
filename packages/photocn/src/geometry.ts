import type { CropBox } from "./editor-params";

export interface Size {
  width: number;
  height: number;
}

export interface ViewRect extends Size {
  left: number;
  top: number;
}

export function viewCropToImageCrop(
  viewRect: ViewRect,
  viewSize: Size,
  imageSize: Size,
): CropBox {
  const scaleX = imageSize.width / viewSize.width;
  const scaleY = imageSize.height / viewSize.height;

  return {
    left: Math.round(viewRect.left * scaleX),
    top: Math.round(viewRect.top * scaleY),
    width: Math.round(viewRect.width * scaleX),
    height: Math.round(viewRect.height * scaleY),
  };
}

export function rotationScaleForBounds(size: Size, angleDegrees: number): number {
  const radians = Math.abs(angleDegrees) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotatedWidth = size.width * cos + size.height * sin;
  const rotatedHeight = size.width * sin + size.height * cos;

  return Math.max(rotatedWidth / size.width - 1, rotatedHeight / size.height - 1);
}
