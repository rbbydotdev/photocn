import { clamp } from "..";

import {
  createExifOutputArrayBuffer,
  createExifOutputBlob,
  type BrowserExifHandle,
} from "./exif";
import type { MiniGlRenderer } from "./mini-gl";

export type ImageExportFormat =
  | "png"
  | "jpeg"
  | "jpg"
  | "webp"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | (string & {});

export interface CaptureRendererImageOptions {
  format?: ImageExportFormat;
  quality?: number;
}

export interface CaptureRendererExifOptions extends CaptureRendererImageOptions {
  originalExif?: BrowserExifHandle | ArrayBuffer | null;
  patchOrientationToOne?: boolean;
}

export interface CapturedRendererImage {
  image: HTMLImageElement;
  dataUrl: string;
  type: string;
  width: number;
  height: number;
}

export interface CapturedRendererBlob {
  blob: Blob;
  type: string;
  width: number;
  height: number;
}

export interface CapturedRendererArrayBuffer {
  arrayBuffer: ArrayBuffer;
  type: string;
  width: number;
  height: number;
}

const DEFAULT_EXPORT_TYPE = "image/png";

export function captureRendererImage(
  renderer: MiniGlRenderer,
  options: CaptureRendererImageOptions = {},
): CapturedRendererImage {
  const type = normalizeExportType(options.format);
  const image = renderer.captureImage(type, normalizeQuality(options.quality));
  const dataUrl = image.src;

  if (!dataUrl) {
    throw new Error("mini-gl capture did not return an image data URL.");
  }

  return {
    image,
    dataUrl,
    type,
    width: renderer.gl.canvas.width,
    height: renderer.gl.canvas.height,
  };
}

export function captureRendererDataUrl(
  renderer: MiniGlRenderer,
  options: CaptureRendererImageOptions = {},
): string {
  return captureRendererImage(renderer, options).dataUrl;
}

export async function captureRendererBlob(
  renderer: MiniGlRenderer,
  options: CaptureRendererImageOptions = {},
): Promise<CapturedRendererBlob> {
  const capture = captureRendererImage(renderer, options);
  const blob = await dataUrlToBlob(capture.dataUrl);

  return {
    blob,
    type: blob.type || capture.type,
    width: capture.width,
    height: capture.height,
  };
}

export async function captureRendererArrayBuffer(
  renderer: MiniGlRenderer,
  options: CaptureRendererImageOptions = {},
): Promise<CapturedRendererArrayBuffer> {
  const capture = captureRendererImage(renderer, options);
  const arrayBuffer = await dataUrlToArrayBuffer(capture.dataUrl);

  return {
    arrayBuffer,
    type: capture.type,
    width: capture.width,
    height: capture.height,
  };
}

export async function captureRendererBlobWithExif(
  renderer: MiniGlRenderer,
  options: CaptureRendererExifOptions = {},
): Promise<CapturedRendererBlob> {
  if (!options.originalExif) {
    return captureRendererBlob(renderer, options);
  }

  const capture = await captureRendererArrayBuffer(renderer, options);
  const blob = createExifOutputBlob(capture.arrayBuffer, {
    originalExif: options.originalExif,
    patchOrientationToOne: options.patchOrientationToOne,
    type: capture.type,
  });

  return {
    blob,
    type: blob.type || capture.type,
    width: capture.width,
    height: capture.height,
  };
}

export async function captureRendererArrayBufferWithExif(
  renderer: MiniGlRenderer,
  options: CaptureRendererExifOptions = {},
): Promise<CapturedRendererArrayBuffer> {
  const capture = await captureRendererArrayBuffer(renderer, options);

  if (!options.originalExif) {
    return capture;
  }

  return {
    arrayBuffer: createExifOutputArrayBuffer(capture.arrayBuffer, {
      originalExif: options.originalExif,
      patchOrientationToOne: options.patchOrientationToOne,
      type: capture.type,
    }),
    type: capture.type,
    width: capture.width,
    height: capture.height,
  };
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error(`Failed to read image data URL: ${response.status} ${response.statusText}`);
  }

  return response.blob();
}

export async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error(`Failed to read image data URL: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

function normalizeExportType(format: ImageExportFormat | undefined): string {
  if (!format) return DEFAULT_EXPORT_TYPE;
  if (format.startsWith("image/")) return format;
  if (format === "jpg") return "image/jpeg";
  return `image/${format}`;
}

function normalizeQuality(quality: number | undefined): number | false {
  return typeof quality === "number" ? clamp(quality, 0, 1) : false;
}

