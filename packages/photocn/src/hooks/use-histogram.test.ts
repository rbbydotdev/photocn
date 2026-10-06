import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the browser package boundary. The real package barrel pulls in
// mini-gl/mini-exif and a WASM module, none of which load under happy-dom; we
// only need identifiable stubs to assert call wiring.
vi.mock("../dom", () => {
  function createRgbHistogram() {
    return {
      red: new Uint32Array(256),
      green: new Uint32Array(256),
      blue: new Uint32Array(256),
      max: { red: 0, green: 0, blue: 0 },
      pixels: 0,
    };
  }
  return {
    createRgbHistogram: vi.fn(createRgbHistogram),
    calculateRgbHistogram: vi.fn(
      (
        _source: unknown,
        _options: unknown,
        target: ReturnType<typeof createRgbHistogram>,
      ) => {
        // Mark the histogram so tests can spot the calculate path.
        target.pixels = 42;
        target.max.red = 7;
        return target;
      },
    ),
    createHistogramRenderer: vi.fn(),
  };
});

// Imported after the mock is registered so the hook picks up the stubs.
import {
  calculateRgbHistogram,
  createHistogramRenderer,
  createRgbHistogram,
  type HistogramRenderer,
  type RgbHistogram,
} from "../dom";

import { useHistogram } from "./use-histogram";

const calculateMock = vi.mocked(calculateRgbHistogram);
const createRendererMock = vi.mocked(createHistogramRenderer);
const createRgbHistogramMock = vi.mocked(createRgbHistogram);

