import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  createEditorParams,
  type EditorParamSection,
  type EditorParams,
} from "../editor-params";
import {
  imageAspectRatio,
  resizeDimensionsFromHeight,
  resizeDimensionsFromWidth,
  rotateCanvasAngle,
} from "../composition";
import { stageRectToImageRect } from "../crop-projection";
import type { PerspectiveQuad } from "../perspective-geometry";
import {
  createExifOutputBlob,
  type BrowserExifHandle,
  type BrowserImageInput,
  type BrowserImageInputResult,
  type DecodeImageInputOptions,
  type RgbHistogram,
  type SelectImageFileOptions,
} from "../dom";
import { applyRecipe, buildRecipe, type RecipeV1 } from "../recipes";
import {
  filterPresets as defaultFilterPresets,
  findFilterPreset,
  type FilterPreset,
} from "../filters";
import {
  createWorkerMiniGlEditorFactory,
  type ProxyMaxDimResolver,
  type WorkerEditor,
} from "../worker";
import { spawnInlineWorker, supportsWorkerRendering } from "../worker/inline";
import { useControllableState } from "../hooks/use-controllable-state";
import { useEditorHistory } from "../hooks/use-editor-history";
import {
  useMiniPhotoEditor,
  type UseMiniPhotoEditorResult,
} from "../hooks/use-mini-photo-editor";

import {
  bestFitCropForAspect,
  extractCropRect,
  inferAspectRatioLabel,
  parseAspectRatio,
  patchEditorParams,
  reshapeCropToAspect,
  resolvePreviewSize,
  rotationFitScale,
  type ParamPatch,
  type PreviewSize,
} from "./helpers";
import {
  adjustDefaultValue,
  aspectRatioOptions as defaultAspectRatioOptions,
  blurDefaultValue,
  type AdjustColorValue,
  type AdjustEffectValue,
  type AdjustLightValue,
  type AdjustSection,
  type AdjustValue,
  type AspectRatioOption,
  type BlendValue,
  type BlurValue,
  type CropRect,
  type CropTransformValue,
  type CurveChannels,
  type FiltersValue,
  type ImageEditorToolId,
  type ResizeChange,
  type ResizeValue,
  type ViewTransform,
} from "./types";
import { useImageEditorKeybindings } from "./use-image-editor-keybindings";

export type ImageEditorSource = BrowserImageInput;

export type ImageEditorExportFormat = "png" | "jpeg" | "webp";

export interface ImageEditorExportOptions {
  /** Default `"png"`. */
  format?: ImageEditorExportFormat;
  /** 0..1, for lossy formats. Defaults: jpeg 0.92, webp 0.9. */
  quality?: number;
  /** Copy the source EXIF block into the output (JPEG only). Default `true`. */
  preserveExif?: boolean;
}

export interface ImageEditorExportResult {
  blob: Blob;
  type: string;
  width: number;
  height: number;
  /** Suggested filename including the extension. */
  filename: string;
}

export interface UseImageEditorStateOptions {
  /** Image to edit: URL, File, Blob, ArrayBuffer or an `<img>` element. */
  src?: ImageEditorSource | null;
  /** Decode hints (name/type) used when `src` is a Blob/ArrayBuffer. */
  decodeOptions?: DecodeImageInputOptions;
  /** Params to start from (e.g. a saved edit). Uncontrolled. */
  defaultParams?: EditorParams;
  /** Called after every edit with the full params snapshot. */
  onParamsChange?: (params: EditorParams) => void;
  /** Controlled active tool. */
  tool?: ImageEditorToolId;
  /** Initial tool when uncontrolled. Default `"adjust"`. */
  defaultTool?: ImageEditorToolId;
  onToolChange?: (tool: ImageEditorToolId) => void;
  onImageLoad?: (result: BrowserImageInputResult) => void;
  onImageError?: (error: unknown) => void;
  /** Called after a successful `exportImage()`. */
  onExport?: (result: ImageEditorExportResult) => void;
  /** Disable every interaction. */
  disabled?: boolean;
  /** Filter presets offered by `filters.presets`. */
  filterPresets?: readonly FilterPreset[];
  /** Aspect ratio options offered by `crop.aspectRatioOptions`. */
  aspectRatioOptions?: readonly AspectRatioOption[];
  /**
   * Where rendering happens. `"worker"` (default when supported) renders on an
   * OffscreenCanvas in a Web Worker; `"main"` renders on the main thread.
   */
  renderMode?: "worker" | "main";
  /**
   * Custom worker spawner — use when your CSP forbids `blob:` workers:
   * `() => new Worker(new URL("photocn/worker/entry", import.meta.url), { type: "module" })`
   */
  spawnWorker?: () => Worker;
  /** Preview proxy long-edge cap. `0` disables. Default: canvas size x DPR. */
  proxyMaxDim?: number | ProxyMaxDimResolver;
  /** Global keyboard shortcuts (undo/redo, Esc clears crop). Default `true`. */
  keyboardShortcuts?: boolean;
  /** Undo stack depth. Default 100. */
  historyLimit?: number;
  /** Debounce (ms) that folds slider drags into one undo step. Default 400. */
  commitDelay?: number;
}

