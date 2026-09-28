import type { CalculateRgbHistogramOptions, RgbHistogram } from "../dom/histogram";

export type ColorSpace = "srgb" | "display-p3";

/** A renderer method call captured by the main-thread proxy. The worker
 * replays these in order against its real `MiniGlRenderer`. Arg arrays must
 * be structured-cloneable; non-cloneable members (ImageBitmap, etc.) ride
 * separately in the message's `transfer` and are slotted in by the worker
 * via `bitmapSlots`. */
export interface RendererOp {
  name: string;
  args: unknown[];
}

export interface InitRequest {
  type: "init";
  reqId: string;
  canvas: OffscreenCanvas;
  image: ImageBitmap;
  colorspace: ColorSpace;
  /**
   * Optional downsampled proxy bitmap. If present, the worker keeps both;
   * `setActiveLevel` toggles which one drives renders. Init-time texture is
   * always the full image — the bridge swaps to proxy on first interaction.
   */
  proxy?: ImageBitmap;
}

/** Image-resolution levels the worker can render against. */
export type ImageLevel = "full" | "proxy";

/** Switches which image the worker uses as the source texture. Cheap (just
 *  rebinds + reuploads — no re-init of mini-gl, no canvas teardown). */
export interface SetActiveLevelRequest {
  type: "set-active-level";
  reqId: string;
  level: ImageLevel;
}

/** Rebuild the proxy bitmap from the worker's full-res source at the given
 *  long-edge cap. `maxDim === 0` drops the proxy entirely. The worker holds
 *  the source bitmap (not transferable on main side once init transferred it),
 *  so doing the rebuild here saves shipping the source back. */
export interface RebuildProxyRequest {
  type: "rebuild-proxy";
  reqId: string;
  maxDim: number;
}

export interface LoadImageRequest {
  type: "loadImage";
  reqId: string;
  image: ImageBitmap;
}

/** Path-addressed bitmap slot. The slot's bitmap replaces the value at
 *  `ops[opIndex].args[path[0]]…[path[N-1]]` after structured-cloning + transfer.
 *  Path supports nested objects/arrays so e.g. a LUT image inside a filter
 *  option (`opt.map1`) can be sent zero-copy without serializing the parent. */
export interface BitmapSlot {
  opIndex: number;
  path: Array<string | number>;
  bitmap: ImageBitmap;
}

export interface ApplyOpsRequest {
  type: "applyOps";
  reqId: string;
  ops: RendererOp[];
  bitmaps?: BitmapSlot[];
  histogram?: { enabled: boolean; options?: CalculateRgbHistogramOptions };
  /**
   * When true, the worker reads back pixels via `gl.readPixels` (sync GPU
   * stall, ~5–80ms scaled to image size) and ships them as a transferable.
   * Default false — modern flow doesn't need pixels on main: histograms come
   * pre-computed, export goes through the dedicated `exportBlob` path.
   */
  returnPixels?: boolean;
}

export interface ReadPixelsRequest {
  type: "readPixels";
  reqId: string;
}

export interface ResizeRequest {
  type: "resize";
  reqId: string;
  width: number;
  height: number;
}

export interface ExportBlobRequest {
  type: "exportBlob";
  reqId: string;
  format: string; // MIME type, e.g. "image/png"
  quality?: number;
}

export interface CancelRequest {
  type: "cancel";
  reqId: string;
}

/** Lights up dev-only namespaced logging in the worker. Fire-and-forget —
 *  no response, no reqId tracking on this one. */
export interface SetDebugPatternMessage {
  type: "set-debug-pattern";
  pattern: string;
}

export interface DisposeRequest {
  type: "dispose";
  reqId: string;
}

export type WorkerRequest =
  | InitRequest
  | LoadImageRequest
  | SetActiveLevelRequest
  | RebuildProxyRequest
  | ApplyOpsRequest
  | ReadPixelsRequest
  | ResizeRequest
  | ExportBlobRequest
  | CancelRequest
  | DisposeRequest
  | SetDebugPatternMessage;

/** Per-phase timing returned from the worker for an applyOps render. All
 *  numbers in milliseconds. Optional — only set for responses where the
 *  worker measured them (currently `applyOps`). */
export interface ApplyTiming {
  replayMs: number;
  readMs: number;
  histMs: number;
  totalMs: number;
  opCount: number;
}

export interface OkResponse {
  type: "ok";
  reqId: string;
  size?: { width: number; height: number };
  /** Returned by `rebuild-proxy`: the new proxy dimensions, or `null` when
   *  the proxy was dropped (maxDim=0 or already smaller than maxDim). */
  proxySize?: { width: number; height: number } | null;
  pixels?: Uint8Array;
  histogram?: RgbHistogram;
  blob?: Blob;
  timing?: ApplyTiming;
  level?: ImageLevel;
}

export interface ErrorResponse {
  type: "error";
  reqId: string;
  error: { name: string; message: string; stack?: string };
}

export interface AbortedResponse {
  type: "aborted";
  reqId: string;
}

export type WorkerResponse = OkResponse | ErrorResponse | AbortedResponse;

export function makeReqId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && err.name === "AbortError"
  ) ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: unknown }).name === "AbortError");
}

export function makeAbortError(): DOMException {
  return new DOMException("Operation aborted", "AbortError");
}
