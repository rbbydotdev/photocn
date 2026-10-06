import {
  createGeometry,
  cropForAspectRatio,
  effectiveCrop,
  flipGeometry,
  orientedSize,
  outputPixelSize,
  rotateGeometry,
  STRAIGHTEN_LIMIT,
  type GeometryParams,
  type NormalizedRect,
  type Size,
} from "../compose";
import {
  calculateRgbHistogram,
  captureRendererBlob,
  createExifHandle,
  createExifOutputBlob,
  createMiniGlEditor,
  decodeImageInput,
  readExifMetadata,
  type BrowserExifHandle,
  type BrowserImageInput,
  type DecodeImageInputOptions,
  type ExifMetadata,
  type MiniGlEditor,
  type MiniGlRenderer,
  type RgbHistogram,
} from "../dom";
import {
  cloneEditorParams,
  createEditorParams,
  type BlurParams,
  type ColorParams,
  type CurveChannels,
  type EditorParamSection,
  type EditorParams,
  type EffectParams,
  type LightParams,
} from "../editor-params";
import {
  filterPresets as defaultFilterPresets,
  findFilterPreset,
  type FilterPreset,
} from "../filters";
import { normalizeEditorParams } from "../legacy";
import { detectColorSpace, type EditorColorSpace } from "../metadata";
import {
  exportFilename,
  exportFormatInfo,
  resolveOutputSize,
  type ImageExportFormat,
} from "../output";
import { applyRecipe, buildRecipe, type RecipeV1 } from "../recipes";
import { renderEditorPipeline, type EditorRenderer } from "../render-pipeline";
import { parseAspectRatio } from "../react/helpers";
import { filterMixToStrength, filterStrengthToMix } from "../react/types";
import {
  createWorkerMiniGlEditorFactory,
  type ProxyMaxDimResolver,
  type WorkerEditor,
} from "../worker";
import { spawnInlineWorker, supportsWorkerRendering } from "../worker/inline";

/** Light, color and effect sliders, each -1..1 (0 = unchanged). */
export type PhotoAdjustments = Partial<
  Omit<LightParams, "$skip"> & Omit<ColorParams, "$skip"> & Omit<EffectParams, "$skip">
>;

export interface PhotoBlur {
  /** Lens (bokeh) blur strength, 0..1. */
  bokeh?: number;
  /** Gaussian blur strength, 0..1. */
  gaussian?: number;
  /** Size of the sharp area, 0..1. */
  focus?: number;
  /** Focus center, normalized 0..1. */
  centerX?: number;
  centerY?: number;
}

export interface PhotoExportOptions {
  /** Default `"png"`. */
  format?: ImageExportFormat;
  /** 0..1, for lossy formats. Defaults: jpeg 0.92, webp 0.9. */
  quality?: number;
  /** Copy the source EXIF block into the output (JPEG only). Default `true`. */
  preserveExif?: boolean;
  /** Resize: give one side to keep the crop's ratio, or both. */
  width?: number;
  height?: number;
}

export interface PhotoExportResult {
  blob: Blob;
  type: string;
  width: number;
  height: number;
  /** Suggested filename including the extension. */
  filename: string;
}

export interface CreatePhotoOptions {
  /** Start from saved params (e.g. `photo.params` from an earlier session). */
  params?: EditorParams | Record<string, unknown>;
  /** Decode hints (name/type) when `src` is a Blob or ArrayBuffer. */
  decodeOptions?: DecodeImageInputOptions;
  /** Filter presets `filter()` looks names up in. */
  filterPresets?: readonly FilterPreset[];
  /**
   * Where an attached canvas renders. `"worker"` (default when supported)
   * renders off the main thread; `"main"` renders on it. Headless exports
   * (no canvas attached) always render on the main thread.
   */
  renderMode?: "worker" | "main";
  /** Custom worker spawner, for strict CSPs. See `photocn/worker/entry`. */
  spawnWorker?: () => Worker;
  /** Preview proxy long-edge cap for attached canvases. `0` disables. */
  proxyMaxDim?: number | ProxyMaxDimResolver;
  /** Undo stack depth. Default 100. */
  historyLimit?: number;
}

