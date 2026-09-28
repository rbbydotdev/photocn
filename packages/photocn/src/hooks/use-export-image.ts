import { useCallback, useMemo, useState } from "react";

import {
  captureRendererArrayBufferWithExif,
  captureRendererBlobWithExif,
  captureRendererDataUrl,
  captureRendererImage,
  type CaptureRendererExifOptions,
  type CapturedRendererArrayBuffer,
  type CapturedRendererBlob,
  type CapturedRendererImage,
  type ImageExportFormat,
  type MiniGlRenderer,
} from "../dom";

export type ExportImageStatus = "idle" | "exporting" | "exported" | "error";
export type ExportImageResult =
  | CapturedRendererImage
  | CapturedRendererBlob
  | CapturedRendererArrayBuffer
  | string;

export type ExportImageOptions = CaptureRendererExifOptions;

export interface UseExportImageOptions<TRenderer extends MiniGlRenderer = MiniGlRenderer>
  extends ExportImageOptions {
  renderer?: TRenderer | null;
  onExport?: (result: ExportImageResult) => void;
  onError?: (error: unknown) => void;
}

export interface UseExportImageResult<TRenderer extends MiniGlRenderer = MiniGlRenderer> {
  status: ExportImageStatus;
  error: unknown;
  result: ExportImageResult | null;
  isExporting: boolean;
  canExport: boolean;
  exportImage: (
    renderer?: TRenderer | null,
    options?: ExportImageOptions,
  ) => Promise<CapturedRendererImage>;
  exportDataUrl: (
    renderer?: TRenderer | null,
    options?: ExportImageOptions,
  ) => Promise<string>;
  exportBlob: (
    renderer?: TRenderer | null,
    options?: ExportImageOptions,
  ) => Promise<CapturedRendererBlob>;
  exportArrayBuffer: (
    renderer?: TRenderer | null,
    options?: ExportImageOptions,
  ) => Promise<CapturedRendererArrayBuffer>;
  reset: () => void;
}

const defaultFormat: ImageExportFormat = "png";

function mergeOptions(
  defaults: ExportImageOptions,
  overrides: ExportImageOptions = {},
): ExportImageOptions {
  return {
    ...defaults,
    ...overrides,
  };
}

function assertRenderer<TRenderer extends MiniGlRenderer>(
  renderer: TRenderer | null | undefined,
): TRenderer {
  if (!renderer) {
    throw new Error("A renderer is required to export an image.");
  }

  return renderer;
}

export function useExportImage<TRenderer extends MiniGlRenderer = MiniGlRenderer>({
  renderer,
  format = defaultFormat,
  quality,
  originalExif,
  patchOrientationToOne,
  onExport,
  onError,
}: UseExportImageOptions<TRenderer> = {}): UseExportImageResult<TRenderer> {
  const [status, setStatus] = useState<ExportImageStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ExportImageResult | null>(null);
  const defaults = useMemo<ExportImageOptions>(
    () => ({
      format,
      quality,
      originalExif,
      patchOrientationToOne,
    }),
    [format, originalExif, patchOrientationToOne, quality],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
  }, []);

  const runExport = useCallback(
    async <TResult extends ExportImageResult>(exporter: () => TResult | Promise<TResult>) => {
      setStatus("exporting");
      setError(null);

      try {
        const nextResult = await exporter();
        setResult(nextResult);
        setStatus("exported");
        onExport?.(nextResult);
        return nextResult;
      } catch (nextError) {
        setError(nextError);
        setStatus("error");
        onError?.(nextError);
        throw nextError;
      }
    },
    [onError, onExport],
  );

  const exportImage = useCallback(
    (nextRenderer?: TRenderer | null, options?: ExportImageOptions) =>
      runExport(() =>
        captureRendererImage(
          assertRenderer(nextRenderer ?? renderer),
          mergeOptions(defaults, options),
        ),
      ),
    [defaults, renderer, runExport],
  );

  const exportDataUrl = useCallback(
    (nextRenderer?: TRenderer | null, options?: ExportImageOptions) =>
      runExport(() =>
        captureRendererDataUrl(
          assertRenderer(nextRenderer ?? renderer),
          mergeOptions(defaults, options),
        ),
      ),
    [defaults, renderer, runExport],
  );

  const exportBlob = useCallback(
    (nextRenderer?: TRenderer | null, options?: ExportImageOptions) =>
      runExport(() =>
        captureRendererBlobWithExif(
          assertRenderer(nextRenderer ?? renderer),
          mergeOptions(defaults, options),
        ),
      ),
    [defaults, renderer, runExport],
  );

  const exportArrayBuffer = useCallback(
    (nextRenderer?: TRenderer | null, options?: ExportImageOptions) =>
      runExport(() =>
        captureRendererArrayBufferWithExif(
          assertRenderer(nextRenderer ?? renderer),
          mergeOptions(defaults, options),
        ),
      ),
    [defaults, renderer, runExport],
  );

  return {
    status,
    error,
    result,
    isExporting: status === "exporting",
    canExport: Boolean(renderer),
    exportImage,
    exportDataUrl,
    exportBlob,
    exportArrayBuffer,
    reset,
  };
}
