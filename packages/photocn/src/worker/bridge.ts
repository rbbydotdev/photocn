import type { CropBox } from "../editor-params";
import type { EditorRenderer } from "../render-pipeline";
import type { RgbHistogram } from "../dom/histogram";
import {
  isAbortError,
  makeAbortError,
  makeReqId,
  type ApplyOpsRequest,
  type BitmapSlot,
  type ColorSpace,
  type ImageLevel,
  type RendererOp,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";
import { createLogger, setLoggerPattern } from "./logger";
import { scaleOpsForResolution } from "./scale-ops";

const logFlush = createLogger("bridge:flush");
const logRtt = createLogger("bridge:rtt");
const logCancel = createLogger("bridge:cancel");
const logExportMain = createLogger("bridge:export-main");
const logProxy = createLogger("bridge:proxy");

/** Where the bridge looks for its initial pattern when nothing was passed
 *  in. Mirrors `@/lib/logger`'s precedence (URL > localStorage). The worker
 *  itself can't read localStorage, so the bridge ships this on init. */
function readDebugPatternFromHost(): string {
  try {
    if (typeof window !== "undefined" && window.location?.search) {
      const fromUrl = new URLSearchParams(window.location.search).get("debug");
      if (fromUrl !== null) return fromUrl;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("lw:debug") ?? "";
    }
  } catch {
    /* ignore */
  }
  return "";
}

export interface CreateWorkerEditorOptions {
  worker: Worker;
  canvas: HTMLCanvasElement;
  image: ImageBitmap;
  colorspace: "srgb" | "display-p3";
  /** Optional proxy bitmap. When supplied, the bridge renders against it
   *  during interaction (drag floods) and swaps to the full image after
   *  `idleSwapMs` of no flushes. Must be a downsampled copy of `image`. */
  proxy?: ImageBitmap;
  /** Idle window (ms) before swapping back to full-res. Defaults to 200. */
  idleSwapMs?: number;
  /** Called whenever a render finishes with a fresh histogram. */
  onHistogram?: (histogram: RgbHistogram) => void;
  /** Called whenever a render finishes (regardless of histogram). Useful as
   *  a fallback "paint complete" hook for consumers that don't want histograms. */
  onPaint?: () => void;
}

export interface ExportBlobResult {
  blob: Blob;
  type: string;
  width: number;
  height: number;
}

/** Runtime knobs the dev panel can mutate without rebuilding the editor. */
export interface BridgeConfig {
  /** When false, never swap to proxy — always render at full. Useful for A/B. */
  proxyEnabled: boolean;
  /** ms of idle before swapping back to full-res. */
  idleSwapMs: number;
  /** Histogram pixel stride (1=full, 8=every 8th). */
  histogramStride: number;
  /** When true, drop `filterNoise` ops at proxy res. */
  skipNoiseOnProxy: boolean;
  /** When true, suppress the idle-swap-to-full timer. Used during
   *  press-and-hold compare so the high-res re-render doesn't flash mid-hold.
   *  Idle swap resumes when this flips back to false. */
  suspendIdleSwap: boolean;
}

/** Snapshot of the most recent render. Pushed to subscribers on each paint. */
export interface BridgeStats {
  level: ImageLevel;
  /** Round-trip from bridge.send → response handled, in ms. */
  rttMs: number;
  /** Worker-side phase timings from the response, if present. */
  replayMs: number;
  readMs: number;
  histMs: number;
  totalMs: number;
  /** Final op count after sanitize+scale, as seen by the worker. */
  opCount: number;
  /** Original op count from the renderer pipeline (before scale-ops drop). */
  rawOpCount: number;
  /** Proxy long-edge / full long-edge. 1 if no proxy. */
  proxyScale: number;
  /** Proxy bitmap dimensions, or null if no proxy. */
  proxySize: { width: number; height: number } | null;
}

export interface ExportBlobOptions {
  /** MIME type, e.g. `"image/png"`, `"image/jpeg"`, `"image/webp"`. */
  format: string;
  /** Quality (0..1). Honored only by lossy formats. */
  quality?: number;
}

export interface WorkerEditor {
  readonly renderer: EditorRenderer;
  readonly size: { width: number; height: number };
  readonly canvas: HTMLCanvasElement;
  loadImage(image: ImageBitmap, signal?: AbortSignal): Promise<void>;
  resize(width: number, height: number, signal?: AbortSignal): Promise<void>;
  /** Encodes the worker's current canvas to a Blob — encoding runs in the
   *  worker via `OffscreenCanvas.convertToBlob`, so a 4K JPEG export doesn't
   *  freeze the main thread. Captures whatever the user currently sees. */
  exportBlob(
    options: ExportBlobOptions,
    signal?: AbortSignal,
  ): Promise<ExportBlobResult>;
  /** Runtime config getters/setters for the dev panel. */
  getConfig(): BridgeConfig;
  setConfig(updates: Partial<BridgeConfig>): void;
  /** Subscribe to per-paint stats. Returns an unsubscribe function. */
  onStats(fn: (stats: BridgeStats) => void): () => void;
  /** Last computed stats; useful for initial render before any paint. */
  getStats(): BridgeStats | null;
  /** Snapshot of construction-time facts (proxy bitmap dims, full dims, etc). */
  readonly proxySize: { width: number; height: number } | null;
  readonly proxyScale: number;
  /** Rebuild the proxy at a new long-edge cap. `maxDim === 0` drops the proxy
   *  entirely. Side effect: emits a stats update with the new proxySize so
   *  subscribers (e.g. the dev panel) see the change. */
  setProxyMaxDim(maxDim: number, signal?: AbortSignal): Promise<void>;
  dispose(): void;
}

/**
 * Creates a worker-backed editor. The visible `<canvas>` is given to the
 * worker via `transferControlToOffscreen()` (one-way, one-shot). The returned
 * `renderer` is a synchronous-looking proxy: filter calls land in a buffer,
 * `paintCanvas()` flushes the buffer to the worker, where the equivalent
 * mini-gl calls run for real.
 *
 * Cancellation: a render in progress is aborted automatically when a new
 * one starts (last-write-wins for slider drag floods). Pass an `AbortSignal`
 * to `loadImage`/`resize` to cancel those individually.
 */
export function createWorkerEditor(
  options: CreateWorkerEditorOptions,
): Promise<WorkerEditor> {
  return WorkerEditorImpl.create(options);
}

interface PendingCall {
  resolve: (res: WorkerResponse) => void;
  reject: (err: unknown) => void;
  abortListener?: () => void;
  signal?: AbortSignal;
}

class WorkerEditorImpl implements WorkerEditor {
  static async create(
    options: CreateWorkerEditorOptions,
  ): Promise<WorkerEditor> {
    const offscreen = options.canvas.transferControlToOffscreen();
    const impl = new WorkerEditorImpl(options);
    await impl.init(offscreen, options.image, options.proxy);
    // Pre-warm: round-trip the worker through proxy and back so both GPU
    // textures are uploaded before the first interaction-time swap.
    //
    // Critical: the swaps re-upload textures (~30ms each on a 24MP image)
    // and queue serially in the worker. If we run them right after init,
    // the user's *first* applyOps queues behind two warmup uploads — adding
    // ~60ms latency to the very first interaction. Defer to browser idle
    // so the warmup happens during slack time, not main-thread crunch.
    //
    // Skip the warmup if no paint has happened yet — `setSource` resizes
    // the canvas + recreates FBO textures, which clears the visible canvas.
    // Without an intermediate paint, the user would see a blank canvas after
    // the warmup runs. We only warm up if there's a painted state to restore
    // (via `lastOps` re-flush) immediately after the swap-to-full.
    if (options.proxy) {
      const warmup = () => {
        if (impl.disposed) return;
        if (!impl.lastOps) return;
        void impl.send(
          { type: "set-active-level", reqId: makeReqId(), level: "proxy" },
          [],
        );
        void impl.send(
          { type: "set-active-level", reqId: makeReqId(), level: "full" },
          [],
        );
        // Repaint at full so the cleared canvas gets the rendered image
        // back. Without this, the canvas sits blank after warmup until the
        // user's first interaction.
        impl.dispatchFlush(impl.lastOps, impl.lastBitmaps, true);
      };
      type IdleCb = (cb: () => void, opts?: { timeout: number }) => void;
      const ric = (
        globalThis as unknown as { requestIdleCallback?: IdleCb }
      ).requestIdleCallback;
      if (typeof ric === "function") {
        ric(warmup, { timeout: 1000 });
      } else {
        setTimeout(warmup, 200);
      }
    }
    return impl;
  }

  readonly canvas: HTMLCanvasElement;
  size = { width: 0, height: 0 };

  private worker: Worker;
  private colorspace: ColorSpace;
  private onHistogram?: (h: RgbHistogram) => void;
  private onPaint?: () => void;
  private pending = new Map<string, PendingCall>();
  private disposed = false;

  // Cached pixel buffer from the most recent worker render. `readPixels()`
  // returns this synchronously — the histogram hook reads it right after
  // `onHistogramUpdate` fires, which we trigger only after the buffer has
  // been replaced by an incoming worker message.
  private lastPixels: Uint8Array = new Uint8Array(0);

  // Cancels the most-recent applyOps. A new flush always aborts the prior.
  private renderAbort: AbortController | null = null;

  // Rate-limit + coalesce. Worker handles 1 applyOps at a time; new flushOps
  // during an in-flight render store the latest into `pendingFlush` (replacing
  // any prior pending — only the most recent state matters). When the
  // in-flight finishes, we dispatch the pending. This gives "throttled, not
  // debounced" behavior: the user sees frames at the worker's natural pace
  // (~5fps on a 200ms render) rather than every drag tick (which the worker
  // can't keep up with anyway), and there's no 4-second backlog after release.
  private inFlightReqId: string | null = null;
  private pendingFlush: {
    ops: RendererOp[];
    bitmaps: ApplyOpsRequest["bitmaps"];
    asIdleRerender: boolean;
  } | null = null;

  private rendererProxy: ProxyRenderer;

  // --- proxy/level state ---
  /** Linear scale factor: proxy long-edge / full long-edge. 1 if no proxy. */
  proxyScale = 1;
  /** Proxy bitmap dimensions. null if no proxy was provided. */
  proxySize: { width: number; height: number } | null = null;
  /** Current rendering level. Drives op scaling + skip-on-proxy. */
  private currentLevel: ImageLevel = "full";
  /** Whether the worker actually has a proxy bitmap to swap to. */
  private hasProxy = false;
  /** Pending idle timer; canceled on each flush, re-armed after. */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Last flush's ops + bitmaps. Replayed at full-res on idle so the user
   *  sees the high-quality render of their final state. */
  private lastOps: RendererOp[] | null = null;
  private lastBitmaps: ApplyOpsRequest["bitmaps"] = undefined;

  // --- runtime config + stats ---
  private config: BridgeConfig;
  private statsListeners = new Set<(s: BridgeStats) => void>();
  private lastStats: BridgeStats | null = null;

  constructor(options: CreateWorkerEditorOptions) {
    this.canvas = options.canvas;
    this.worker = options.worker;
    this.colorspace = options.colorspace;
    this.onHistogram = options.onHistogram;
    this.onPaint = options.onPaint;
    this.config = {
      proxyEnabled: true,
      idleSwapMs: options.idleSwapMs ?? 200,
      histogramStride: 8,
      skipNoiseOnProxy: true,
      suspendIdleSwap: false,
    };
    this.hasProxy = Boolean(options.proxy);
    if (options.proxy && options.image) {
      // Proxy is a downsampled copy of the same source — long-edge ratio
      // equals the linear scale we'll use for spatial-pixel param scaling.
      const fullLong = Math.max(options.image.width, options.image.height);
      const proxyLong = Math.max(options.proxy.width, options.proxy.height);
      this.proxyScale = fullLong > 0 ? proxyLong / fullLong : 1;
      this.proxySize = { width: options.proxy.width, height: options.proxy.height };
    }
    this.rendererProxy = new ProxyRenderer(this);
    this.worker.addEventListener("message", this.onMessage);

    if (logProxy.enabled) {
      const fullW = options.image?.width ?? 0;
      const fullH = options.image?.height ?? 0;
      if (this.hasProxy && this.proxySize) {
        logProxy(
          `init: full=${fullW}x${fullH}`,
          `proxy=${this.proxySize.width}x${this.proxySize.height}`,
          `scale=${this.proxyScale.toFixed(3)}`,
          `idleMs=${this.config.idleSwapMs}`,
        );
      } else {
        logProxy(
          `init: full=${fullW}x${fullH}`,
          "proxy=none",
          "(image likely already ≤ proxyMaxDim; will always render at full)",
        );
      }
    }

    // Light up worker-side logging using whatever pattern is currently set
    // on the main thread. setLoggerPattern is idempotent + cheap, so we
    // also apply it locally for the bridge probes (since the photo-edit
    // logger module is independent of @/lib/logger).
    this.syncDebugPattern();
    // Pick up changes when devtools toggles `lw:debug` in localStorage.
    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.onStorage);
    }
  }

  private lastSyncedPattern: string | null = null;

  private syncDebugPattern = (): void => {
    const pattern = readDebugPatternFromHost();
    if (pattern === this.lastSyncedPattern) return;
    this.lastSyncedPattern = pattern;
    setLoggerPattern(pattern);
    this.worker.postMessage({ type: "set-debug-pattern", pattern });
  };

  private onStorage = (event: StorageEvent): void => {
    if (event.key === "lw:debug" || event.key === null) this.syncDebugPattern();
  };

  get renderer(): EditorRenderer {
    return this.rendererProxy as unknown as EditorRenderer;
  }

  async loadImage(image: ImageBitmap, signal?: AbortSignal): Promise<void> {
    const res = await this.send(
      { type: "loadImage", reqId: makeReqId(), image },
      [image],
      signal,
    );
    if (res.type === "ok" && res.size) this.size = res.size;
  }

  async resize(width: number, height: number, signal?: AbortSignal): Promise<void> {
    const res = await this.send(
      { type: "resize", reqId: makeReqId(), width, height },
      [],
      signal,
    );
    if (res.type === "ok" && res.size) this.size = res.size;
  }

  // --- runtime config + stats ---

  getConfig(): BridgeConfig {
    return { ...this.config };
  }

  setConfig(updates: Partial<BridgeConfig>): void {
    this.config = { ...this.config, ...updates };
    // If the user just toggled proxy off and we're currently rendering
    // against the proxy, swap back to full so the next interaction shows
    // full-res. (The next flush would do this naturally too — just snappier
    // to do it now so the dev-panel toggle feels live.)
    if (!this.config.proxyEnabled && this.currentLevel === "proxy") {
      this.swapLevel("full");
    }
  }

  onStats(fn: (stats: BridgeStats) => void): () => void {
    this.statsListeners.add(fn);
    return () => {
      this.statsListeners.delete(fn);
    };
  }

  getStats(): BridgeStats | null {
    return this.lastStats;
  }

  private emitStats(stats: BridgeStats): void {
    this.lastStats = stats;
    for (const fn of this.statsListeners) {
      try {
        fn(stats);
      } catch (err) {
        console.warn("[photocn/worker] stats listener threw:", err);
      }
    }
  }

  async setProxyMaxDim(maxDim: number, signal?: AbortSignal): Promise<void> {
    const fullW = this.size.width || 1;
    const fullH = this.size.height || 1;
    const fullLong = Math.max(fullW, fullH);
    const res = await this.send(
      { type: "rebuild-proxy", reqId: makeReqId(), maxDim },
      [],
      signal,
    );
    if (res.type !== "ok") return;
    if (res.proxySize === null || res.proxySize === undefined) {
      this.proxySize = null;
      this.proxyScale = 1;
      this.hasProxy = false;
    } else {
      this.proxySize = res.proxySize;
      const proxyLong = Math.max(res.proxySize.width, res.proxySize.height);
      this.proxyScale = fullLong > 0 ? proxyLong / fullLong : 1;
      this.hasProxy = true;
    }
    if (logProxy.enabled) {
      logProxy(
        `rebuild: maxDim=${maxDim}`,
        this.proxySize
          ? `proxy=${this.proxySize.width}x${this.proxySize.height} scale=${this.proxyScale.toFixed(3)}`
          : "proxy=dropped",
      );
    }
    // Push an updated stats snapshot to subscribers so the dev panel
    // re-renders with the new proxy dims even if no paint has happened yet.
    if (this.lastStats) {
      this.emitStats({
        ...this.lastStats,
        proxyScale: this.proxyScale,
        proxySize: this.proxySize,
      });
    }
  }

  async exportBlob(
    options: ExportBlobOptions,
    signal?: AbortSignal,
  ): Promise<ExportBlobResult> {
    // The canvas may hold a proxy-resolution frame (any recent flush swaps to
    // proxy). Export must capture full resolution: cancel the idle timer,
    // swap to full and wait for a full-res render before encoding.
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.currentLevel !== "full") {
      this.swapLevel("full");
      this.pendingFlush = null;
      if (this.lastOps) {
        await this.dispatchFlush(this.lastOps, this.lastBitmaps, true).catch(
          (err) => {
            if (!isAbortError(err)) throw err;
          },
        );
      }
    }
    const t = performance.now();
    const res = await this.send(
      {
        type: "exportBlob",
        reqId: makeReqId(),
        format: options.format,
        quality: options.quality,
      },
      [],
      signal,
    );
    if (res.type !== "ok" || !res.blob) {
      throw new Error("worker exportBlob: no blob returned");
    }
    if (logExportMain.enabled) {
      logExportMain(
        `format=${options.format}`,
        `bytes=${res.blob.size}`,
        `rtt=${(performance.now() - t).toFixed(1)}ms`,
      );
    }
    return {
      blob: res.blob,
      type: res.blob.type || options.format,
      width: res.size?.width ?? this.size.width,
      height: res.size?.height ?? this.size.height,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.renderAbort?.abort();
    void this.send({ type: "dispose", reqId: makeReqId() }, []).catch(() => {});
    for (const [, p] of this.pending) p.reject(makeAbortError());
    this.pending.clear();
    this.worker.removeEventListener("message", this.onMessage);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", this.onStorage);
    }
    this.worker.terminate();
  }

  // Called by ProxyRenderer.paintCanvas. Coalesces with any in-flight render.
  flushOps(ops: RendererOp[], bitmaps: ApplyOpsRequest["bitmaps"]): void {
    // Cheap (string === string) — picks up any same-tab `enableLoggers` /
    // `disableLoggers` between renders without explicit subscription.
    this.syncDebugPattern();

    // Stash for an idle re-render at full resolution. We replay the *same*
    // op buffer at scale=1 once activity stops.
    this.lastOps = ops;
    this.lastBitmaps = bitmaps;

    // First user activity → swap to proxy (if available + enabled). Subsequent
    // flushes just bump the idle timer.
    if (
      this.hasProxy &&
      this.config.proxyEnabled &&
      this.currentLevel === "full"
    ) {
      this.swapLevel("proxy");
    }
    if (this.config.proxyEnabled) {
      this.armIdleSwap();
    }

    // Rate-limit: if an applyOps is already in flight, coalesce. Replace any
    // prior pending — when the in-flight finishes we'll dispatch the latest
    // state. The user sees throttled (not debounced) intermediate frames.
    if (this.inFlightReqId !== null) {
      this.pendingFlush = { ops, bitmaps, asIdleRerender: false };
      if (logFlush.enabled) {
        logFlush(`coalesced into pending (in-flight=${this.inFlightReqId})`);
      }
      return;
    }

    this.dispatchFlush(ops, bitmaps, /* asIdleRerender */ false);
  }

  /** Internal: actually post the applyOps message. Used by both the
   *  user-driven flushOps path and the idle full-res re-flush. Caller is
   *  responsible for ensuring no other applyOps is in flight (via the
   *  rate-limit gate in flushOps) — the only path that may dispatch while
   *  another is in flight is the idle-rerender, which we expect to
   *  preempt the user-driven render via signal abort. */
  private dispatchFlush(
    ops: RendererOp[],
    bitmaps: ApplyOpsRequest["bitmaps"],
    asIdleRerender: boolean,
  ): Promise<void> {
    // The idle-rerender path may run while a user-driven applyOps is in
    // flight (the user just released the slider while a frame was rendering
    // at proxy). Cancel the in-flight one so the higher-quality full render
    // takes its place rather than being delayed by 200ms.
    if (this.renderAbort && asIdleRerender) {
      this.renderAbort.abort();
      if (logCancel.enabled) {
        logCancel("idle-rerender aborted in-flight render");
      }
    }
    const controller = new AbortController();
    this.renderAbort = controller;

    // At proxy level, scale spatial-pixel params and drop skip-on-proxy ops.
    // At full level (or when no proxy), pass-through.
    const scaledOps =
      this.currentLevel === "proxy"
        ? scaleOpsForResolution(ops, this.proxyScale, {
            skipOnProxy: this.config.skipNoiseOnProxy,
          })
        : ops;

    // Walk every arg of every op, rasterize any HTMLImageElement/Canvas/etc
    // to ImageBitmap, replace with `null` in a clone, and record a path-keyed
    // slot so the worker can patch it back zero-copy via transfer. The
    // returned `bitmaps` here merges any caller-provided slots with the ones
    // synthesized from the deep walk.
    const sanitized = sanitizeOpsForTransfer(scaledOps, bitmaps);

    const reqId = makeReqId();
    const req: ApplyOpsRequest = {
      type: "applyOps",
      reqId,
      ops: sanitized.ops,
      bitmaps: sanitized.bitmaps.length ? sanitized.bitmaps : undefined,
      histogram: {
        enabled: true,
        options: { stride: this.config.histogramStride },
      },
    };
    const transfer: Transferable[] = [];
    for (const slot of sanitized.bitmaps) transfer.push(slot.bitmap);

    if (logFlush.enabled) {
      logFlush(
        `reqId=${reqId}`,
        `level=${this.currentLevel}`,
        `scale=${this.proxyScale.toFixed(3)}`,
        `ops=${ops.length}→${sanitized.ops.length}`,
        asIdleRerender ? "idle-rerender" : "live",
      );
    }

    const tSent = performance.now();
    const rawOpCount = ops.length;
    this.inFlightReqId = reqId;
    return this.send(req, transfer, controller.signal)
      .then((res) => {
        if (res.type !== "ok") return;
        const rttMs = performance.now() - tSent;
        if (logRtt.enabled) {
          logRtt(
            `reqId=${reqId}`,
            `rtt=${rttMs.toFixed(1)}ms`,
            res.pixels ? `pixels=${res.pixels.byteLength}b` : "no-pixels",
            res.histogram ? "hist✓" : "hist✗",
          );
        }
        if (res.pixels) this.lastPixels = res.pixels;
        if (res.histogram) this.onHistogram?.(res.histogram);
        this.onPaint?.();
        // Push a stats snapshot to subscribers (dev panel, etc).
        if (res.timing && res.level) {
          this.emitStats({
            level: res.level,
            rttMs,
            replayMs: res.timing.replayMs,
            readMs: res.timing.readMs,
            histMs: res.timing.histMs,
            totalMs: res.timing.totalMs,
            opCount: res.timing.opCount,
            rawOpCount,
            proxyScale: this.proxyScale,
            proxySize: this.proxySize,
          });
        }
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          console.warn("[photocn/worker] render failed:", err);
        }
      })
      .finally(() => {
        // Worker is free. Clear in-flight + dispatch any pending coalesced
        // flush. This is what makes rate-limit + coalesce produce continuous
        // intermediate frames during a drag — at the worker's natural pace.
        if (this.inFlightReqId === reqId) this.inFlightReqId = null;
        if (this.disposed) return;
        if (this.pendingFlush) {
          const next = this.pendingFlush;
          this.pendingFlush = null;
          this.dispatchFlush(next.ops, next.bitmaps, next.asIdleRerender);
        }
      });
  }

  /** Cancel any pending idle timer + arm a new one. On expiry: swap to full
   *  and re-flush the last ops at full scale so the high-quality version
   *  appears on the canvas after the user stops dragging. */
  private armIdleSwap(): void {
    if (!this.hasProxy) return;
    if (this.config.suspendIdleSwap) {
      // Compare-hold or similar — caller wants the proxy view to stick. Clear
      // any prior timer so the swap doesn't fire from a pre-suspension arm.
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      return;
    }
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.currentLevel === "full") return;
      if (logProxy.enabled) logProxy("idle reached, swapping → full");
      this.swapLevel("full");
      if (this.lastOps) {
        this.dispatchFlush(this.lastOps, this.lastBitmaps, true);
      }
    }, this.config.idleSwapMs);
  }

  /** Tells the worker to rebind its source texture. Fire-and-forget: we
   *  don't await the response — the next applyOps will queue behind it. */
  private swapLevel(level: ImageLevel): void {
    if (this.currentLevel === level) return;
    this.currentLevel = level;
    if (logProxy.enabled) logProxy(`swap → ${level}`);
    void this.send(
      { type: "set-active-level", reqId: makeReqId(), level },
      [],
    ).catch((err) => {
      if (!isAbortError(err)) {
        console.warn("[photocn/worker] level swap failed:", err);
      }
    });
  }

  getLastPixels(): Uint8Array {
    return this.lastPixels;
  }

  private async init(
    canvas: OffscreenCanvas,
    image: ImageBitmap,
    proxy: ImageBitmap | undefined,
  ): Promise<void> {
    const transfer: Transferable[] = [canvas, image];
    if (proxy) transfer.push(proxy);
    const res = await this.send(
      {
        type: "init",
        reqId: makeReqId(),
        canvas,
        image,
        proxy,
        colorspace: this.colorspace,
      },
      transfer,
    );
    if (res.type === "ok" && res.size) this.size = res.size;
  }

  private send(
    req: Exclude<WorkerRequest, { type: "set-debug-pattern" }>,
    transfer: Transferable[],
    signal?: AbortSignal,
  ): Promise<WorkerResponse> {
    return new Promise<WorkerResponse>((resolve, reject) => {
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      const entry: PendingCall = { resolve, reject, signal };
      if (signal) {
        const onAbort = () => {
          this.worker.postMessage({ type: "cancel", reqId: req.reqId });
          this.pending.delete(req.reqId);
          reject(makeAbortError());
        };
        entry.abortListener = onAbort;
        signal.addEventListener("abort", onAbort, { once: true });
      }
      this.pending.set(req.reqId, entry);
      this.worker.postMessage(req, transfer);
    });
  }

  private onMessage = (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const entry = this.pending.get(res.reqId);
    if (!entry) return;
    this.pending.delete(res.reqId);
    if (entry.signal && entry.abortListener) {
      entry.signal.removeEventListener("abort", entry.abortListener);
    }
    if (res.type === "error") {
      const err = new Error(res.error.message);
      err.name = res.error.name;
      if (res.error.stack) err.stack = res.error.stack;
      entry.reject(err);
    } else if (res.type === "aborted") {
      entry.reject(makeAbortError());
    } else {
      entry.resolve(res);
    }
  };
}

