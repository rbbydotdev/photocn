/// <reference lib="webworker" />

import type { EditorRenderer } from "../render-pipeline";
import { minigl as createMiniGl } from "../gl/minigl";
import { calculateRgbHistogram, createRgbHistogram } from "../dom/histogram";
import {
  isAbortError,
  makeAbortError,
  type ApplyOpsRequest,
  type DisposeRequest,
  type ExportBlobRequest,
  type ImageLevel,
  type InitRequest,
  type LoadImageRequest,
  type ReadPixelsRequest,
  type RebuildProxyRequest,
  type ResizeRequest,
  type SetActiveLevelRequest,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";
import { createLogger, setLoggerPattern } from "./logger";

const log = createLogger("bridge:worker");
const logApply = createLogger("bridge:apply");
const logExport = createLogger("bridge:export");
const logLevel = createLogger("bridge:level");

declare const self: DedicatedWorkerGlobalScope;

interface RendererState {
  canvas: OffscreenCanvas;
  renderer: EditorRenderer;
  colorspace: "srgb" | "display-p3";
  fullImage: ImageBitmap;
  /** Optional downsampled bitmap. When set, `set-active-level` can flip
   *  between this and `fullImage` without re-init. */
  proxyImage: ImageBitmap | null;
  activeLevel: ImageLevel;
}

let state: RendererState | null = null;
const inflight = new Map<string, AbortController>();

/**
 * Serialized handler chain. Each incoming request waits for the previous
 * to finish before starting. Critical for correctness now that handlers
 * are async + can yield mid-execution: without serialization, two pipelines
 * would interleave their GL calls against the shared mini-gl renderer state.
 */
let handlerChain: Promise<void> = Promise.resolve();

/**
 * Yields to the worker's macrotask queue so any pending messages (like a
 * `cancel` we just received) get a chance to run. We use `MessageChannel`
 * instead of `setTimeout(0)` because the HTML spec clamps setTimeout to a
 * 4ms minimum delay even at zero — MessageChannel is "next tick, no delay".
 */
function yieldEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === "cancel") {
    inflight.get(req.reqId)?.abort();
    return;
  }
  if (req.type === "set-debug-pattern") {
    setLoggerPattern(req.pattern);
    log("pattern set:", req.pattern || "(empty)");
    return;
  }
  // Chain so handlers run sequentially. Catch any handler-level rejection
  // (handle() should already convert to error responses, this is belt-and-
  // suspenders so a thrown handler doesn't poison the chain).
  handlerChain = handlerChain.then(() => handle(req)).catch((err) => {
    console.warn("[photocn/worker] handler chain caught:", err);
  });
});

async function handle(
  req: Exclude<
    WorkerRequest,
    { type: "cancel" } | { type: "set-debug-pattern" }
  >,
) {
  const controller = new AbortController();
  inflight.set(req.reqId, controller);
  const signal = controller.signal;

  try {
    switch (req.type) {
      case "init":
        post(initRenderer(req));
        break;
      case "loadImage":
        post(loadImage(req));
        break;
      case "set-active-level":
        post(setActiveLevel(req));
        break;
      case "rebuild-proxy":
        post(rebuildProxy(req));
        break;
      case "applyOps":
        post(await applyOps(req, signal));
        break;
      case "readPixels":
        post(readPixels(req));
        break;
      case "resize":
        post(resize(req));
        break;
      case "exportBlob":
        post(await exportBlob(req, signal));
        break;
      case "dispose":
        post(dispose(req));
        break;
    }
  } catch (err) {
    if (isAbortError(err)) {
      post({ type: "aborted", reqId: req.reqId });
    } else {
      post(toErrorResponse(req.reqId, err));
    }
  } finally {
    inflight.delete(req.reqId);
  }
}

function checkpoint(signal: AbortSignal): void {
  if (signal.aborted) throw makeAbortError();
}

function initRenderer(req: InitRequest): WorkerResponse {
  const renderer = createMiniGl(
    req.canvas as unknown as HTMLCanvasElement,
    req.image,
    req.colorspace,
  ) as unknown as EditorRenderer | undefined;
  if (!renderer) {
    throw new Error("webgl2 not available in worker context");
  }
  state = {
    canvas: req.canvas,
    renderer,
    colorspace: req.colorspace,
    fullImage: req.image,
    proxyImage: req.proxy ?? null,
    activeLevel: "full",
  };
  return {
    type: "ok",
    reqId: req.reqId,
    size: { width: renderer.width, height: renderer.height },
  };
}

function loadImage(req: LoadImageRequest): WorkerResponse {
  const s = requireState();
  // Replace the full-res image. The proxy is invalidated — bridge will
  // re-supply one via init or a follow-up set-active-level swap.
  s.fullImage.close?.();
  s.fullImage = req.image;
  s.activeLevel = "full";
  s.proxyImage?.close?.();
  s.proxyImage = null;
  (s.renderer as unknown as {
    setSource: (img: ImageBitmap) => void;
  }).setSource(req.image);
  return {
    type: "ok",
    reqId: req.reqId,
    size: { width: s.renderer.width, height: s.renderer.height },
  };
}