interface StubHistogramRenderer extends HistogramRenderer {
  draw: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

function makeFilledHistogram(label: number): RgbHistogram {
  const red = new Uint32Array(256);
  red[0] = label;
  const green = new Uint32Array(256);
  green[0] = label + 1;
  const blue = new Uint32Array(256);
  blue[0] = label + 2;
  return {
    red,
    green,
    blue,
    max: { red: label, green: label + 1, blue: label + 2 },
    pixels: label * 10,
  };
}

function createStubRenderer(histogram: RgbHistogram): StubHistogramRenderer {
  return {
    canvas: {} as HTMLCanvasElement,
    context: {} as CanvasRenderingContext2D,
    draw: vi.fn(() => histogram),
    drawImage: vi.fn(() => histogram),
    clear: vi.fn(),
  } as unknown as StubHistogramRenderer;
}

beforeEach(() => {
  calculateMock.mockClear();
  createRendererMock.mockReset();
  createRgbHistogramMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHistogram", () => {
  describe("initial state", () => {
    it("starts idle with the empty histogram from createRgbHistogram and no renderer", () => {
      const { result } = renderHook(() => useHistogram());

      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.isDrawing).toBe(false);
      expect(result.current.renderer).toBeNull();
      expect(result.current.histogram.red).toBeInstanceOf(Uint32Array);
      expect(result.current.histogram.red.length).toBe(256);
      expect(result.current.histogram.pixels).toBe(0);
      expect(result.current.histogram.max).toEqual({ red: 0, green: 0, blue: 0 });
    });
  });

  describe("calculate", () => {
    it("calls calculateRgbHistogram, transitions drawing → drawn, returns histogram, calls onDraw", () => {
      const onDraw = vi.fn();
      const pixels = new Uint8ClampedArray(16);
      const { result } = renderHook(() => useHistogram({ onDraw }));

      let returned: RgbHistogram | undefined;
      act(() => {
        returned = result.current.calculate(pixels);
      });

      expect(calculateMock).toHaveBeenCalledTimes(1);
      // Pixels in, options object, and a fresh target histogram.
      expect(calculateMock).toHaveBeenCalledWith(
        pixels,
        expect.any(Object),
        expect.objectContaining({ red: expect.any(Uint32Array) }),
      );
      expect(returned).toBeDefined();
      expect(returned!.pixels).toBe(42);
      expect(result.current.histogram).toBe(returned);
      expect(result.current.status).toBe("drawn");
      expect(result.current.isDrawing).toBe(false);
      expect(onDraw).toHaveBeenCalledTimes(1);
      // No renderer was created via calculate; renderer arg is null.
      expect(onDraw).toHaveBeenCalledWith(returned, null);
    });

    it("forwards explicit options to calculateRgbHistogram", () => {
      const { result } = renderHook(() => useHistogram());

      act(() => {
        result.current.calculate(new Uint8ClampedArray(4), {
          minValue: 5,
          maxValue: 250,
          alphaThreshold: 100,
        });
      });

      expect(calculateMock).toHaveBeenCalledWith(
        expect.any(Uint8ClampedArray),
        expect.objectContaining({
          minValue: 5,
          maxValue: 250,
          alphaThreshold: 100,
        }),
        expect.any(Object),
      );
    });

    it("propagates errors: status=error, onError fires, error is rethrown", () => {
      const failure = new Error("calc-boom");
      calculateMock.mockImplementationOnce(() => {
        throw failure;
      });
      const onError = vi.fn();
      const { result } = renderHook(() => useHistogram({ onError }));

      let caught: unknown;
      act(() => {
        try {
          result.current.calculate(new Uint8ClampedArray(4));
        } catch (error) {
          caught = error;
        }
      });

      expect(caught).toBe(failure);
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe(failure);
      expect(onError).toHaveBeenCalledWith(failure);
    });
  });

  describe("draw", () => {
    it("creates renderer via createHistogramRenderer and forwards pixels to renderer.draw", () => {
      const drawn = makeFilledHistogram(10);
      const renderer = createStubRenderer(drawn);
      createRendererMock.mockReturnValue(renderer);

      const onDraw = vi.fn();
      const pixels = new Uint8ClampedArray(8);
      const { result } = renderHook(() => useHistogram({ onDraw }));

      let returned: RgbHistogram | undefined;
      act(() => {
        returned = result.current.draw(pixels);
      });

      expect(createRendererMock).toHaveBeenCalledTimes(1);
      expect(renderer.draw).toHaveBeenCalledTimes(1);
      expect(renderer.draw).toHaveBeenCalledWith(pixels);
      expect(returned).toBe(drawn);
      expect(result.current.status).toBe("drawn");
      expect(result.current.renderer).toBe(renderer);
      expect(onDraw).toHaveBeenCalledWith(drawn, renderer);
    });

    it("clones the histogram for state — mutating renderer output does not affect hook state", () => {
      const drawn = makeFilledHistogram(5);
      const renderer = createStubRenderer(drawn);
      createRendererMock.mockReturnValue(renderer);

      const { result } = renderHook(() => useHistogram());

      act(() => {
        result.current.draw(new Uint8ClampedArray(4));
      });

      const before = result.current.histogram.red[0];
      // Mutate the renderer's source histogram after the fact.
      drawn.red[0] = 9999;
      drawn.max.red = 9999;
      drawn.pixels = 9999;
      // Hook's snapshot is independent of the renderer's mutable buffer.
      expect(result.current.histogram.red[0]).toBe(before);
      expect(result.current.histogram.red).not.toBe(drawn.red);
      expect(result.current.histogram.max).not.toBe(drawn.max);
    });
  });

  describe("drawImage", () => {
    it("forwards the image through to renderer.drawImage", () => {
      const drawn = makeFilledHistogram(20);
      const renderer = createStubRenderer(drawn);
      createRendererMock.mockReturnValue(renderer);

      const fakeImage = { width: 1, height: 1 } as unknown as CanvasImageSource;
      const onDraw = vi.fn();
      const { result } = renderHook(() => useHistogram({ onDraw }));

      act(() => {
        result.current.drawImage(fakeImage);
      });

      expect(renderer.drawImage).toHaveBeenCalledTimes(1);
      expect(renderer.drawImage).toHaveBeenCalledWith(fakeImage);
      expect(result.current.status).toBe("drawn");
      expect(onDraw).toHaveBeenCalledWith(drawn, renderer);
    });
  });

  describe("clear / reset", () => {
    it("clear() forwards to the active renderer", () => {
      const renderer = createStubRenderer(makeFilledHistogram(1));
      createRendererMock.mockReturnValue(renderer);

      const { result } = renderHook(() => useHistogram());
      act(() => {
        result.current.draw(new Uint8ClampedArray(4));
      });

      act(() => {
        result.current.clear();
      });

      expect(renderer.clear).toHaveBeenCalledTimes(1);
    });

    it("clear() is a no-op when no renderer has been created (status untouched)", () => {
      const { result } = renderHook(() => useHistogram());
      const statusBefore = result.current.status;

      act(() => {
        result.current.clear();
      });

      // Nothing to call; no renderer was ever created.
      expect(createRendererMock).not.toHaveBeenCalled();
      expect(result.current.status).toBe(statusBefore);
    });

    it("reset() restores empty histogram, idle status, and clears the renderer", () => {
      const renderer = createStubRenderer(makeFilledHistogram(2));
      createRendererMock.mockReturnValue(renderer);

      const { result } = renderHook(() => useHistogram());
      act(() => {
        result.current.draw(new Uint8ClampedArray(4));
      });
      expect(result.current.status).toBe("drawn");

      act(() => {
        result.current.reset();
      });

      expect(renderer.clear).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.histogram.pixels).toBe(0);
      expect(result.current.histogram.max).toEqual({ red: 0, green: 0, blue: 0 });
    });
  });

