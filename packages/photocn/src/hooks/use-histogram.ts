import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  calculateRgbHistogram,
  createHistogramRenderer,
  createRgbHistogram,
  drawRgbHistogram,
  type CalculateRgbHistogramOptions,
  type CreateHistogramRendererOptions,
  type HistogramPixelSource,
  type HistogramRenderer,
  type HistogramRenderingContext,
  type RgbHistogram,
} from "../dom";

import { useLatestRef } from "./use-latest-ref";

export type HistogramStatus = "idle" | "drawing" | "drawn" | "error";

export interface UseHistogramOptions
  extends Omit<CreateHistogramRendererOptions, "canvas" | "context"> {
  canvas?: HTMLCanvasElement | OffscreenCanvas | null;
  context?: HistogramRenderingContext | null;
  pixels?: HistogramPixelSource | null;
  image?: CanvasImageSource | null;
  /**
   * Pre-computed histogram (e.g. from a worker). When set, takes priority
   * over `pixels`/`image`: stored as state and drawn directly via
   * `drawRgbHistogram` — no recalculation. Pass `null` to clear.
   */
  precomputed?: RgbHistogram | null;
  autoDraw?: boolean;
  onDraw?: (histogram: RgbHistogram, renderer: HistogramRenderer | null) => void;
  onError?: (error: unknown) => void;
}

export interface UseHistogramResult {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  histogram: RgbHistogram;
  renderer: HistogramRenderer | null;
  status: HistogramStatus;
  error: unknown;
  isDrawing: boolean;
  calculate: (
    pixels: HistogramPixelSource,
    options?: CalculateRgbHistogramOptions,
  ) => RgbHistogram;
  draw: (pixels: HistogramPixelSource) => RgbHistogram;
  drawImage: (image: CanvasImageSource) => RgbHistogram;
  clear: () => void;
  reset: () => void;
}

export function useHistogram({
  canvas,
  context,
  pixels,
  image,
  precomputed,
  autoDraw = pixels !== undefined || image !== undefined || precomputed !== undefined,
  onDraw,
  onError,
  ...rendererOptions
}: UseHistogramOptions = {}): UseHistogramResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HistogramRenderer | null>(null);
  const onDrawRef = useLatestRef(onDraw);
  const onErrorRef = useLatestRef(onError);
  const rendererOptionsRef = useLatestRef(rendererOptions);
  const [histogram, setHistogram] = useState<RgbHistogram>(() =>
    createRgbHistogram(),
  );
  const [renderer, setRenderer] = useState<HistogramRenderer | null>(null);
  const [status, setStatus] = useState<HistogramStatus>("idle");
  const [error, setError] = useState<unknown>(null);

  const getRenderer = useCallback(() => {
    const nextRenderer = createHistogramRenderer({
      ...rendererOptionsRef.current,
      canvas: canvas ?? canvasRef.current ?? undefined,
      context: context ?? undefined,
    });
    rendererRef.current = nextRenderer;
    setRenderer(nextRenderer);
    return nextRenderer;
  }, [canvas, context]);

  const runDraw = useCallback(
    (
      compute: () => {
        histogram: RgbHistogram;
        stored: RgbHistogram;
        renderer: HistogramRenderer | null;
      },
    ) => {
      setStatus("drawing");
      setError(null);

      try {
        const { histogram: nextHistogram, stored, renderer: drawnRenderer } = compute();
        setHistogram(stored);
        setStatus("drawn");
        onDrawRef.current?.(nextHistogram, drawnRenderer);
        return nextHistogram;
      } catch (nextError) {
        setError(nextError);
        setStatus("error");
        onErrorRef.current?.(nextError);
        throw nextError;
      }
    },
    [],
  );

  const calculate = useCallback(
    (
      nextPixels: HistogramPixelSource,
      options: CalculateRgbHistogramOptions = rendererOptionsRef.current.histogram ?? {},
    ) =>
      runDraw(() => {
        const next = calculateRgbHistogram(nextPixels, options, createRgbHistogram());
        return { histogram: next, stored: next, renderer: rendererRef.current };
      }),
    [runDraw],
  );

  const draw = useCallback(
    (nextPixels: HistogramPixelSource) =>
      runDraw(() => {
        const nextRenderer = getRenderer();
        const next = nextRenderer.draw(nextPixels);
        return {
          histogram: next,
          stored: cloneRgbHistogram(next),
          renderer: nextRenderer,
        };
      }),
    [getRenderer, runDraw],
  );

  const drawImage = useCallback(
    (nextImage: CanvasImageSource) =>
      runDraw(() => {
        const nextRenderer = getRenderer();
        const next = nextRenderer.drawImage(nextImage);
        return {
          histogram: next,
          stored: cloneRgbHistogram(next),
          renderer: nextRenderer,
        };
      }),
    [getRenderer, runDraw],
  );

  const clear = useCallback(() => {
    rendererRef.current?.clear();
  }, []);

  const reset = useCallback(() => {
    rendererRef.current?.clear();
    setHistogram(createRgbHistogram());
    setStatus("idle");
    setError(null);
  }, []);

  const drawPrecomputed = useCallback(
    (next: RgbHistogram) => {
      const nextRenderer = getRenderer();
      drawRgbHistogram(
        nextRenderer.context,
        next,
        rendererOptionsRef.current.draw,
      );
      setHistogram(cloneRgbHistogram(next));
      setStatus("drawn");
      onDrawRef.current?.(next, nextRenderer);
    },
    [getRenderer],
  );

  useEffect(() => {
    if (!autoDraw) return;

    if (precomputed === null) {
      reset();
      return;
    }

    if (precomputed !== undefined) {
      drawPrecomputed(precomputed);
      return;
    }

    if (pixels === null || image === null) {
      reset();
      return;
    }

    if (pixels !== undefined) {
      draw(pixels);
      return;
    }

    if (image !== undefined) {
      drawImage(image);
    }
    // Intentional: draw/drawImage/reset are stable — passing a new pixels/image
    // is the only signal that should re-fire this. Including the callbacks in
    // the dep array would cause a draw on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraw, image, pixels, precomputed]);

  return {
    canvasRef,
    histogram,
    renderer,
    status,
    error,
    isDrawing: status === "drawing",
    calculate,
    draw,
    drawImage,
    clear,
    reset,
  };
}

function cloneRgbHistogram(histogram: RgbHistogram): RgbHistogram {
  return {
    red: new Uint32Array(histogram.red),
    green: new Uint32Array(histogram.green),
    blue: new Uint32Array(histogram.blue),
    max: { ...histogram.max },
    pixels: histogram.pixels,
  };
}