export type PhotoListener = (photo: Photo) => void;

type Engine = {
  renderer: EditorRenderer;
  canvas: HTMLCanvasElement;
  attached: boolean;
  worker?: WorkerEditor;
  dispose: () => void;
};

/** Load an image and get a stateful, chainable photo to edit and export. */
export async function createPhoto(
  src: BrowserImageInput,
  options: CreatePhotoOptions = {},
): Promise<Photo> {
  const decoded = await decodeImageInput(src, options.decodeOptions);
  const exif = createExifHandle(decoded.arrayBuffer);
  return new Photo(decoded.image, decoded.fileInfo.name, exif, options);
}

/**
 * A photo plus its edits. Every edit is non-destructive and returns the
 * photo, so calls chain:
 *
 * ```ts
 * const photo = await createPhoto(file);
 * photo.adjust({ exposure: 0.3, saturation: -1 }).rotate(1).aspectRatio("1:1");
 * const { blob } = await photo.export({ format: "jpeg", width: 1080 });
 * ```
 *
 * Attach a `<canvas>` to see a live preview, and `subscribe` to update your
 * own UI. Call `dispose()` when done.
 */
export class Photo {
  /** The decoded source image. */
  readonly image: HTMLImageElement;
  /** Full-resolution source size. */
  readonly size: Size;
  /** Source filename (or `"image"`). */
  readonly name: string;
  /** EXIF / ICC metadata of the source, when present. */
  readonly metadata: ExifMetadata | undefined;
  readonly colorspace: EditorColorSpace;

  #exif: BrowserExifHandle | undefined;
  #options: CreatePhotoOptions;
  #params: EditorParams;
  #past: EditorParams[] = [];
  #future: EditorParams[] = [];
  #listeners = new Set<PhotoListener>();
  #engine: Engine | null = null;
  #attaching: Promise<void> | null = null;
  #frame: number | null = null;
  #filterToken = 0;
  #pending = new Set<Promise<unknown>>();
  #histogram: RgbHistogram | null = null;
  #disposed = false;

  constructor(
    image: HTMLImageElement,
    name: string,
    exif: BrowserExifHandle | undefined,
    options: CreatePhotoOptions = {},
  ) {
    this.image = image;
    this.size = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
    this.name = name;
    this.#exif = exif;
    this.metadata = readExifMetadata(exif);
    this.colorspace = detectColorSpace(this.metadata);
    this.#options = options;
    this.#params = options.params
      ? normalizeEditorParams(options.params, { sourceSize: this.size }).params
      : createEditorParams();
  }

  // ── State ──────────────────────────────────────────────────────────────