/**
 * Renderer proxy. Buffers method calls into `RendererOp[]` and flushes them
 * to the worker on `paintCanvas`. Special-cases:
 *
 * - `crop`/`resetCrop`: also mirrors `appliedCrop` so `renderEditorPipeline`'s
 *   reconciliation logic — which reads `renderer.appliedCrop` synchronously —
 *   continues to work.
 * - `filterBlend`: blendmap is non-cloneable. We extract any ImageBitmap
 *   into the `bitmaps[]` side-channel so it transfers zero-copy. Other
 *   CanvasImageSource shapes (HTMLImageElement, HTMLCanvasElement) are
 *   skipped — recipes pass already-decoded ImageBitmaps in practice.
 * - `readPixels`: returns the cached buffer from the previous paint (always
 *   one frame stale by design — same staleness the histogram hook already
 *   tolerates).
 */
class ProxyRenderer {
  img: CanvasImageSource;
  img_cropped?: CanvasImageSource;
  appliedCrop?: CropBox;
  gl: { canvas: { width: number; height: number } };

  private ops: RendererOp[] = [];
  private bitmaps: NonNullable<ApplyOpsRequest["bitmaps"]> = [];
  private bridge: WorkerEditorImpl;

  constructor(bridge: WorkerEditorImpl) {
    this.bridge = bridge;
    this.img = bridge.canvas as unknown as CanvasImageSource;
    const sizeRef = () => bridge.size;
    this.gl = {
      canvas: {
        get width() { return sizeRef().width; },
        get height() { return sizeRef().height; },
      },
    };
  }

