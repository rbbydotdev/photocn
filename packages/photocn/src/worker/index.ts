import type { CreateMiniGlEditor, ExclusiveCanvasFactory, MiniGlEditorInstance } from "../hooks";
import type { MiniGlRenderer } from "../dom";

import { createWorkerEditor, type WorkerEditor } from "./bridge";

// The typed `CreateMiniGlEditor` defaults to TRenderer = EditorRenderer, but
// useMiniPhotoEditor instantiates it with TRenderer = MiniGlRenderer. The
// proxy implements the full MiniGlRenderer surface (incl. `captureImage`),
// so we widen the factory's return type accordingly.
type WorkerCreateMiniGlEditor = CreateMiniGlEditor<
  MiniGlRenderer,
  MiniGlEditorInstance<MiniGlRenderer>
>;

const preserveSourceColor: ImageBitmapOptions = { colorSpaceConversion: "none" };

export { createWorkerEditor } from "./bridge";
export type {
  WorkerEditor,
  CreateWorkerEditorOptions,
  BridgeConfig,
  BridgeStats,
  ExportBlobOptions,
  ExportBlobResult,
} from "./bridge";
export type {
  WorkerRequest,
  WorkerResponse,
  RendererOp,
  ColorSpace,
} from "./protocol";

/**
 * Resolver that decides how big the proxy should be for a given image +
 * canvas. Return `0` to skip the proxy entirely.
 *
 * Default: long edge of canvas client size × devicePixelRatio × 1.2 slack.
 * Capped to never exceed the image's own long edge (no point upscaling).
 * Floored at 600px so tiny canvases still get a usable proxy.
 *
 * Why DPR-aware: a 4K display rendering a 1500px CSS canvas actually shows
 * 3000 device pixels — a 1500-long-edge proxy would be visibly soft. With
 * DPR=2 we target 3000-long-edge proxies on 1500 CSS canvases.
 */
export type ProxyMaxDimResolver = (input: {
  image: ImageBitmap;
  canvas: HTMLCanvasElement;
}) => number;

const defaultProxyMaxDim: ProxyMaxDimResolver = ({ image, canvas }) => {
  const dpr =
    typeof window !== "undefined" && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1;
  // Measure the canvas's container too: right after mount the canvas itself
  // can still have its default 300×150 size, which made the proxy far
  // smaller than the screen and the live preview soft.
  const host = canvas.parentElement;
  const cssLong = Math.max(
    canvas.clientWidth,
    canvas.clientHeight,
    host?.clientWidth ?? 0,
    host?.clientHeight ?? 0,
    1,
  );
  const target = Math.round(cssLong * dpr * 1.2);
  const imageLong = Math.max(image.width, image.height);
  // Floor 600 keeps proxy useful on small/hidden canvases (e.g. mid-mount,
  // before layout fires); cap at imageLong so we never request a "proxy"
  // bigger than the source.
  return Math.min(imageLong, Math.max(600, target));
};

/**
 * Builds a `createEditor` factory matching `useMiniGlEditor`'s contract,
 * backed by a Web Worker. Pass the Worker constructor as `spawn` so the
 * caller controls bundling (Vite's `new Worker(new URL(...), { type: "module" })`
 * pattern, or a different bundler's equivalent).
 *
 * Proxy/level swap: by default the factory builds a downsampled `ImageBitmap`
 * sized for the visible canvas (DPR-aware) and ships it alongside the full
 * image. The bridge renders against the proxy during interaction and swaps
 * to full after `idleSwapMs` idle. Override `proxyMaxDim` to:
 *   - `0` — disable
 *   - `number` — force a fixed long-edge cap (e.g. `1500`)
 *   - `(image, canvas) => number` — custom heuristic
 */
export function createWorkerMiniGlEditorFactory(opts: {
  spawn: () => Worker;
  /** Long-edge cap for the proxy bitmap. See `ProxyMaxDimResolver` for details. */
  proxyMaxDim?: number | ProxyMaxDimResolver;
  /** ms of idle before swapping back to full-res. Default 200. */
  idleSwapMs?: number;
  onHistogram?: Parameters<typeof createWorkerEditor>[0]["onHistogram"];
  onPaint?: Parameters<typeof createWorkerEditor>[0]["onPaint"];
}): WorkerCreateMiniGlEditor {
  const proxyResolver: ProxyMaxDimResolver =
    typeof opts.proxyMaxDim === "function"
      ? opts.proxyMaxDim
      : typeof opts.proxyMaxDim === "number"
        ? () => opts.proxyMaxDim as number
        : defaultProxyMaxDim;
  const factory: WorkerCreateMiniGlEditor & ExclusiveCanvasFactory = async ({
    canvas,
    image,
    colorspace,
  }) => {
    const resolvedColorspace = (colorspace ?? "srgb") as "srgb" | "display-p3";
    const bitmap = await coerceImageBitmap(image);
    const maxDim = proxyResolver({ image: bitmap, canvas });
    const proxy =
      maxDim > 0
        ? await buildProxyBitmap(bitmap, maxDim, resolvedColorspace)
        : undefined;
    const editor: WorkerEditor = await createWorkerEditor({
      worker: opts.spawn(),
      canvas,
      image: bitmap,
      proxy: proxy ?? undefined,
      idleSwapMs: opts.idleSwapMs,
      colorspace: resolvedColorspace,
      onHistogram: opts.onHistogram,
      onPaint: opts.onPaint,
    });
    const instance: MiniGlEditorInstance<MiniGlRenderer> = {
      renderer: editor.renderer as unknown as MiniGlRenderer,
      dispose: () => editor.dispose(),
    };
    // Caller may want loadImage/resize directly; expose by attaching.
    (instance as unknown as { worker: WorkerEditor }).worker = editor;
    return instance;
  };
  // transferControlToOffscreen is one-shot: each editor needs its own canvas.
  factory.exclusiveCanvas = true;
  return factory;
}

/**
 * Build a downsampled `ImageBitmap` whose long edge is at most `maxDim`.
 * Returns `null` (no proxy) if the source is already at or below `maxDim`
 * — no point rendering against a proxy that's the same size as the original.
 *
 * Uses `OffscreenCanvas` for the downscale + `transferToImageBitmap()` so
 * the resulting bitmap is transferable across the worker boundary zero-copy.
 * `imageSmoothingQuality: "high"` gives a Lanczos-quality bicubic in modern
 * browsers — the proxy will visually match the full image at fit-to-screen.
 */
async function buildProxyBitmap(
  source: ImageBitmap,
  maxDim: number,
  colorspace: "srgb" | "display-p3",
): Promise<ImageBitmap | null> {
  const longEdge = Math.max(source.width, source.height);
  if (longEdge <= maxDim) return null;
  const scale = maxDim / longEdge;
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  if (typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { colorSpace: colorspace });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.transferToImageBitmap();
}

async function coerceImageBitmap(
  image: unknown,
): Promise<ImageBitmap> {
  if (image instanceof ImageBitmap) return image;
  if (
    image instanceof ImageData ||
    image instanceof HTMLImageElement ||
    image instanceof HTMLCanvasElement ||
    (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas) ||
    image instanceof Blob
  ) {
    return createImageBitmap(image as ImageBitmapSource, preserveSourceColor);
  }
  throw new TypeError(
    `[photocn/worker] cannot convert image of type ${(image as object | null)?.constructor?.name ?? typeof image} to ImageBitmap`,
  );
}
