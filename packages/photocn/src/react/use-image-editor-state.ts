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
  createGeometry,
  cropForAspectRatio,
  effectiveCrop,
  flipGeometry,
  imagePolygon,
  isGeometryDefault,
  moveCropWithin,
  orientedSize,
  outputPixelSize,
  polygonBounds,
  rotateGeometry,
  setCornerTarget,
  STRAIGHTEN_LIMIT,
  type GeometryParams,
  type NormalizedRect,
  type Quad,
  type Size,
  type Vec2,
} from "../compose";
import {
  createExifOutputBlob,
  loadImage,
  toPersistentImage,
  type BrowserExifHandle,
  type BrowserImageInput,
  type BrowserImageInputResult,
  type DecodeImageInputOptions,
  type RgbHistogram,
  type SelectImageFileOptions,
} from "../dom";
import { applyRecipe, buildRecipe, type RecipeV1 } from "../recipes";
import { normalizeEditorParams } from "../legacy";
import {
  exportFilename,
  exportFormatInfo,
  resolveOutputSize,
  type ImageExportFormat,
} from "../output";
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
  matchAspectRatio,
  parseAspectRatio,
  patchEditorParams,
  type ParamPatch,
} from "./helpers";
import {
  adjustDefaultValue,
  aspectRatioOptions as defaultAspectRatioOptions,
  blurDefaultValue,
  filterMixToStrength,
  filterStrengthToMix,
  type AdjustColorValue,
  type AdjustEffectValue,
  type AdjustLightValue,
  type AdjustSection,
  type AdjustValue,
  type AspectRatioOption,
  type BlendValue,
  type BlurValue,
  type CurveChannels,
  type FiltersValue,
  type ImageEditorToolId,
} from "./types";
import { useImageEditorKeybindings } from "./use-image-editor-keybindings";

export type ImageEditorSource = BrowserImageInput;

export type ImageEditorExportFormat = ImageExportFormat;

export interface ImageEditorExportOptions {
  /** Default `"png"`. */
  format?: ImageEditorExportFormat;
  /** 0..1, for lossy formats. Defaults: jpeg 0.92, webp 0.9. */
  quality?: number;
  /** Copy the source EXIF block into the output (JPEG only). Default `true`. */
  preserveExif?: boolean;
  /**
   * Output size in px (resize). Give one side to keep the crop's ratio, or
   * both to set it exactly. Default: the crop at full resolution.
   */
  width?: number;
  height?: number;
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
  /**
   * Params to start from (e.g. a saved edit). Uncontrolled. Params saved by
   * older versions (separate `trs`/`crop`/`perspective2` sections) are
   * migrated automatically.
   */
  defaultParams?: EditorParams | Record<string, unknown>;
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
  /** Crop ratio presets offered by `geometry.aspectRatioOptions`. */
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
  /** Global keyboard shortcuts (undo/redo). Default `true`. */
  keyboardShortcuts?: boolean;
  /** Undo stack depth. Default 100. */
  historyLimit?: number;
  /** Debounce (ms) that folds slider drags into one undo step. Default 400. */
  commitDelay?: number;
  /** Tool id that shows the crop view (whole image + frame). Default `"compose"`. */
  cropTool?: ImageEditorToolId;
}

export type ImageEditorStatus = "idle" | "loading" | "ready" | "error";

type TransientOption = { transient?: boolean };