  get width(): number { return this.bridge.size.width; }
  get height(): number { return this.bridge.size.height; }

  // --- buffered mutators ---

  loadImage(_image?: CanvasImageSource | ImageData): void {
    // `renderEditorPipeline` calls this with no args. Worker-side
    // `loadImage()` reuploads the current texture — ship it through.
    this.ops.push({ name: "loadImage", args: [] });
  }

  resetCrop(): void {
    this.appliedCrop = undefined;
    this.ops.push({ name: "resetCrop", args: [] });
  }

  crop(rect: CropBox): void {
    this.appliedCrop = rect;
    this.ops.push({ name: "crop", args: [rect] });
  }

  filterMatrix(params: unknown): void {
    this.ops.push({ name: "filterMatrix", args: [params] });
  }

  filterPerspective(
    before: Array<[number, number]>,
    after: Array<[number, number]>,
    horizontal: boolean,
    vertical: boolean,
  ): void {
    this.ops.push({
      name: "filterPerspective",
      args: [before, after, horizontal, vertical],
    });
  }

  filterBlend(blendmap: CanvasImageSource, blendmix: number): void {
    // Push the blendmap raw — the deep sanitizer at flush time walks all
    // op args and rasterizes any HTMLImageElement/Canvas/etc. into the
    // bitmaps slot keyed by path. Same goes for nested image refs (LUT
    // maps inside a FilterOption, etc.).
    this.ops.push({ name: "filterBlend", args: [blendmap, blendmix] });
  }