  /** A copy of the current params (serializable except filter textures). */
  get params(): EditorParams {
    return cloneEditorParams(this.#params);
  }

  /** Replace every edit (one undo step). Legacy params are migrated. */
  setParams(params: EditorParams | Record<string, unknown>): this {
    return this.#commit(normalizeEditorParams(params, { sourceSize: this.size }).params);
  }

  /** The current edit as a portable recipe, or `null` when unedited. */
  get recipe(): RecipeV1 | null {
    return buildRecipe(this.#params);
  }

  /** Apply a recipe (from `photo.recipe` or the editor's recipes panel). */
  async applyRecipe(recipe: RecipeV1): Promise<this> {
    const next = applyRecipe(this.#params, recipe);
    if (recipe.filters?.label) {
      const preset = this.#findPreset(recipe.filters.label);
      next.filters.opt = preset ? await preset.load().catch(() => 0 as const) : 0;
    }
    return this.#commit(next);
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  undo(): this {
    const previous = this.#past.pop();
    if (!previous) return this;
    this.#future.push(this.#params);
    return this.#set(previous);
  }

  redo(): this {
    const next = this.#future.pop();
    if (!next) return this;
    this.#past.push(this.#params);
    return this.#set(next);
  }

  /** Remove every edit (one undo step). */
  reset(): this {
    this.#filterToken++;
    return this.#commit(createEditorParams());
  }

  /** Called after every change (edit, undo, filter loaded). Returns unsubscribe. */
  subscribe(listener: PhotoListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  // ── Edits ──────────────────────────────────────────────────────────────

  /** Light, color and effect sliders, -1..1. Unlisted sliders keep their value. */
  adjust(values: PhotoAdjustments): this {
    const next = cloneEditorParams(this.#params);
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== "number") continue;
      const section = (["lights", "colors", "effects"] as const).find((name) => key in next[name]);
      if (!section) throw new Error(`Unknown adjustment "${key}"`);
      (next[section] as unknown as Record<string, number>)[key] = clampUnit(value);
    }
    return this.#commit(next);
  }

  /**
   * Apply a filter by name (`"juno"`) or preset, at `strength` 0..1 (default
   * full). `null` removes it. LUTs load in the background; `export()` and
   * `ready()` wait for them.
   */
  filter(preset: FilterPreset | string | null, strength = 1): this {
    const token = ++this.#filterToken;
    if (preset === null) {
      return this.#commit(patch(this.#params, "filters", { opt: 0, mix: 0 }));
    }
    const resolved = typeof preset === "string" ? this.#findPreset(preset) : preset;
    if (!resolved) throw new Error(`Unknown filter "${String(preset)}"`);
    this.#track(
      resolved.load().then((opt) => {
        if (token !== this.#filterToken || this.#disposed) return;
        this.#commit(patch(this.#params, "filters", { opt, mix: filterStrengthToMix(strength) }));
      }),
    );
    return this;
  }

  /** Filter strength 0..1 (0 = the original photo). */
  filterStrength(strength: number): this {
    return this.#commit(patch(this.#params, "filters", { mix: filterStrengthToMix(strength) }));
  }

  /** The applied filter's name and strength. */
  get filterValue(): { label: string | null; strength: number } {
    const { opt, mix } = this.#params.filters;
    return { label: opt ? opt.label : null, strength: filterMixToStrength(mix ?? 0) };
  }

  /** Tone curves `[rgb, r, g, b]`, each a list of `[input, output]` points (0..1) or `null`. */
  curves(channels: CurveChannels | null): this {
    return this.#commit(patch(this.#params, "curve", { curvepoints: channels ?? 0 }));
  }

  /** Lens / gaussian blur with a sharp focus area. */
  blur(value: PhotoBlur): this {
    const blur: Partial<BlurParams> = {};
    if (value.bokeh !== undefined) blur.bokehstrength = clamp01(value.bokeh);
    if (value.gaussian !== undefined) blur.gaussianstrength = clamp01(value.gaussian);
    if (value.focus !== undefined) {
      blur.bokehlensout = clamp01(value.focus);
      blur.gaussianlensout = clamp01(value.focus);
    }
    if (value.centerX !== undefined) blur.centerX = clamp01(value.centerX);
    if (value.centerY !== undefined) blur.centerY = clamp01(value.centerY);
    return this.#commit(patch(this.#params, "blur", blur));
  }

  /** The crop, straighten, perspective, turns and flips (see docs/compose.md). */
  get geometry(): GeometryParams {
    return { ...this.#params.geometry };
  }

  /** Quarter turn: `1` clockwise, `-1` counter-clockwise. */
  rotate(direction: 1 | -1 = 1): this {
    return this.#geometry(rotateGeometry(this.#params.geometry, direction));
  }

  flip(axis: "horizontal" | "vertical" = "horizontal"): this {
    return this.#geometry(flipGeometry(this.#params.geometry, axis));
  }

  /** Degrees, ±45. The crop shrinks to stay inside the image. */
  straighten(degrees: number): this {
    const straighten = Math.max(-STRAIGHTEN_LIMIT, Math.min(STRAIGHTEN_LIMIT, degrees));
    return this.#geometry({ ...this.#params.geometry, straighten });
  }

  /** Keystone correction, -1..1 on each axis. */
  perspective({ x, y }: { x?: number; y?: number }): this {
    const geometry = this.#params.geometry;
    return this.#geometry({
      ...geometry,
      perspectiveX: clampUnit(x ?? geometry.perspectiveX),
      perspectiveY: clampUnit(y ?? geometry.perspectiveY),
    });
  }

  /**
   * Crop to a rect normalized to the rotated photo (0..1), or `null` for the
   * whole image.
   */
  crop(rect: NormalizedRect | null): this {
    return this.#geometry({ ...this.#params.geometry, crop: rect });
  }

  /**
   * Lock the crop to a ratio: a number (`16 / 9`), `"16:9"`, `"original"`,
   * or `null` to unlock. The largest centered crop is used.
   */
  aspectRatio(ratio: number | string | null): this {
    const oriented = orientedSize(this.size, this.#params.geometry);
    const value =
      typeof ratio === "string" ? parseAspectRatio(ratio, oriented.width / oriented.height) : ratio;
    return this.#geometry(cropForAspectRatio(this.#params.geometry, this.size, value));
  }

  /** Output size of the edit at full resolution. */
  get outputSize(): Size {
    const geometry = this.#params.geometry;
    return outputPixelSize(geometry, this.size, effectiveCrop(geometry, this.size));
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  /**
   * Render a live preview into `canvas`. It renders in a Web Worker when
   * supported, so a canvas can only be attached once; `detach()` (or the
   * returned function) releases it.
   */
  attach(canvas: HTMLCanvasElement): () => void {
    this.#assertAlive();
    this.#engine?.dispose();
    this.#engine = null;
    const useWorker = (this.#options.renderMode ?? "worker") === "worker" && supportsWorkerRendering();
    const ready = useWorker ? this.#createWorkerEngine(canvas) : Promise.resolve(this.#createMainEngine(canvas, true));
    const attaching: Promise<void> = ready.then((engine) => {
      // A newer attach() won, or the photo is gone.
      if (this.#disposed || this.#engine?.attached || this.#attaching !== attaching) {
        engine.dispose();
        return;
      }
      // Replace a headless engine an export created meanwhile.
      this.#engine?.dispose();
      this.#engine = engine;
      this.#schedule();
    });
    this.#attaching = attaching;
    this.#track(attaching);
    return () => {
      if (this.#engine?.canvas === canvas || this.#attaching === attaching) this.detach();
    };
  }

  /** Stop rendering into the attached canvas. */
  detach(): void {
    this.#attaching = null;
    this.#engine?.dispose();
    this.#engine = null;
  }

  /** Resolves once pending filters have loaded and the latest edit is rendered. */
  async ready(): Promise<this> {
    while (this.#pending.size) await Promise.all([...this.#pending]);
    if (this.#engine) this.#render();
    return this;
  }

  /**
   * RGB histogram of the current result. Computed on demand (it reads the
   * rendered pixels back from the GPU).
   */
  async histogram(): Promise<RgbHistogram> {
    await this.ready();
    if (this.#engine?.worker && this.#histogram) return this.#histogram;
    const engine = this.#ensureEngine();
    this.#render();
    return calculateRgbHistogram(engine.renderer.readPixels(), { stride: 4 });
  }

  /** Encode the edited photo at full resolution (or `width` / `height`). */
  async export(options: PhotoExportOptions = {}): Promise<PhotoExportResult> {
    await this.ready();
    const format = options.format ?? "png";
    const info = exportFormatInfo[format];
    const quality = options.quality ?? info.quality;
    const engine = this.#ensureEngine();
    const params = this.#params;
    const outputSize = resolveOutputSize(this.outputSize, options);
    renderEditorPipeline({
      renderer: engine.renderer,
      params: patch(params, "geometry", { $view: "crop", $outputSize: outputSize }),
    });
    try {
      let blob: Blob;
      let type: string;
      let width: number;
      let height: number;
      if (engine.worker) {
        ({ blob, type, width, height } = await engine.worker.exportBlob({ format: info.mime, quality }));
      } else {
        ({ blob, width, height } = await captureRendererBlob(
          engine.renderer as unknown as MiniGlRenderer,
          { format, quality },
        ));
        type = blob.type || info.mime;
      }
      if (options.preserveExif !== false && this.#exif && format === "jpeg") {
        blob = createExifOutputBlob(await blob.arrayBuffer(), {
          originalExif: this.#exif,
          patchOrientationToOne: true,
          type,
        });
      }
      return { blob, type, width, height, filename: exportFilename(this.name, format) };
    } finally {
      if (engine.attached) this.#render();
    }
  }

  /** Release the renderer, worker and listeners. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#frame !== null) cancelFrame(this.#frame);
    this.#engine?.dispose();
    this.#engine = null;
    this.#listeners.clear();
  }

  // ── Internals ──────────────────────────────────────────────────────────

  #findPreset(label: string): FilterPreset | undefined {
    return findFilterPreset(label, this.#options.filterPresets ?? defaultFilterPresets);
  }

  #geometry(geometry: GeometryParams): this {
    return this.#commit(patch(this.#params, "geometry", { ...geometry }));
  }

  #commit(next: EditorParams): this {
    this.#assertAlive();
    this.#past.push(this.#params);
    const limit = this.#options.historyLimit ?? 100;
    if (this.#past.length > limit) this.#past.splice(0, this.#past.length - limit);
    this.#future = [];
    return this.#set(next);
  }

  #set(next: EditorParams): this {
    this.#params = next;
    this.#schedule();
    for (const listener of this.#listeners) listener(this);
    return this;
  }

  #track(promise: Promise<unknown>): void {
    const tracked = promise.finally(() => this.#pending.delete(tracked));
    this.#pending.add(tracked);
  }

  #schedule(): void {
    if (!this.#engine?.attached || this.#frame !== null) return;
    this.#frame = requestFrame(() => {
      this.#frame = null;
      this.#render();
    });
  }

  #render(): void {
    if (!this.#engine) return;
    renderEditorPipeline({ renderer: this.#engine.renderer, params: this.#params });
  }

  #ensureEngine(): Engine {
    this.#assertAlive();
    if (!this.#engine) this.#engine = this.#createMainEngine(document.createElement("canvas"), false);
    return this.#engine;
  }

  #createMainEngine(canvas: HTMLCanvasElement, attached: boolean): Engine {
    const editor: MiniGlEditor = createMiniGlEditor({ canvas, image: this.image, colorspace: this.colorspace });
    return {
      renderer: editor.renderer as unknown as EditorRenderer,
      canvas,
      attached,
      dispose: () => editor.dispose(),
    };
  }

  async #createWorkerEngine(canvas: HTMLCanvasElement): Promise<Engine> {
    const factory = createWorkerMiniGlEditorFactory({
      spawn: this.#options.spawnWorker ?? spawnInlineWorker,
      proxyMaxDim: this.#options.proxyMaxDim,
      onHistogram: (histogram) => {
        this.#histogram = histogram;
      },
    });
    const instance = await factory({ canvas, image: this.image, colorspace: this.colorspace });
    return {
      renderer: instance.renderer as unknown as EditorRenderer,
      canvas,
      attached: true,
      worker: (instance as unknown as { worker: WorkerEditor }).worker,
      dispose: () => instance.dispose?.(),
    };
  }

  #assertAlive(): void {
    if (this.#disposed) throw new Error("This photo has been disposed.");
  }
}

function patch(
  params: EditorParams,
  section: EditorParamSection,
  values: Record<string, unknown>,
): EditorParams {
  const next = cloneEditorParams(params);
  Object.assign(next[section], values);
  return next;
}

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const requestFrame = (callback: () => void): number =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : (setTimeout(callback, 0) as unknown as number);

const cancelFrame = (id: number) =>
  typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id);

export { createGeometry };
export type { RecipeV1, EditorParams, GeometryParams, NormalizedRect, Size, FilterPreset };
