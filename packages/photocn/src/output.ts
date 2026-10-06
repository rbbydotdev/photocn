import type { Size } from "./compose";

export type ImageExportFormat = "png" | "jpeg" | "webp";

export const exportFormatInfo: Record<
  ImageExportFormat,
  { mime: string; extension: string; quality?: number }
> = {
  png: { mime: "image/png", extension: "png" },
  jpeg: { mime: "image/jpeg", extension: "jpg", quality: 0.92 },
  webp: { mime: "image/webp", extension: "webp", quality: 0.9 },
};

const MAX_OUTPUT = 16384;

/** Resolve export resize options against the crop's size. */
export function resolveOutputSize(
  crop: Size,
  target: { width?: number; height?: number },
): Size {
  const ratio = crop.width / crop.height;
  let { width, height } = target;
  if (width && !height) height = width / ratio;
  if (height && !width) width = height * ratio;
  if (!width || !height) return crop;
  return {
    width: Math.max(1, Math.min(MAX_OUTPUT, Math.round(width))),
    height: Math.max(1, Math.min(MAX_OUTPUT, Math.round(height))),
  };
}

/** `photo.jpg` + `webp` → `photo.webp`. */
export function exportFilename(name: string | undefined, format: ImageExportFormat): string {
  const base = (name ?? "edited-image").replace(/\.[^/.]+$/, "");
  return `${base}.${exportFormatInfo[format].extension}`;
}