export interface ImageEditorGeometryApi {
  /** The stored geometry (the user's intent). See docs/compose.md. */
  value: GeometryParams;
  isDefault: boolean;
  /** Full-resolution source size, once loaded. */
  sourceSize: Size | null;
  /** Source size after flip/quarter turns. */
  orientedSize: Size | null;
  /** The crop that is rendered (limited to the image), normalized oriented. */
  crop: NormalizedRect;
  /** Where the image's corners land (normalized oriented, TL TR BR BL). */
  polygon: Quad | null;
  /** Bounds of `polygon`: what the crop view renders. */
  bounds: NormalizedRect;
  /** Output size of the crop at full resolution. */
  outputSize: Size | null;
  /** Preset value matching the locked ratio ("free" when unlocked). */
  aspectRatio: string;
  /** Whether the crop is portrait. */
  portrait: boolean;
  aspectRatioOptions: readonly AspectRatioOption[];
  /** Lock the crop to a preset ("free" unlocks), keeping the crop's orientation. */
  setAspectRatio: (value: string) => void;
  /** Swap between portrait and landscape. */
  toggleOrientation: () => void;
  /** Set the user's crop (normalized oriented); `null` = whole image. */
  setCrop: (crop: NormalizedRect | null, options?: TransientOption) => void;
  /** Quarter turn of the whole picture (the crop turns with it). */
  rotate: (direction: 1 | -1) => void;
  /** Mirror what you see. */
  flip: (axis: "horizontal" | "vertical") => void;
  /** Degrees, ±45. The frame stays put; the crop auto-fits. */
  setStraighten: (degrees: number, options?: TransientOption) => void;
  /** Keystone sliders, -1..1. */
  setPerspective: (value: { x?: number; y?: number }, options?: TransientOption) => void;
  /** Advanced: move one warped image corner to `target` (normalized oriented). */
  setCorner: (index: 0 | 1 | 2 | 3, target: Vec2, options?: TransientOption) => void;
  resetCorners: () => void;
  /** Whether the corner handles are shown (advanced perspective). */
  editingCorners: boolean;
  setEditingCorners: (editing: boolean) => void;
  /** Flush pending transient edits (e.g. on pointer up). */
  commit: () => void;
  /** Throw away an in-progress drag (Esc). */
  cancel: () => void;
  /** Move the crop by (dx, dy) normalized, as far as the image allows. */
  moveCrop: (dx: number, dy: number, options?: TransientOption) => void;
  /** Leave the crop tool (back to the previous tool). */
  done: () => void;
  /** Reset geometry only. */
  reset: () => void;
  /**
   * The rect the canvas is currently showing (normalized oriented). Lags
   * the requested view by a frame while the renderer catches up, so overlays
   * stay aligned with the pixels.
   */
  displayRect: NormalizedRect;
  /** Whether the canvas shows the whole image (crop view) or the result. */
  view: "crop" | "full";
}

export interface ImageEditorApi {
  /** Current committed + transient params (what the user sees). */
  params: EditorParams;
  /** Params actually sent to the renderer (compare / crop view aware). */
  renderParams: EditorParams;
  /** Replace all params (one undo step). Legacy params are migrated. */
  setParams: (params: EditorParams | Record<string, unknown>) => void;
  /**
   * Patch one params section. `transient: true` coalesces rapid updates
   * (slider drags) into a single undo step.
   */
  patch: (
    section: EditorParamSection,
    patch: Record<string, unknown>,
    options?: TransientOption,
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
  /** Full-resolution source size. */
  imageSize: Size | null;
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
    /** Apply a preset at full strength (null removes the filter). */
    select: (preset: FilterPreset | string | null) => Promise<void>;
    /** 0 = original photo, 1 = full filter. */
    setStrength: (strength: number) => void;
    reset: () => void;
  };