  filterAdjustments(params: Record<string, unknown>): void {
    this.ops.push({ name: "filterAdjustments", args: [params] });
  }
  filterBloom(strength: number): void {
    this.ops.push({ name: "filterBloom", args: [strength] });
  }
  filterNoise(strength: number): void {
    this.ops.push({ name: "filterNoise", args: [strength] });
  }
  filterHighlightsShadows(highlights: number, shadows: number): void {
    this.ops.push({ name: "filterHighlightsShadows", args: [highlights, shadows] });
  }
  filterCurves(curvepoints: unknown): void {
    this.ops.push({ name: "filterCurves", args: [curvepoints] });
  }
  filterInsta(opt: unknown, mix: number): void {
    this.ops.push({ name: "filterInsta", args: [opt, mix] });
  }
  filterBlurBokeh(params: unknown): void {
    this.ops.push({ name: "filterBlurBokeh", args: [params] });
  }
  filterBlurGaussian(params: unknown): void {
    this.ops.push({ name: "filterBlurGaussian", args: [params] });
  }

  paintCanvas(): void {
    this.ops.push({ name: "paintCanvas", args: [] });
    const ops = this.ops;
    const bitmaps = this.bitmaps;
    this.ops = [];
    this.bitmaps = [];
    this.bridge.flushOps(ops, bitmaps.length ? bitmaps : undefined);
  }

