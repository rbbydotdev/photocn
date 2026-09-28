import { useCallback } from "react";

import type {
  BrowserImageInput,
  BrowserImageInputResult,
  DecodeImageInputOptions,
  MiniGlRenderer,
} from "../dom";
import type {
  EditorColorSpace,
  EditorParams,
  EditorRenderer,
} from "..";
import { detectColorSpace } from "..";

import {
  useExifMetadata,
  type UseExifMetadataOptions,
  type UseExifMetadataResult,
} from "./use-exif-metadata";
import {
  useExportImage,
  type UseExportImageOptions,
  type UseExportImageResult,
} from "./use-export-image";
import {
  useHistogram,
  type UseHistogramOptions,
  type UseHistogramResult,
} from "./use-histogram";
import {
  useImageInput,
  type UseImageInputResult,
} from "./use-image-input";
import {
  useMiniGlEditor,
  type CreateMiniGlEditor,
  type MiniGlEditorImage,
  type MiniGlEditorInstance,
  type MiniGlEditorReady,
  type UseMiniGlEditorResult,
} from "./use-mini-gl-editor";
import {
  useRenderPipeline,
  type UseRenderPipelineResult,
} from "./use-render-pipeline";

export interface MiniPhotoEditorHistogramOptions
  extends Omit<UseHistogramOptions, "autoDraw" | "image" | "pixels"> {
  enabled?: boolean;
  drawOnRender?: boolean;
}

export type MiniPhotoEditorExifOptions = UseExifMetadataOptions;

export interface UseMiniPhotoEditorOptions<
  TRenderer extends MiniGlRenderer = MiniGlRenderer,
  TEditor extends MiniGlEditorInstance<TRenderer> = MiniGlEditorInstance<TRenderer>,
  TImage = MiniGlEditorImage,
> {
  input?: BrowserImageInput | null;
  image?: TImage | null;
  decodeOptions?: DecodeImageInputOptions;
  autoDecode?: boolean;
  colorspace?: EditorColorSpace;
  createEditor?: CreateMiniGlEditor<TRenderer, TEditor, TImage>;
  params?: EditorParams | null;
  autoRender?: boolean;
  exifOptions?: MiniPhotoEditorExifOptions;
  histogramOptions?: MiniPhotoEditorHistogramOptions;
  exportOptions?: Omit<UseExportImageOptions<TRenderer>, "renderer">;
  onImageLoad?: (result: BrowserImageInputResult) => void;
  onImageError?: (error: unknown) => void;
  onEditorReady?: (ready: MiniGlEditorReady<TRenderer, TEditor>) => void;
  onEditorError?: (error: unknown) => void;
  onHistogramUpdate?: () => void;
}

export interface UseMiniPhotoEditorResult<
  TRenderer extends MiniGlRenderer = MiniGlRenderer,
  TEditor extends MiniGlEditorInstance<TRenderer> = MiniGlEditorInstance<TRenderer>,
> {
  imageInput: UseImageInputResult;
  miniGl: UseMiniGlEditorResult<TRenderer, TEditor>;
  renderPipeline: UseRenderPipelineResult;
  exif: UseExifMetadataResult;
  histogram: UseHistogramResult;
  exportImage: UseExportImageResult<TRenderer>;
  renderer: TRenderer | null;
  editor: TEditor | null;
  canRender: boolean;
  canExport: boolean;
  isReady: boolean;
}

export function useMiniPhotoEditor<
  TRenderer extends MiniGlRenderer = MiniGlRenderer,
  TEditor extends MiniGlEditorInstance<TRenderer> = MiniGlEditorInstance<TRenderer>,
  TImage = MiniGlEditorImage,
>({
  input,
  image,
  decodeOptions,
  autoDecode,
  colorspace,
  createEditor,
  params,
  autoRender,
  exifOptions,
  histogramOptions,
  exportOptions,
  onImageLoad,
  onImageError,
  onEditorReady,
  onEditorError,
  onHistogramUpdate,
}: UseMiniPhotoEditorOptions<TRenderer, TEditor, TImage> = {}): UseMiniPhotoEditorResult<
  TRenderer,
  TEditor
> {
  const imageInput = useImageInput({
    input,
    decodeOptions,
    autoDecode,
    onLoad: onImageLoad,
    onError: onImageError,
  });
  const activeImage = image ?? (imageInput.image as TImage | null);
  const { source: exifSourceOption, ...exifReadOptions } = exifOptions ?? {};
  const shouldAutoReadExif = exifReadOptions.autoRead ?? true;
  const exifSource =
    exifOptions && "source" in exifOptions
      ? exifSourceOption
      : imageInput.arrayBuffer;
  const exif = useExifMetadata({
    ...exifReadOptions,
    source: exifSource,
  });
  const shouldResolveColorFromExif =
    colorspace === undefined &&
    shouldAutoReadExif &&
    exifSource !== null &&
    exifSource !== undefined;
  const exifColorReady =
    !shouldResolveColorFromExif ||
    exif.status === "loaded" ||
    exif.status === "error";
  const resolvedColorspace = colorspace ?? detectColorSpace(exif.metadata);
  const editorImage = exifColorReady ? activeImage : null;
  const miniGl = useMiniGlEditor<TRenderer, TEditor, TImage>({
    image: editorImage,
    colorspace: resolvedColorspace,
    createEditor,
    onReady: onEditorReady,
    onError: onEditorError,
  });
  const {
    enabled: histogramEnabled = true,
    drawOnRender = true,
    ...histogramRendererOptions
  } = histogramOptions ?? {};
  const histogram = useHistogram(histogramRendererOptions);
  // Depend on the stable histogram.draw callback rather than the whole result
  // object — the latter gets rebuilt every render of useHistogram and would
  // otherwise flip updateHistogram's identity on every render.
  const histogramDraw = histogram.draw;
  const updateHistogram = useCallback(() => {
    if (histogramEnabled && drawOnRender && miniGl.renderer) {
      histogramDraw(miniGl.renderer.readPixels());
    }

    onHistogramUpdate?.();
  }, [
    drawOnRender,
    histogramDraw,
    histogramEnabled,
    miniGl.renderer,
    onHistogramUpdate,
  ]);
  const renderPipeline = useRenderPipeline({
    renderer: miniGl.renderer as unknown as EditorRenderer | null,
    params,
    autoRender,
    onHistogramUpdate: updateHistogram,
  });
  const hasExportOriginalExif = Boolean(
    exportOptions && "originalExif" in exportOptions,
  );
  const exportImage = useExportImage<TRenderer>({
    ...exportOptions,
    originalExif: hasExportOriginalExif
      ? exportOptions?.originalExif
      : exif.handle,
    renderer: miniGl.renderer,
  });

  return {
    imageInput,
    miniGl,
    renderPipeline,
    exif,
    histogram,
    exportImage,
    renderer: miniGl.renderer,
    editor: miniGl.editor,
    canRender: renderPipeline.canRender,
    canExport: exportImage.canExport,
    isReady: miniGl.isReady,
  };
}