  blend: {
    value: BlendValue;
    hasImage: boolean;
    /**
     * Blend a second image in. A picked file is re-encoded as a data: URL
     * (≤2048px) so the edit, and its recipe, can be saved and reloaded.
     */
    setImage: (image: HTMLImageElement | null) => Promise<void>;
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

  /** Crop, straighten, perspective, turns and flips (non-destructive). */
  geometry: ImageEditorGeometryApi;

  recipes: {
    /** Serializable diff of the current edit, or null when unedited. */
    current: RecipeV1 | null;
    apply: (recipe: RecipeV1) => Promise<void>;
  };

  histogram: {
    data: RgbHistogram | null;
    /** Attach to a `<canvas>` to have the histogram drawn for you. */
    canvasRef: RefObject<HTMLCanvasElement | null>;
  };

  /** Encode the edited image at full resolution (or `width`/`height`). */
  exportImage: (options?: ImageEditorExportOptions) => Promise<ImageEditorExportResult>;
  /** Export and trigger a browser download. */
  download: (options?: ImageEditorExportOptions) => Promise<ImageEditorExportResult>;

  /** Attach to the element the canvas is laid out in. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Attach to the editor's outer element (scopes keyboard shortcuts). */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Attach to the preview `<canvas>`. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * Use as that `<canvas>`'s `key`. A canvas handed to the render worker
   * can't be reused, so the editor asks for a fresh one when it needs it.
   */
  canvasKey: number;

  /** Low-level engine (renderer, EXIF, raw hooks) — escape hatch. */
  engine: UseMiniPhotoEditorResult;
  /** Worker bridge when rendering off-thread. */
  worker: WorkerEditor | undefined;
}

const FULL_RECT: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };
const rectsEqual = (a: NormalizedRect, b: NormalizedRect) =>
  Math.abs(a.x - b.x) < 1e-9 &&
  Math.abs(a.y - b.y) < 1e-9 &&
  Math.abs(a.width - b.width) < 1e-9 &&
  Math.abs(a.height - b.height) < 1e-9;