  readPixels(): Uint8Array {
    return this.bridge.getLastPixels();
  }

  /**
   * Export path. The upstream `captureImage` returns `HTMLImageElement`,
   * which only exists on the main thread. For the spike we synthesize one
   * from the last cached pixels via an OffscreenCanvas → blob → object URL
   * round-trip on this thread. Stale by one paint, same as `readPixels`.
   *
   * Followup: gate export through an explicit `worker.exportImage(opts)`
   * on the bridge so it captures fresh pixels rather than the cached buffer.
   */
  captureImage(type?: string, _quality?: number | false): HTMLImageElement {
    const pixels = this.bridge.getLastPixels();
    const { width, height } = this.bridge.size;
    const img = document.createElement("img");
    if (!pixels.length || !width || !height) return img;
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : (() => {
            const c = document.createElement("canvas");
            c.width = width;
            c.height = height;
            return c;
          })();
    const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext(
      "2d",
    ) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return img;
    const data = new Uint8ClampedArray(pixels);
    ctx.putImageData(new ImageData(data, width, height), 0, 0);
    if (canvas instanceof HTMLCanvasElement) {
      img.src = canvas.toDataURL(type);
    } else {
      // OffscreenCanvas → convertToBlob is async; for sync contract we use
      // the data URL pathway via a temporary 2D canvas. The proxy above is
      // the sync path; if we got here, we already have an HTMLCanvasElement.
    }
    return img;
  }
}