  describe("autoDraw", () => {
    it("passing pixels prop triggers draw automatically", async () => {
      const drawn = makeFilledHistogram(30);
      const renderer = createStubRenderer(drawn);
      createRendererMock.mockReturnValue(renderer);

      const pixels = new Uint8ClampedArray(4);
      const { result } = renderHook(() => useHistogram({ pixels }));

      await waitFor(() => {
        expect(renderer.draw).toHaveBeenCalledTimes(1);
      });
      expect(renderer.draw).toHaveBeenCalledWith(pixels);
      expect(result.current.status).toBe("drawn");
    });

    it("passing image prop triggers drawImage automatically", async () => {
      const drawn = makeFilledHistogram(40);
      const renderer = createStubRenderer(drawn);
      createRendererMock.mockReturnValue(renderer);

      const image = { width: 1, height: 1 } as unknown as CanvasImageSource;
      const { result } = renderHook(() => useHistogram({ image }));

      await waitFor(() => {
        expect(renderer.drawImage).toHaveBeenCalledTimes(1);
      });
      expect(renderer.drawImage).toHaveBeenCalledWith(image);
      expect(result.current.status).toBe("drawn");
    });

    it("passing pixels=null triggers reset (status returns to idle)", async () => {
      const drawn = makeFilledHistogram(50);
      const renderer = createStubRenderer(drawn);
      createRendererMock.mockReturnValue(renderer);

      const { result, rerender } = renderHook(
        ({ pixels }: { pixels: Uint8ClampedArray | null }) =>
          useHistogram({ pixels }),
        { initialProps: { pixels: new Uint8ClampedArray(4) as Uint8ClampedArray | null } },
      );

      await waitFor(() => {
        expect(result.current.status).toBe("drawn");
      });

      rerender({ pixels: null });

      await waitFor(() => {
        expect(result.current.status).toBe("idle");
      });
      expect(result.current.histogram.pixels).toBe(0);
    });

    it("autoDraw=false suppresses auto-draw on pixels prop", async () => {
      const renderer = createStubRenderer(makeFilledHistogram(60));
      createRendererMock.mockReturnValue(renderer);

      const pixels = new Uint8ClampedArray(4);
      const { result } = renderHook(() =>
        useHistogram({ pixels, autoDraw: false }),
      );

      // Wait long enough for any effect to settle.
      await Promise.resolve();
      expect(renderer.draw).not.toHaveBeenCalled();
      expect(createRendererMock).not.toHaveBeenCalled();
      expect(result.current.status).toBe("idle");
    });
  });