function setActiveLevel(req: SetActiveLevelRequest): WorkerResponse {
  const s = requireState();
  if (req.level === "proxy" && !s.proxyImage) {
    // No proxy was provided at init — silently stay at full.
    if (logLevel.enabled) logLevel("set-active-level: no proxy, staying at full");
    return {
      type: "ok",
      reqId: req.reqId,
      size: { width: s.renderer.width, height: s.renderer.height },
    };
  }
  if (req.level === s.activeLevel) {
    return {
      type: "ok",
      reqId: req.reqId,
      size: { width: s.renderer.width, height: s.renderer.height },
    };
  }
  const next = req.level === "proxy" ? s.proxyImage! : s.fullImage;
  const t = performance.now();
  // Critical: must use setSource (not just `img =` + loadImage). The latter
  // only updates a metadata field; the actual GL imageTexture stays at the
  // originally-uploaded pixels and the canvas/FBOs are sized to the original
  // bitmap. setSource re-uploads imageTexture, resizes canvas + FBOs, and
  // resets the filter ping-pong state.
  (s.renderer as unknown as {
    setSource: (img: ImageBitmap) => void;
  }).setSource(next);
  s.activeLevel = req.level;
  if (logLevel.enabled) {
    logLevel(
      `level=${req.level}`,
      `dim=${s.renderer.width}x${s.renderer.height}`,
      `swap=${(performance.now() - t).toFixed(1)}ms`,
    );
  }
  return {
    type: "ok",
    reqId: req.reqId,
    size: { width: s.renderer.width, height: s.renderer.height },
  };
}

/**
 * Rebuilds the proxy bitmap from the worker's full-res source. Cheap
 * (one OffscreenCanvas drawImage + transferToImageBitmap) and avoids
 * shipping the source back to main. If the requested maxDim is 0 or larger
 * than the source's long edge, the proxy is dropped.
 *
 * If the worker is currently rendering against the (stale) old proxy, also
 * rebinds the texture so the next paint uses the new proxy.
 */
