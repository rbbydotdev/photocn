// The worker is pre-bundled at build time into a single classic-script string
// (see tsup.config.ts) so consumers need zero bundler configuration.
import workerSource from "./editor.worker.ts?inline-worker";

let workerUrl: string | null = null;

/**
 * Spawn the render worker from an inlined Blob URL. Works in every bundler;
 * requires `worker-src blob:` if you ship a strict Content-Security-Policy.
 * Otherwise pass your own `spawnWorker` using `photocn/worker/entry`.
 */
export function spawnInlineWorker(): Worker {
  if (!workerUrl) {
    workerUrl = URL.createObjectURL(
      new Blob([workerSource], { type: "text/javascript" }),
    );
  }
  return new Worker(workerUrl, { name: "photocn-render" });
}

/** True when the browser can render in a worker (OffscreenCanvas transfer). */
export function supportsWorkerRendering(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype
  );
}