  describe("callback refs", () => {
    it("uses the latest onDraw / onError callbacks across rerenders", () => {
      const drawnHistogram = makeFilledHistogram(70);
      const renderer = createStubRenderer(drawnHistogram);
      createRendererMock.mockReturnValue(renderer);

      const firstOnDraw = vi.fn();
      const secondOnDraw = vi.fn();
      const firstOnError = vi.fn();
      const secondOnError = vi.fn();

      const { result, rerender } = renderHook(
        ({
          onDraw,
          onError,
        }: {
          onDraw: typeof firstOnDraw;
          onError: typeof firstOnError;
        }) => useHistogram({ onDraw, onError }),
        { initialProps: { onDraw: firstOnDraw, onError: firstOnError } },
      );

      // Swap to the second callbacks before invoking anything.
      rerender({ onDraw: secondOnDraw, onError: secondOnError });

      act(() => {
        result.current.draw(new Uint8ClampedArray(4));
      });
      expect(firstOnDraw).not.toHaveBeenCalled();
      expect(secondOnDraw).toHaveBeenCalledTimes(1);

      // Then make calculate throw to also exercise onError ref.
      const failure = new Error("fail-2");
      calculateMock.mockImplementationOnce(() => {
        throw failure;
      });
      act(() => {
        try {
          result.current.calculate(new Uint8ClampedArray(4));
        } catch {
          // expected
        }
      });
      expect(firstOnError).not.toHaveBeenCalled();
      expect(secondOnError).toHaveBeenCalledWith(failure);
    });
  });

  describe("renderer options", () => {
    it("forwards rendererOptions on the next renderer call after they change", () => {
      const renderer = createStubRenderer(makeFilledHistogram(80));
      createRendererMock.mockReturnValue(renderer);

      const { result, rerender } = renderHook(
        ({ thumbnailWidth }: { thumbnailWidth: number }) =>
          useHistogram({ thumbnailWidth }),
        { initialProps: { thumbnailWidth: 200 } },
      );

      act(() => {
        result.current.draw(new Uint8ClampedArray(4));
      });
      expect(createRendererMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ thumbnailWidth: 200 }),
      );

      // Change renderer options and trigger another draw to pick up the change.
      rerender({ thumbnailWidth: 512 });
      act(() => {
        result.current.draw(new Uint8ClampedArray(4));
      });

      expect(createRendererMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ thumbnailWidth: 512 }),
      );
    });

    it("uses rendererOptions.histogram as the default options for calculate()", () => {
      const histogramOptions = { minValue: 1, maxValue: 254 };
      const { result } = renderHook(() =>
        useHistogram({ histogram: histogramOptions }),
      );

      act(() => {
        result.current.calculate(new Uint8ClampedArray(4));
      });

      expect(calculateMock).toHaveBeenCalledWith(
        expect.any(Uint8ClampedArray),
        expect.objectContaining(histogramOptions),
        expect.any(Object),
      );
    });
  });
});

describe("smoothBins (display smoothing)", () => {
  it("fills a comb of empty levels without moving the overall shape", async () => {
    const { smoothBins } = await import("../dom/histogram");
    const comb = Array.from({ length: 256 }, (_, i) => (i % 3 === 0 ? 0 : 300));
    const smooth = smoothBins(comb);
    const middle = Array.from(smooth.slice(10, 246));
    const spread = Math.max(...middle) - Math.min(...middle);
    expect(spread).toBeLessThan(60); // was 300 (0 vs 300)
    const total = (values: ArrayLike<number>) => Array.from(values).reduce((a, b) => a + b, 0);
    expect(total(smooth)).toBeCloseTo(total(comb), -2);
  });
});