function rebuildProxy(req: RebuildProxyRequest): WorkerResponse {
  const s = requireState();
  const dropProxy = (): WorkerResponse => {
    s.proxyImage?.close?.();
    s.proxyImage = null;
    if (s.activeLevel === "proxy") {
      (s.renderer as unknown as {
        setSource: (img: ImageBitmap) => void;
      }).setSource(s.fullImage);
      s.activeLevel = "full";
    }
    return { type: "ok", reqId: req.reqId, proxySize: null };
  };

  if (req.maxDim <= 0) return dropProxy();

  const fullLong = Math.max(s.fullImage.width, s.fullImage.height);
  if (req.maxDim >= fullLong) return dropProxy();

  const scale = req.maxDim / fullLong;
  const w = Math.max(1, Math.round(s.fullImage.width * scale));
  const h = Math.max(1, Math.round(s.fullImage.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { colorSpace: s.colorspace });
  if (!ctx) {
    throw new Error("rebuild-proxy: unable to get 2d context");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(s.fullImage, 0, 0, w, h);
  const newProxy = canvas.transferToImageBitmap();

  s.proxyImage?.close?.();
  s.proxyImage = newProxy;

  // If currently rendering against the (now-stale) proxy, swap the bound
  // source to the newly-built one. setSource re-uploads + resizes FBOs.
  if (s.activeLevel === "proxy") {
    (s.renderer as unknown as {
      setSource: (img: ImageBitmap) => void;
    }).setSource(newProxy);
  }

  return {
    type: "ok",
    reqId: req.reqId,
    proxySize: { width: newProxy.width, height: newProxy.height },
  };
}

async function applyOps(
  req: ApplyOpsRequest,
  signal: AbortSignal,
): Promise<WorkerResponse> {
  const s = requireState();
  checkpoint(signal);

  const total = performance.now();

  // Slot transferred bitmaps back into their op args by walking the path.
  // First arg of path indexes into args[]; subsequent arg into nested
  // objects/arrays. Lets us address e.g. `args[0].map1` inside a filterInsta
  // op without re-serializing the parent FilterOption.
  const ops = req.ops.map((op) => ({ name: op.name, args: [...op.args] }));
  for (const slot of req.bitmaps ?? []) {
    const op = ops[slot.opIndex];
    if (!op || slot.path.length === 0) continue;
    let target: unknown = op.args;
    for (let i = 0; i < slot.path.length - 1; i++) {
      target = (target as Record<string | number, unknown>)[slot.path[i]!];
      if (target == null) break;
    }
    if (target != null) {
      (target as Record<string | number, unknown>)[
        slot.path[slot.path.length - 1]!
      ] = slot.bitmap;
    }
  }

  // Replay each op. Cancellation is checked after every op so a long chain
  // bails between filter passes.
  const r = s.renderer as unknown as Record<string, (...args: unknown[]) => unknown>;
  const tReplay = performance.now();
  for (const op of ops) {
    const fn = r[op.name];
    if (typeof fn !== "function") {
      throw new Error(`unknown renderer op: ${op.name}`);
    }
    fn.apply(r, op.args);
    checkpoint(signal);
  }
  const replayMs = performance.now() - tReplay;

  // Yield between phases so any queued `cancel` for this reqId gets a chance
  // to set `signal.aborted`. Without these, a 100ms+ applyOps blocks the
  // worker's message queue end-to-end and cancellation can't pre-empt.
  await yieldEventLoop();
  checkpoint(signal);

  // We only do a GPU readback if a downstream consumer needs the bytes:
  // either the histogram pass below, or the explicit `returnPixels` flag.
  const needsPixels = req.histogram?.enabled || req.returnPixels;
  let pixels: Uint8Array | undefined;
  let readMs = 0;
  if (needsPixels) {
    const tRead = performance.now();
    pixels = s.renderer.readPixels();
    readMs = performance.now() - tRead;
  }

  await yieldEventLoop();
  checkpoint(signal);

  let histogram;
  let histMs = 0;
  if (req.histogram?.enabled && pixels) {
    const tHist = performance.now();
    histogram = calculateRgbHistogram(
      pixels,
      // Downsample the histogram aggressively on the hot path. A 4K image
      // → ~33M samples even at stride=8, plenty for a 256-bucket histogram
      // and 64× faster than the full pass. Caller can override.
      { stride: 8, ...req.histogram.options },
      createRgbHistogram(),
    );
    histMs = performance.now() - tHist;
    checkpoint(signal);
  }

  const totalMs = performance.now() - total;
  if (logApply.enabled) {
    logApply(
      `ops=${ops.length}`,
      `bytes=${pixels?.byteLength ?? 0}`,
      `replay=${replayMs.toFixed(1)}ms`,
      `read=${readMs.toFixed(1)}ms`,
      `hist=${histMs.toFixed(1)}ms`,
      `total=${totalMs.toFixed(1)}ms`,
    );
  }

  return {
    type: "ok",
    reqId: req.reqId,
    // Only ship pixels back when explicitly asked. Saves a ~bytes-of-image
    // transfer per paint, which on 4K+ images was the dominant cost for
    // the bridge's `readPixels()`-cache path that nobody actually reads
    // anymore (histogram comes pre-computed, export uses exportBlob).
    pixels: req.returnPixels ? pixels : undefined,
    histogram,
    timing: {
      replayMs,
      readMs,
      histMs,
      totalMs,
      opCount: ops.length,
    },
    level: s.activeLevel,
  };
}

async function exportBlob(
  req: ExportBlobRequest,
  signal: AbortSignal,
): Promise<WorkerResponse> {
  const s = requireState();
  checkpoint(signal);
  // OffscreenCanvas.convertToBlob runs encoding off the main thread.
  // The renderer's offscreen canvas is in its post-pipeline state, so this
  // captures whatever the user currently sees — no re-render required.
  const t = performance.now();
  const blob = await s.canvas.convertToBlob({
    type: req.format,
    quality: req.quality,
  });
  checkpoint(signal);
  if (logExport.enabled) {
    logExport(
      `format=${req.format}`,
      `bytes=${blob.size}`,
      `encode=${(performance.now() - t).toFixed(1)}ms`,
    );
  }
  return {
    type: "ok",
    reqId: req.reqId,
    blob,
    size: { width: s.renderer.width, height: s.renderer.height },
  };
}

function readPixels(req: ReadPixelsRequest): WorkerResponse {
  const s = requireState();
  return { type: "ok", reqId: req.reqId, pixels: s.renderer.readPixels() };
}

function resize(req: ResizeRequest): WorkerResponse {
  const s = requireState();
  const r = s.renderer as unknown as {
    resize?: (w: number, h: number) => void;
  };
  r.resize?.(req.width, req.height);
  return {
    type: "ok",
    reqId: req.reqId,
    size: { width: s.renderer.width, height: s.renderer.height },
  };
}

function dispose(req: DisposeRequest): WorkerResponse {
  if (state) {
    (state.renderer as unknown as { destroy?: () => void }).destroy?.();
    state.fullImage.close?.();
    state.proxyImage?.close?.();
    state = null;
  }
  return { type: "ok", reqId: req.reqId };
}

function requireState(): RendererState {
  if (!state) throw new Error("editor worker not initialized");
  return state;
}

function post(res: WorkerResponse): void {
  const transfer: Transferable[] = [];
  if ("pixels" in res && res.pixels) {
    transfer.push(res.pixels.buffer as ArrayBuffer);
  }
  if ("histogram" in res && res.histogram) {
    transfer.push(
      res.histogram.red.buffer as ArrayBuffer,
      res.histogram.green.buffer as ArrayBuffer,
      res.histogram.blue.buffer as ArrayBuffer,
    );
  }
  self.postMessage(res, transfer);
}

function toErrorResponse(reqId: string, err: unknown): WorkerResponse {
  const e = err as { name?: string; message?: string; stack?: string };
  return {
    type: "error",
    reqId,
    error: {
      name: e?.name ?? "Error",
      message: e?.message ?? String(err),
      stack: e?.stack,
    },
  };
}