export type { ProxyRenderer };

/**
 * Walks every op in `ops`, deep-clones the args while:
 *   - replacing any `ImageBitmap` with `null` (and recording it as a slot,
 *     since the bitmap is transferable as-is),
 *   - rasterizing any other `CanvasImageSource` (HTMLImageElement, Canvas,
 *     VideoFrame, …) into a fresh `ImageBitmap` and recording that as a slot,
 *   - leaving structured-cloneable values (numbers, strings, plain objects,
 *     arrays, etc.) untouched.
 *
 * The returned `bitmaps` array contains both pre-existing slots passed in
 * and any new slots created by the walk. Worker-side `applyOps` reads each
 * slot's `path` and re-inserts the bitmap into the args tree zero-copy.
 *
 * This is what makes "any random nested image-y reference passed through
 * EditorParams" survive the postMessage boundary — the LUT image inside a
 * `FilterOption.map1` was the bug that motivated this generic walker.
 */
function sanitizeOpsForTransfer(
  ops: RendererOp[],
  existing: BitmapSlot[] | undefined,
): { ops: RendererOp[]; bitmaps: BitmapSlot[] } {
  const bitmaps: BitmapSlot[] = existing ? [...existing] : [];
  const cleanOps: RendererOp[] = ops.map((op, opIndex) => ({
    name: op.name,
    args: op.args.map((arg, i) =>
      sanitizeValue(arg, [i], opIndex, bitmaps),
    ),
  }));
  return { ops: cleanOps, bitmaps };
}