export type ImageEditorStatus = "idle" | "loading" | "ready" | "error";

export interface ImageEditorApi {
  /** Current committed + transient params (what the user sees). */
  params: EditorParams;
  /** Params actually sent to the renderer (compare / crop preview aware). */
  renderParams: EditorParams;
  /** Replace all params (one undo step). */
  setParams: (params: EditorParams) => void;
  /**
   * Patch one params section. `transient: true` coalesces rapid updates
   * (slider drags) into a single undo step.
   */
  patch: (
    section: EditorParamSection,
    patch: Record<string, unknown>,
    options?: { transient?: boolean },
  ) => void;
  /** Flush pending transient edits into history now. */
  commit: () => void;
  /** Reset every edit. */
  resetAll: () => void;

  status: ImageEditorStatus;
  error: unknown;
  disabled: boolean;
  isLoading: boolean;
  isReady: boolean;
  hasImage: boolean;
  /** Object/remote URL of the current image, if any. */
  imageSrc: string | null;
  imageSize: PreviewSize | null;
  filename: string | undefined;
  /** Open the OS file picker and load the chosen image. */
  openFile: (options?: SelectImageFileOptions) => Promise<void>;
  /** Load an image programmatically (File, Blob, URL...). */
  load: (src: ImageEditorSource, options?: DecodeImageInputOptions) => Promise<void>;

  tool: ImageEditorToolId;
  setTool: (tool: ImageEditorToolId) => void;

  history: {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
  };

  /** Hold-to-compare against the unedited image (geometry preserved). */
  compare: {
    active: boolean;
    setActive: (active: boolean) => void;
  };

  adjust: {
    value: AdjustValue;
    setLights: (lights: AdjustLightValue) => void;
    setColors: (colors: AdjustColorValue) => void;
    setEffects: (effects: AdjustEffectValue) => void;
    resetSection: (section: AdjustSection) => void;
    reset: () => void;
  };

  filters: {
    value: FiltersValue;
    presets: readonly FilterPreset[];
    /** Label currently being loaded, if any. */
    loading: string | null;
    select: (preset: FilterPreset | string | null) => Promise<void>;
    setMix: (mix: number) => void;
    reset: () => void;
  };

  blend: {
    value: BlendValue;
    hasImage: boolean;
    setImage: (image: HTMLImageElement | null) => void;
    setMix: (mix: number) => void;
    reset: () => void;
  };

  blur: {
    value: BlurValue;
    set: (value: BlurValue) => void;
    setCenter: (center: { centerX: number; centerY: number }) => void;
    commitCenter: (center: { centerX: number; centerY: number }) => void;
    reset: () => void;
  };

  curves: {
    value: CurveChannels | null;
    /** Live histogram of the rendered image, for drawing behind the curve. */
    histogram: RgbHistogram | null;
    set: (value: CurveChannels) => void;
    commit: () => void;
    reset: () => void;
  };