export { resolveOutputSize };

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
    cropTool = "compose",
  } = options;

  const [initial] = useState(() => normalizeEditorParams(defaultParams));
  const {
    params,
    patchSection,
    setParams: setHistoryParams,
    commit,
    revert,
    load: loadParams,
    reset,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditorHistory({ initialParams: initial.params, limit: historyLimit });
  // A legacy pixel crop can only be converted once the image size is known.
  const pendingLegacyRef = useRef(initial.needsSourceSize ? defaultParams : null);

  const [tool, setTool] = useControllableState<ImageEditorToolId>({
    value: toolProp,
    defaultValue: defaultTool,
    onChange: onToolChange,
  });
  const isCropTool = tool === cropTool;
  const [editingCorners, setEditingCorners] = useState(false);
  const previousToolRef = useRef<ImageEditorToolId>(
    defaultTool === cropTool ? "adjust" : defaultTool,
  );
  if (!isCropTool) previousToolRef.current = tool;

  // ── Hold-to-compare: original colors, same geometry ─────────────────
  const [isComparing, setIsComparing] = useState(false);
  const compareBaseline = useMemo(() => {
    const base = createEditorParams();
    base.geometry = params.geometry;
    return base;
  }, [params.geometry]);

  const renderParams = useMemo<EditorParams>(() => {
    const base = isComparing && !isCropTool ? compareBaseline : params;
    return isCropTool ? patchEditorParams(base, "geometry", { $view: "full" }) : base;
  }, [isComparing, isCropTool, compareBaseline, params]);

  // ── Engine ─────────────────────────────────────────────────────────────
  const [useWorker] = useState(() =>
    renderMode ? renderMode === "worker" : supportsWorkerRendering(),
  );
  const [workerHistogram, setWorkerHistogram] = useState<RgbHistogram | null>(
    null,
  );

  // Track which view rect the canvas actually shows so overlays line up
  // with painted pixels, not with a frame that hasn't rendered yet.
  const requestedRectRef = useRef<NormalizedRect>(FULL_RECT);
  const [displayRect, setDisplayRect] = useState<NormalizedRect>(FULL_RECT);
  const onPaintRef = useRef(() => {});
  onPaintRef.current = () => {
    const next = requestedRectRef.current;
    setDisplayRect((prev) => (rectsEqual(prev, next) ? prev : next));
  };

  const spawnRef = useRef(spawnWorker);
  spawnRef.current = spawnWorker;
  const workerFactory = useMemo(
    () =>
      useWorker
        ? createWorkerMiniGlEditorFactory({
            spawn: () => (spawnRef.current ?? spawnInlineWorker)(),
            proxyMaxDim,
            onHistogram: setWorkerHistogram,
            onPaint: () => onPaintRef.current(),
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
    onHistogramUpdate: useWorker ? undefined : () => onPaintRef.current(),
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

  const image = imageInput.image;
  const sourceSize = useMemo<Size | null>(() => {
    const width = image?.naturalWidth || image?.width || 0;
    const height = image?.naturalHeight || image?.height || 0;
    return width > 0 && height > 0 ? { width, height } : null;
  }, [image]);
  const sourceRef = useRef(sourceSize);
  sourceRef.current = sourceSize;

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

  const patchWith = (
    section: EditorParamSection,
    patch: Record<string, unknown>,
    options?: TransientOption,
  ) => (options?.transient ? patchTransient(section, patch) : patchNow(section, patch));

  const replaceAll = (patches: readonly ParamPatch[]) => {
    flushCommit();
    const next = patchEditorParams(paramsRef.current, patches);
    setHistoryParams(next);
    emit(next);
  };

  const setParams = (input: EditorParams | Record<string, unknown>) => {
    flushCommit();
    const next = normalizeEditorParams(input, { sourceSize: sourceRef.current }).params;
    setHistoryParams(next);
    emit(next);
  };

  const resetAll = () => {
    flushCommit();
    setEditingCorners(false);
    reset();
    emit(createEditorParams());
  };

  // ── Image IO ───────────────────────────────────────────────────────────
  const imageSrc =
    image?.currentSrc || image?.src || (typeof src === "string" ? src : null);
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

  // ── Geometry ───────────────────────────────────────────────────────────
  const geometry = params.geometry;
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  useEffect(() => {
    const pending = pendingLegacyRef.current;
    if (!pending || !sourceSize) return;
    pendingLegacyRef.current = null;
    loadParams(normalizeEditorParams(pending, { sourceSize }).params);
  }, [sourceSize, loadParams]);

  const derived = useMemo(() => {
    if (!sourceSize) {
      return {
        oriented: null,
        polygon: null,
        crop: geometry.crop ?? FULL_RECT,
        bounds: FULL_RECT,
        outputSize: null,
      };
    }
    const oriented = orientedSize(sourceSize, geometry);
    const polygon = imagePolygon(geometry, sourceSize);
    const crop = effectiveCrop(geometry, sourceSize);
    return {
      oriented,
      polygon,
      crop,
      bounds: polygonBounds(polygon),
      outputSize: outputPixelSize(geometry, sourceSize, crop),
    };
  }, [geometry, sourceSize]);

  requestedRectRef.current = isCropTool ? derived.bounds : derived.crop;

  const orientedRatio = derived.oriented
    ? derived.oriented.width / derived.oriented.height
    : 0;
  const cropPortrait = derived.outputSize
    ? derived.outputSize.height > derived.outputSize.width
    : false;
  const aspect = matchAspectRatio(geometry.aspectRatio, orientedRatio, aspectRatioOptions);

  const setGeometry = (next: GeometryParams, options?: TransientOption) =>
    patchWith("geometry", { ...next }, options);

  const withSource = (fn: (source: Size) => void) => {
    const source = sourceRef.current;
    if (source) fn(source);
  };

  const applyRatio = (ratio: number | null) =>
    withSource((source) => setGeometry(cropForAspectRatio(geometryRef.current, source, ratio)));

  const setAspectRatio = (value: string) => {
    let ratio = parseAspectRatio(value, orientedRatio);
    // Presets follow the crop's current orientation.
    if (ratio && value !== "original" && ratio !== 1 && cropPortrait === ratio > 1) {
      ratio = 1 / ratio;
    }
    applyRatio(ratio);
  };

  const toggleOrientation = () => {
    const current = geometryRef.current.aspectRatio;
    if (current) {
      applyRatio(1 / current);
      return;
    }
    // Free crop: swap the crop's own ratio.
    const size = derived.outputSize;
    if (size) applyRatio(size.height / size.width);
  };

  const geometryApi: ImageEditorGeometryApi = {
    value: geometry,
    isDefault: isGeometryDefault(geometry),
    sourceSize,
    orientedSize: derived.oriented,
    crop: derived.crop,
    polygon: derived.polygon,
    bounds: derived.bounds,
    outputSize: derived.outputSize,
    aspectRatio: aspect.value,
    portrait: cropPortrait,
    aspectRatioOptions,
    setAspectRatio,
    toggleOrientation,
    setCrop: (crop, opts) => setGeometry({ ...geometryRef.current, crop }, opts),
    rotate: (direction) => setGeometry(rotateGeometry(geometryRef.current, direction)),
    flip: (axis) => setGeometry(flipGeometry(geometryRef.current, axis)),
    setStraighten: (degrees, opts) =>
      setGeometry(
        {
          ...geometryRef.current,
          straighten: Math.max(-STRAIGHTEN_LIMIT, Math.min(STRAIGHTEN_LIMIT, degrees)),
        },
        opts,
      ),
    setPerspective: ({ x, y }, opts) =>
      setGeometry(
        {
          ...geometryRef.current,
          perspectiveX: clamp1(x ?? geometryRef.current.perspectiveX),
          perspectiveY: clamp1(y ?? geometryRef.current.perspectiveY),
        },
        opts,
      ),
    setCorner: (index, target, opts) =>
      withSource((source) =>
        setGeometry(setCornerTarget(geometryRef.current, source, index, target), opts),
      ),
    resetCorners: () => setGeometry({ ...geometryRef.current, corners: null }),
    editingCorners: isCropTool && editingCorners,
    setEditingCorners,
    commit: flushCommit,
    cancel: () => {
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      revert();
    },
    moveCrop: (dx, dy, opts) =>
      withSource((source) => {
        const g = geometryRef.current;
        const oriented = orientedSize(source, g);
        const crop = moveCropWithin(
          effectiveCrop(g, source),
          dx,
          dy,
          imagePolygon(g, source),
          oriented,
        );
        setGeometry({ ...g, crop }, opts);
      }),
    done: () => {
      setEditingCorners(false);
      setTool(previousToolRef.current);
    },
    reset: () => {
      setEditingCorners(false);
      setGeometry(createGeometry());
    },
    displayRect,
    view: isCropTool ? "full" : "crop",
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
      // A new look starts at full strength, like every phone editor.
      patchNow("filters", { opt, mix: 0 });
    } finally {
      setLoadingFilter(null);
    }
  };

  // ── Blend ──────────────────────────────────────────────────────────────
  const blendTokenRef = useRef(0);
  const setBlendImage = async (blendImage: HTMLImageElement | null) => {
    const token = ++blendTokenRef.current;
    const persistent = blendImage ? await toPersistentImage(blendImage) : null;
    if (token !== blendTokenRef.current) return;
    patchNow("blender", { blendmap: persistent ?? 0 });
  };

  // ── Recipes ────────────────────────────────────────────────────────────
  const applyRecipeAsync = async (recipe: RecipeV1) => {
    const next = applyRecipe(paramsRef.current, recipe);
    if (recipe.blend?.src) {
      try {
        next.blender.blendmap = await loadImage(recipe.blend.src);
      } catch {
        next.blender.blendmap = 0;
      }
    }
    if (recipe.filters?.label) {
      const preset = findFilterPreset(recipe.filters.label, filterPresets);
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
    const source = sourceRef.current;
    if (!renderer || !source) throw new Error("The image is not ready to export yet.");
    const current = paramsRef.current;
    const crop = effectiveCrop(current.geometry, source);
    const outputSize = resolveOutputSize(
      outputPixelSize(current.geometry, source, crop),
      exportOptions,
    );
    // Render the real result (not the crop view or a compare hold) at the
    // requested size, capture, then restore the preview.
    engine.renderPipeline.render({
      params: patchEditorParams(current, "geometry", {
        $view: "crop",
        $outputSize: outputSize,
      }),
    });
    try {
      let blob: Blob;
      let type: string;
      let width: number;
      let height: number;
      if (worker) {
        ({ blob, type, width, height } = await worker.exportBlob({
          format: info.mime,
          quality,
        }));
      } else {
        ({ blob, width, height } = await engine.exportImage.exportBlob(renderer, {
          format,
          quality,
          originalExif: null,
        }));
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
      const result: ImageEditorExportResult = {
        blob,
        type,
        width,
        height,
        filename: exportFilename(filename, format),
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
    undo: () => {
      flushCommit();
      undo();
    },
    redo,
    onKey: (event) =>
      isCropTool && sourceRef.current ? handleCropKey(event, geometryApi) : false,
  });

  const status: ImageEditorStatus =
    imageInput.status === "error" || engine.miniGl.status === "error"
      ? "error"
      : imageInput.isLoading || (image && engine.miniGl.status !== "ready")
        ? "loading"
        : image
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
    patch: patchWith,
    commit: flushCommit,
    resetAll,

    status,
    error: imageInput.error ?? engine.miniGl.error ?? null,
    disabled,
    isLoading: status === "loading",
    isReady: status === "ready",
    hasImage: Boolean(imageSrc),
    imageSrc,
    imageSize: sourceSize,
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
        strength: filterMixToStrength(params.filters.mix ?? 0),
      },
      presets: filterPresets,
      loading: loadingFilter,
      select: selectFilter,
      setStrength: (strength) =>
        patchTransient("filters", { mix: filterStrengthToMix(strength) }),
      reset: () => patchNow("filters", { opt: 0, mix: 0 }),
    },

    blend: {
      value: { blendMix: params.blender.blendmix ?? 0.5 },
      hasImage: Boolean(params.blender.blendmap),
      setImage: setBlendImage,
      setMix: (mix) => patchTransient("blender", { blendmix: mix }),
      reset: () => {
        blendTokenRef.current++;
        patchNow("blender", { blendmap: 0, blendmix: 0.5 });
      },
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

    geometry: geometryApi,

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

    stageRef,
    rootRef,
    canvasRef: engine.miniGl.canvasRef,
    canvasKey: engine.miniGl.canvasKey,

    engine,
    worker,
  };
}

const INTERACTIVE =
  'button,a,input,select,textarea,[role="slider"],[role="combobox"],[role="option"],[role="radio"],[role="tab"],[role="menuitem"],[role="switch"]';

/**
 * Crop tool shortcuts (docs/compose.md):
 * R / ⇧R rotate · H / V flip · X portrait⇄landscape · [ ] straighten (⇧ ×10)
 * arrows move the image under the frame (⇧ ×10) · ⌫ reset · Enter done ·
 * Esc leaves corner mode.
 */
export function handleCropKey(event: KeyboardEvent, g: ImageEditorGeometryApi): boolean {
  const target = event.target instanceof Element ? event.target : null;
  const onControl = Boolean(target?.closest(INTERACTIVE));
  const big = event.shiftKey;
  switch (event.key.toLowerCase()) {
    case "r":
      g.rotate(big ? -1 : 1);
      return true;
    case "h":
      g.flip("horizontal");
      return true;
    case "v":
      g.flip("vertical");
      return true;
    case "x":
      g.toggleOrientation();
      return true;
    case "[":
    case "{":
      g.setStraighten(g.value.straighten - (big ? 5 : 0.5), { transient: true });
      return true;
    case "]":
    case "}":
      g.setStraighten(g.value.straighten + (big ? 5 : 0.5), { transient: true });
      return true;
    case "escape":
      if (!g.editingCorners) return false;
      g.setEditingCorners(false);
      return true;
  }
  if (onControl) return false;
  const step = big ? 0.1 : 0.01;
  // Arrows move the image, so the crop moves the other way.
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [step, 0],
    ArrowRight: [-step, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step],
  };
  const arrow = arrows[event.key];
  if (arrow) {
    g.moveCrop(arrow[0] * g.crop.width, arrow[1] * g.crop.height, { transient: true });
    return true;
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    g.reset();
    return true;
  }
  if (event.key === "Enter") {
    g.commit();
    g.done();
    return true;
  }
  return false;
}

function clamp1(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