function sanitizeValue(
  value: unknown,
  path: Array<string | number>,
  opIndex: number,
  out: BitmapSlot[],
): unknown {
  if (value == null) return value;
  if (value instanceof ImageBitmap) {
    out.push({ opIndex, path, bitmap: value });
    return null;
  }
  if (isCanvasImageSource(value)) {
    const bitmap = rasterizeToBitmapSync(value as CanvasImageSource);
    if (bitmap) out.push({ opIndex, path, bitmap });
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => sanitizeValue(v, [...path, i], opIndex, out));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      next[key] = sanitizeValue(obj[key], [...path, key], opIndex, out);
    }
    return next;
  }
  return value;
}

function isCanvasImageSource(value: unknown): boolean {
  if (typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement) return true;
  if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) return true;
  if (typeof HTMLVideoElement !== "undefined" && value instanceof HTMLVideoElement) return true;
  if (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas) return true;
  if (typeof SVGImageElement !== "undefined" && value instanceof SVGImageElement) return true;
  if (typeof VideoFrame !== "undefined" && value instanceof VideoFrame) return true;
  if (typeof ImageData !== "undefined" && value instanceof ImageData) return true;
  return false;
}

/**
 * Rasterizes any `CanvasImageSource` to an `ImageBitmap` synchronously by
 * painting it onto a one-shot `OffscreenCanvas` and stealing the bitmap via
 * `transferToImageBitmap()`. Returns `null` if the source has zero dims
 * (e.g. an Image not yet loaded) — sanitizer skips the slot rather than
 * sending a degenerate value.
 */
function rasterizeToBitmapSync(source: CanvasImageSource): ImageBitmap | null {
  if (source instanceof ImageBitmap) return source;
  const dims = bitmapSourceDimensions(source);
  if (!dims) return null;
  if (typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(dims.width, dims.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, dims.width, dims.height);
  return canvas.transferToImageBitmap();
}

function bitmapSourceDimensions(
  source: CanvasImageSource,
): { width: number; height: number } | null {
  // HTMLImageElement uses naturalWidth/Height; everything else uses width/height.
  const candidate = source as Partial<HTMLImageElement> & {
    width?: number;
    height?: number;
  };
  const width = candidate.naturalWidth || candidate.width || 0;
  const height = candidate.naturalHeight || candidate.height || 0;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}