  crop: {
    /** Draft rect in stage-percent coordinates. */
    rect: CropRect;
    isDrawn: boolean;
    aspectRatio: string;
    /** Numeric ratio (w/h) or null for free. */
    aspectRatioValue: number | null;
    aspectRatioOptions: readonly AspectRatioOption[];
    setAspectRatio: (value: string) => void;
    /** Live update while dragging (transient). */
    update: (rect: CropRect) => void;
    /** Commit a dragged rect as the applied crop. */
    commitDrag: (rect: CropRect) => void;
    /** Hide the draft rect; the committed crop stays applied. */
    apply: () => void;
    /** Drop the draft rect. */
    clear: () => void;
    transform: CropTransformValue;
    setTransform: (value: CropTransformValue) => void;
    /** Quarter-turn canvas rotation. */
    canvasAngle: number;
    rotate: (delta: 90 | -90) => void;
    resize: ResizeValue;
    setResize: (next: ResizeChange) => void;
    resetResize: () => void;
    /** Reset crop, rotation, flips and zoom. */
    reset: () => void;
  };

  perspective: {
    isEditing: boolean;
    hasCommitted: boolean;
    /** Handle positions (normalized 0..1) while editing. */
    quad: PerspectiveQuad;
    toggle: () => void;
    change: (quad: PerspectiveQuad) => void;
    commit: (quad: PerspectiveQuad) => void;
    reset: () => void;
  };

  recipes: {
    /** Serializable diff of the current look, or null when unedited. */
    current: RecipeV1 | null;
    apply: (recipe: RecipeV1) => Promise<void>;
  };

  histogram: {
    data: RgbHistogram | null;
    /** Attach to a `<canvas>` to have the histogram drawn for you. */
    canvasRef: RefObject<HTMLCanvasElement | null>;
  };

  /** Encode the edited image. Rendering happens off-thread when possible. */
  exportImage: (options?: ImageEditorExportOptions) => Promise<ImageEditorExportResult>;
  /** Export and trigger a browser download. */
  download: (options?: ImageEditorExportOptions) => Promise<ImageEditorExportResult>;

  /** View transform for the preview (rotation/zoom outside compose mode). */
  view: ViewTransform;
  /** Attach to the measured stage element the canvas is drawn in. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Attach to the editor's outer element (scopes keyboard shortcuts). */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Attach to the preview `<canvas>`. */
  canvasRef: RefObject<HTMLCanvasElement | null>;

  /** Low-level engine (renderer, EXIF, raw hooks) — escape hatch. */
  engine: UseMiniPhotoEditorResult;
  /** Worker bridge when rendering off-thread. */
  worker: WorkerEditor | undefined;
}

const defaultCrop: CropRect = { x: 10, y: 10, width: 80, height: 80 };
const identityView: ViewTransform = { zoom: 1, rotation: 0 };
const PERSPECTIVE_SOURCE_FULL: PerspectiveQuad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const fullQuad = () =>
  PERSPECTIVE_SOURCE_FULL.map((point) => [...point]) as unknown as PerspectiveQuad;

const exportFormatInfo: Record<
  ImageEditorExportFormat,
  { mime: string; extension: string; quality?: number }
> = {
  png: { mime: "image/png", extension: "png" },
  jpeg: { mime: "image/jpeg", extension: "jpg", quality: 0.92 },
  webp: { mime: "image/webp", extension: "webp", quality: 0.9 },
};

/**
 * The headless image editor. Owns params + history, the renderer, and every
 * editing action. Render any UI you like on top of the returned API, or pass
 * it to `<ImageEditorProvider>` so composable components can reach it.
 */
export function useImageEditorState(
  options: UseImageEditorStateOptions = {},
): ImageEditorApi {
  const {
    src,
    decodeOptions,
    defaultParams,
    onParamsChange,
    tool: toolProp,
    defaultTool = "adjust",
    onToolChange,
    onImageLoad,
    onImageError,
    onExport,
    disabled = false,
    filterPresets = defaultFilterPresets,
    aspectRatioOptions = defaultAspectRatioOptions,
    renderMode,
    spawnWorker,
    proxyMaxDim,
    keyboardShortcuts = true,
    historyLimit,
    commitDelay = 400,
  } = options;

  const {
    params,
    patchSection,
    setParams: setHistoryParams,
    commit,
    reset,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditorHistory({ initialParams: defaultParams, limit: historyLimit });

  const [tool, setTool] = useControllableState<ImageEditorToolId>({
    value: toolProp,
    defaultValue: defaultTool,
    onChange: onToolChange,
  });
  const isComposeTool = tool === "compose";

  // ── Hold-to-compare ────────────────────────────────────────────────────
  // Renders the original content within the current geometric frame: crop,
  // rotation, flips, perspective and resize are kept so nothing jumps; every
  // color/tonal op reverts.
  const [isComparing, setIsComparing] = useState(false);
  const compareBaseline = useMemo(() => {
    const base = createEditorParams();
    base.crop.appliedCrop = params.crop.appliedCrop;
    base.crop.canvas_angle = params.crop.canvas_angle;
    Object.assign(base.trs, params.trs);
    Object.assign(base.perspective2, params.perspective2);
    Object.assign(base.resizer, params.resizer);
    return base;
  }, [
    params.crop.appliedCrop,
    params.crop.canvas_angle,
    params.trs,
    params.perspective2,
    params.resizer,
  ]);

  // ── Perspective (direct manipulation of the photo's corners) ───────────
  const [isEditingPerspective, setIsEditingPerspective] = useState(false);
  const [isDraggingPerspective, setIsDraggingPerspective] = useState(false);
  const [perspectiveDraft, setPerspectiveDraft] =
    useState<PerspectiveQuad>(fullQuad);

  const renderParams = useMemo<EditorParams>(() => {
    if (isComparing) return compareBaseline;
    // While a draft crop rect is on screen in compose mode, render the
    // un-cropped image so the overlay sits on the original.
    if (isComposeTool && extractCropRect(params.crop.currentcrop)) {
      return patchEditorParams(params, "crop", { appliedCrop: 0 });
    }
    if (isEditingPerspective && isDraggingPerspective) {
      return patchEditorParams(params, "perspective2", {
        before: PERSPECTIVE_SOURCE_FULL,
        after: perspectiveDraft,
        modified: 1,
      });
    }
    return params;
  }, [
    isComparing,
    compareBaseline,
    isComposeTool,
    isEditingPerspective,
    isDraggingPerspective,
    perspectiveDraft,
    params,
  ]);

  // ── Engine ─────────────────────────────────────────────────────────────
  const [useWorker] = useState(() =>
    renderMode ? renderMode === "worker" : supportsWorkerRendering(),
  );
  const [workerHistogram, setWorkerHistogram] = useState<RgbHistogram | null>(
    null,
  );
  const spawnRef = useRef(spawnWorker);
  spawnRef.current = spawnWorker;
  const workerFactory = useMemo(
    () =>
      useWorker
        ? createWorkerMiniGlEditorFactory({
            spawn: () => (spawnRef.current ?? spawnInlineWorker)(),
            proxyMaxDim,
            onHistogram: setWorkerHistogram,
          })
        : undefined,
    // proxyMaxDim is read once per editor instance; changing it later would
    // tear down the renderer mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useWorker],
  );

  const engine = useMiniPhotoEditor({
    input: src ?? undefined,
    decodeOptions,
    onImageLoad,
    onImageError,
    params: renderParams,
    autoRender: true,
    createEditor: workerFactory,
    histogramOptions: useWorker
      ? { drawOnRender: false, precomputed: workerHistogram }
      : undefined,
  });
  const imageInput = engine.imageInput;
  const worker = (engine.editor as unknown as { worker?: WorkerEditor } | null)
    ?.worker;

  // Don't swap the preview proxy to full-res mid compare-hold (avoids flash).
  useEffect(() => {
    worker?.setConfig({ suspendIdleSwap: isComparing });
  }, [worker, isComparing]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const previewSize = resolvePreviewSize(engine.renderer, imageInput.image);
  const previewAspectRatio = previewSize ? imageAspectRatio(previewSize) : 0;

  const aspectRatio = useMemo(
    () =>
      inferAspectRatioLabel(
        params.crop.ar ?? 0,
        previewAspectRatio,
        aspectRatioOptions,
      ),
    [params.crop.ar, previewAspectRatio, aspectRatioOptions],
  );
  const aspectRatioValue = useMemo(
    () => parseAspectRatio(aspectRatio, previewAspectRatio),
    [aspectRatio, previewAspectRatio],
  );
  const cropRect = extractCropRect(params.crop.currentcrop);
  const crop = cropRect ?? defaultCrop;
  const isCropDrawn = cropRect !== null;
  const rotationScale = rotationFitScale(previewSize, params.trs.angle ?? 0);
  // params.trs.scale = zoom * fitScale - 1  ⇒  zoom = (scale + 1) / fitScale
  const cropZoom = rotationScale > 0 ? (params.trs.scale + 1) / rotationScale : 1;
  const view = useMemo<ViewTransform>(
    () =>
      isComposeTool
        ? identityView
        : { rotation: params.trs.angle ?? 0, zoom: cropZoom * rotationScale },
    [isComposeTool, params.trs.angle, cropZoom, rotationScale],
  );

  // ── Commit plumbing ────────────────────────────────────────────────────
  // Slider drags patch transiently and schedule a debounced commit so a whole
  // gesture becomes one undo step. Discrete actions flush first.
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const onParamsChangeRef = useRef(onParamsChange);
  onParamsChangeRef.current = onParamsChange;

  const flushCommit = useCallback(() => {
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
      commit();
    }
  }, [commit]);

  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const emit = (next: EditorParams) => onParamsChangeRef.current?.(next);

  const patchNow = (section: EditorParamSection, patch: Record<string, unknown>) => {
    flushCommit();
    patchSection(section, patch);
    emit(patchEditorParams(paramsRef.current, section, patch));
  };

  const patchTransient = (
    section: EditorParamSection,
    patch: Record<string, unknown>,
  ) => {
    patchSection(section, patch, { transient: true });
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      commit();
    }, commitDelay);
    emit(patchEditorParams(paramsRef.current, section, patch));
  };

  const replaceAll = (patches: readonly ParamPatch[]) => {
    flushCommit();
    const next = patchEditorParams(paramsRef.current, patches);
    setHistoryParams(next);
    emit(next);
  };

  const setParams = (next: EditorParams) => {
    flushCommit();
    setHistoryParams(next);
    emit(next);
  };

  const resetAll = () => {
    flushCommit();
    setIsEditingPerspective(false);
    setIsDraggingPerspective(false);
    reset();
    emit(createEditorParams());
  };

  // ── Image IO ───────────────────────────────────────────────────────────
  const imageSrc =
    imageInput.image?.currentSrc ||
    imageInput.image?.src ||
    (typeof src === "string" ? src : null);
  const filename = imageInput.fileInfo?.name;

  const openFile = async (selectOptions?: SelectImageFileOptions) => {
    await imageInput.select(selectOptions).catch(() => undefined);
  };
  const load = async (
    next: ImageEditorSource,
    loadOptions?: DecodeImageInputOptions,
  ) => {
    await imageInput.decode(next, loadOptions);
  };

  // ── Crop / composition ─────────────────────────────────────────────────
  const updateCrop = (rect: CropRect) => patchTransient("crop", { currentcrop: rect });

  const commitCropFromDrag = (rect: CropRect) => {
    // A click without a real drag: keep the overlay, don't crop to nothing.
    if (rect.width < 1 || rect.height < 1) {
      updateCrop(rect);
      return;
    }
    const renderer = engine.renderer;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!renderer || !stage || stage.width <= 0 || stage.height <= 0) return;
    const cropBox = stageRectToImageRect(
      rect,
      { width: stage.width, height: stage.height },
      { width: renderer.width, height: renderer.height },
    );
    if (!cropBox) return;
    // `currentcrop` keeps the draft on screen; `appliedCrop` is what the
    // pipeline (and export) actually crops to.
    replaceAll([
      {
        section: "crop",
        patch: {
          currentcrop: rect,
          glcrop: 0,
          appliedCrop: cropBox,
          ar: 0,
          arindex: 0,
        },
      },
      { section: "trs", patch: { angle: 0, scale: 0, fliph: 0, flipv: 0 } },
    ]);
  };

  const setAspectRatio = (value: string) => {
    const ratio = parseAspectRatio(value, previewAspectRatio);
    if (!ratio) {
      patchNow("crop", { ar: 0 });
      return;
    }
    const stage = stageRef.current?.getBoundingClientRect();
    const reshaped =
      stage && previewSize
        ? bestFitCropForAspect(
            { width: stage.width, height: stage.height },
            previewSize,
            ratio,
          )
        : reshapeCropToAspect(crop, ratio);
    patchNow("crop", { ar: ratio, currentcrop: reshaped });
  };

  const setTransform = (next: CropTransformValue) => {
    const fit = rotationFitScale(previewSize, next.rotation);
    patchTransient("trs", {
      angle: next.rotation,
      scale: (next.scale / 100) * fit - 1,
      fliph: next.flipHorizontal,
      flipv: next.flipVertical,
    });
  };

  const setResize = (next: ResizeChange) => {
    const aspect = previewSize ? imageAspectRatio(previewSize) : 0;
    if (!next.locked || !aspect) {
      patchNow("resizer", { width: next.width, height: next.height });
      return;
    }
    const widthChanged = next.width !== (params.resizer.width ?? 0);
    const dims = widthChanged
      ? resizeDimensionsFromWidth(next.width, aspect)
      : resizeDimensionsFromHeight(next.height, aspect);
    patchNow("resizer", { width: dims.width, height: dims.height });
  };

  const resetComposition = () =>
    replaceAll([
      {
        section: "crop",
        patch: { currentcrop: 0, glcrop: 0, appliedCrop: 0, ar: 0, canvas_angle: 0 },
      },
      { section: "trs", patch: { angle: 0, scale: 0, fliph: 0, flipv: 0 } },
    ]);

  const clearCrop = () => patchNow("crop", { currentcrop: 0, ar: 0, arindex: 0 });

  // ── Perspective ────────────────────────────────────────────────────────
  const togglePerspective = () => {
    if (isEditingPerspective) {
      setIsEditingPerspective(false);
      setIsDraggingPerspective(false);
      return;
    }
    const committed = params.perspective2.after;
    setPerspectiveDraft(
      committed && typeof committed !== "number" ? committed : fullQuad(),
    );
    setIsEditingPerspective(true);
  };

  const commitPerspective = (quad: PerspectiveQuad) => {
    setIsDraggingPerspective(false);
    replaceAll([
      {
        section: "perspective2",
        patch: { before: PERSPECTIVE_SOURCE_FULL, after: quad, modified: 1 },
      },
    ]);
  };

  const resetPerspective = () => {
    replaceAll([
      { section: "perspective2", patch: { before: 0, after: 0, modified: 0 } },
    ]);
    setPerspectiveDraft(fullQuad());
    setIsEditingPerspective(false);
    setIsDraggingPerspective(false);
  };

  // ── Filters ────────────────────────────────────────────────────────────
  const [loadingFilter, setLoadingFilter] = useState<string | null>(null);
  const selectFilter = async (preset: FilterPreset | string | null) => {
    if (preset === null) {
      patchNow("filters", { opt: 0 });
      return;
    }
    const resolved =
      typeof preset === "string" ? findFilterPreset(preset, filterPresets) : preset;
    if (!resolved) throw new Error(`Unknown filter preset "${String(preset)}"`);
    setLoadingFilter(resolved.label);
    try {
      const opt = await resolved.load();
      patchNow("filters", { opt });
    } finally {
      setLoadingFilter(null);
    }
  };

  // ── Recipes ────────────────────────────────────────────────────────────
  const applyRecipeAsync = async (recipe: RecipeV1) => {
    const next = applyRecipe(paramsRef.current, recipe);
    const preset = recipe.filters?.label
      ? findFilterPreset(recipe.filters.label, filterPresets)
      : undefined;
    if (recipe.filters?.label) {
      try {
        next.filters.opt = preset ? await preset.load() : 0;
      } catch {
        next.filters.opt = 0;
      }
    }
    setParams(next);
  };

  // ── Export ─────────────────────────────────────────────────────────────
  const exportImage = async (
    exportOptions: ImageEditorExportOptions = {},
  ): Promise<ImageEditorExportResult> => {
    const format = exportOptions.format ?? "png";
    const info = exportFormatInfo[format];
    const quality = exportOptions.quality ?? info.quality;
    const renderer = engine.renderer;
    if (!renderer) throw new Error("The image is not ready to export yet.");
    // The preview may be showing an override (compose draft, compare);
    // render the real params for capture, then restore the view.
    engine.renderPipeline.render({ params: paramsRef.current });
    try {
      let blob: Blob;
      let type: string;
      let width: number;
      let height: number;
      if (worker) {
        const result = await worker.exportBlob({ format: info.mime, quality });
        ({ blob, type, width, height } = result);
      } else {
        const result = await engine.exportImage.exportBlob(renderer, {
          format,
          quality,
          originalExif: null,
        });
        ({ blob, width, height } = result);
        type = blob.type || info.mime;
      }
      const exif = engine.exif.handle as BrowserExifHandle | null | undefined;
      if (exportOptions.preserveExif !== false && exif && format === "jpeg") {
        blob = createExifOutputBlob(await blob.arrayBuffer(), {
          originalExif: exif,
          patchOrientationToOne: true,
          type,
        });
      }
      const base = (filename ?? "edited-image").replace(/\.[^/.]+$/, "");
      const result: ImageEditorExportResult = {
        blob,
        type,
        width,
        height,
        filename: `${base}.${info.extension}`,
      };
      onExport?.(result);
      return result;
    } finally {
      engine.renderPipeline.render();
    }
  };

  const download = async (exportOptions?: ImageEditorExportOptions) => {
    const result = await exportImage(exportOptions);
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return result;
  };

  // ── Keyboard ───────────────────────────────────────────────────────────
  useImageEditorKeybindings({
    enabled: keyboardShortcuts && !disabled,
    rootRef,
    undo,
    redo,
    onEscape: isComposeTool && isCropDrawn ? clearCrop : undefined,
  });

  const status: ImageEditorStatus =
    imageInput.status === "error" || engine.miniGl.status === "error"
      ? "error"
      : imageInput.isLoading ||
          (imageInput.image && engine.miniGl.status !== "ready")
        ? "loading"
        : imageInput.image
          ? "ready"
          : "idle";

  const blurValue: BlurValue = {
    bokehStrength: params.blur.bokehstrength ?? 0,
    bokehLensOut: params.blur.bokehlensout ?? 0.5,
    gaussianStrength: params.blur.gaussianstrength ?? 0,
    gaussianLensOut: params.blur.gaussianlensout ?? 0.5,
    centerX: params.blur.centerX ?? 0.5,
    centerY: params.blur.centerY ?? 0.5,
  };

  return {
    params,
    renderParams,
    setParams,
    patch: (section, patch, patchOptions) =>
      patchOptions?.transient
        ? patchTransient(section, patch)
        : patchNow(section, patch),
    commit: flushCommit,
    resetAll,

    status,
    error: imageInput.error ?? engine.miniGl.error ?? null,
    disabled,
    isLoading: status === "loading",
    isReady: status === "ready",
    hasImage: Boolean(imageSrc),
    imageSrc,
    imageSize: previewSize,
    filename,
    openFile,
    load,

    tool,
    setTool,

    history: {
      canUndo,
      canRedo,
      undo: () => {
        flushCommit();
        undo();
      },
      redo,
    },

    compare: { active: isComparing, setActive: setIsComparing },

    adjust: {
      value: {
        lights: params.lights,
        colors: params.colors,
        effects: params.effects,
      },
      setLights: (lights) => patchTransient("lights", { ...lights }),
      setColors: (colors) => patchTransient("colors", { ...colors }),
      setEffects: (effects) => patchTransient("effects", { ...effects }),
      resetSection: (section) =>
        patchNow(section, { ...adjustDefaultValue[section] }),
      reset: () =>
        replaceAll([
          { section: "lights", patch: { ...adjustDefaultValue.lights } },
          { section: "colors", patch: { ...adjustDefaultValue.colors } },
          { section: "effects", patch: { ...adjustDefaultValue.effects } },
        ]),
    },

    filters: {
      value: {
        label: params.filters.opt ? params.filters.opt.label : null,
        mix: params.filters.mix ?? 0,
      },
      presets: filterPresets,
      loading: loadingFilter,
      select: selectFilter,
      setMix: (mix) => patchTransient("filters", { mix }),
      reset: () => patchNow("filters", { opt: 0, mix: 0 }),
    },

    blend: {
      value: { blendMix: params.blender.blendmix ?? 0.5 },
      hasImage: Boolean(params.blender.blendmap),
      setImage: (image) => patchNow("blender", { blendmap: image ?? 0 }),
      setMix: (mix) => patchTransient("blender", { blendmix: mix }),
      reset: () => patchNow("blender", { blendmap: 0, blendmix: 0.5 }),
    },

    blur: {
      value: blurValue,
      set: (next) =>
        patchTransient("blur", {
          bokehstrength: next.bokehStrength,
          bokehlensout: next.bokehLensOut,
          gaussianstrength: next.gaussianStrength,
          gaussianlensout: next.gaussianLensOut,
          centerX: next.centerX,
          centerY: next.centerY,
        }),
      setCenter: (center) => patchTransient("blur", { ...center }),
      commitCenter: (center) => patchNow("blur", { ...center }),
      reset: () =>
        patchNow("blur", {
          bokehstrength: blurDefaultValue.bokehStrength,
          bokehlensout: blurDefaultValue.bokehLensOut,
          gaussianstrength: blurDefaultValue.gaussianStrength,
          gaussianlensout: blurDefaultValue.gaussianLensOut,
          centerX: blurDefaultValue.centerX,
          centerY: blurDefaultValue.centerY,
        }),
    },

    curves: {
      value: params.curve.curvepoints || null,
      histogram: workerHistogram ?? (useWorker ? null : engine.histogram.histogram),
      set: (value) => patchTransient("curve", { curvepoints: value }),
      commit: flushCommit,
      reset: () => patchNow("curve", { curvepoints: 0 }),
    },

    crop: {
      rect: crop,
      isDrawn: isCropDrawn,
      aspectRatio,
      aspectRatioValue,
      aspectRatioOptions,
      setAspectRatio,
      update: updateCrop,
      commitDrag: commitCropFromDrag,
      apply: () => patchNow("crop", { currentcrop: 0 }),
      clear: clearCrop,
      transform: {
        rotation: params.trs.angle ?? 0,
        scale: Math.round(cropZoom * 100),
        flipHorizontal: Boolean(params.trs.fliph),
        flipVertical: Boolean(params.trs.flipv),
      },
      setTransform,
      canvasAngle: params.crop.canvas_angle ?? 0,
      rotate: (delta) =>
        patchNow("crop", {
          canvas_angle: rotateCanvasAngle(params.crop.canvas_angle ?? 0, delta),
        }),
      resize: {
        width: params.resizer.width ?? 0,
        height: params.resizer.height ?? 0,
        originalWidth: previewSize?.width ?? 0,
        originalHeight: previewSize?.height ?? 0,
      },
      setResize,
      resetResize: () => patchNow("resizer", { width: 0, height: 0 }),
      reset: resetComposition,
    },

    perspective: {
      isEditing: isEditingPerspective,
      hasCommitted:
        params.perspective2.before !== 0 && params.perspective2.after !== 0,
      quad: perspectiveDraft,
      toggle: togglePerspective,
      change: (quad) => {
        setPerspectiveDraft(quad);
        setIsDraggingPerspective(true);
      },
      commit: commitPerspective,
      reset: resetPerspective,
    },

    recipes: {
      current: buildRecipe(params),
      apply: applyRecipeAsync,
    },

    histogram: {
      data:
        workerHistogram ??
        (engine.histogram.histogram.pixels ? engine.histogram.histogram : null),
      canvasRef: engine.histogram.canvasRef,
    },

    exportImage,
    download,

    view,
    stageRef,
    rootRef,
    canvasRef: engine.miniGl.canvasRef,

    engine,
    worker,
  };
}
