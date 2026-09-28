import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The browser package pulls in real DOM/canvas dependencies and a WASM module;
// we mock its capture surface so the hook can be exercised in happy-dom.
vi.mock("../dom", () => ({
  captureRendererImage: vi.fn(),
  captureRendererDataUrl: vi.fn(),
  captureRendererBlobWithExif: vi.fn(),
  captureRendererArrayBufferWithExif: vi.fn(),
}));

// Imported after the mock is registered so the hook picks up the mocked module.
import {
  captureRendererArrayBufferWithExif,
  captureRendererBlobWithExif,
  captureRendererDataUrl,
  captureRendererImage,
  type CapturedRendererArrayBuffer,
  type CapturedRendererBlob,
  type CapturedRendererImage,
  type MiniGlRenderer,
} from "../dom";

import { useExportImage } from "./use-export-image";

const captureImageMock = vi.mocked(captureRendererImage);
const captureDataUrlMock = vi.mocked(captureRendererDataUrl);
const captureBlobWithExifMock = vi.mocked(captureRendererBlobWithExif);
const captureArrayBufferWithExifMock = vi.mocked(captureRendererArrayBufferWithExif);

function createStubRenderer(): MiniGlRenderer {
  // The hook only forwards the renderer; the mocked capture functions don't read it.
  return {} as MiniGlRenderer;
}

function createCapturedImage(
  overrides: Partial<CapturedRendererImage> = {},
): CapturedRendererImage {
  return {
    image: {} as HTMLImageElement,
    dataUrl: "data:image/png;base64,AAAA",
    type: "image/png",
    width: 100,
    height: 100,
    ...overrides,
  };
}

function createCapturedBlob(
  overrides: Partial<CapturedRendererBlob> = {},
): CapturedRendererBlob {
  return {
    blob: new Blob(["x"], { type: "image/png" }),
    type: "image/png",
    width: 100,
    height: 100,
    ...overrides,
  };
}

function createCapturedArrayBuffer(
  overrides: Partial<CapturedRendererArrayBuffer> = {},
): CapturedRendererArrayBuffer {
  return {
    arrayBuffer: new ArrayBuffer(8),
    type: "image/png",
    width: 100,
    height: 100,
    ...overrides,
  };
}

beforeEach(() => {
  captureImageMock.mockReset();
  captureDataUrlMock.mockReset();
  captureBlobWithExifMock.mockReset();
  captureArrayBufferWithExifMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useExportImage", () => {
  describe("initial state", () => {
    it("starts idle with no result, no error, and isExporting=false", () => {
      const { result } = renderHook(() => useExportImage());

      expect(result.current.status).toBe("idle");
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isExporting).toBe(false);
    });

    it("canExport reflects whether a renderer is available", () => {
      const { result, rerender } = renderHook(
        ({ renderer }: { renderer: MiniGlRenderer | null }) =>
          useExportImage({ renderer }),
        { initialProps: { renderer: null as MiniGlRenderer | null } },
      );

      expect(result.current.canExport).toBe(false);

      rerender({ renderer: createStubRenderer() });
      expect(result.current.canExport).toBe(true);
    });
  });

  describe("exportImage happy path", () => {
    it("returns the captured image and surfaces it on the hook", async () => {
      const captured = createCapturedImage();
      captureImageMock.mockReturnValue(captured);

      const onExport = vi.fn();
      const renderer = createStubRenderer();
      const { result } = renderHook(() =>
        useExportImage({ renderer, onExport }),
      );

      let returned: CapturedRendererImage | undefined;
      await act(async () => {
        returned = await result.current.exportImage();
      });

      expect(returned).toBe(captured);
      expect(captureImageMock).toHaveBeenCalledTimes(1);
      expect(captureImageMock).toHaveBeenCalledWith(
        renderer,
        expect.objectContaining({ format: "png" }),
      );
      expect(result.current.result).toBe(captured);
      expect(result.current.status).toBe("exported");
      expect(result.current.error).toBeNull();
      expect(result.current.isExporting).toBe(false);
      expect(onExport).toHaveBeenCalledWith(captured);
    });

    it("exportDataUrl surfaces the dataUrl string", async () => {
      captureDataUrlMock.mockReturnValue("data:image/png;base64,ZZZ");

      const renderer = createStubRenderer();
      const { result } = renderHook(() => useExportImage({ renderer }));

      let returned: string | undefined;
      await act(async () => {
        returned = await result.current.exportDataUrl();
      });

      expect(returned).toBe("data:image/png;base64,ZZZ");
      expect(result.current.result).toBe("data:image/png;base64,ZZZ");
      expect(result.current.status).toBe("exported");
    });

    it("exportBlob delegates to captureRendererBlobWithExif", async () => {
      const blob = createCapturedBlob();
      captureBlobWithExifMock.mockResolvedValue(blob);

      const renderer = createStubRenderer();
      const { result } = renderHook(() => useExportImage({ renderer }));

      let returned: CapturedRendererBlob | undefined;
      await act(async () => {
        returned = await result.current.exportBlob();
      });

      expect(returned).toBe(blob);
      expect(captureBlobWithExifMock).toHaveBeenCalledTimes(1);
      expect(captureBlobWithExifMock).toHaveBeenCalledWith(
        renderer,
        expect.objectContaining({ format: "png" }),
      );
    });

    it("forwards originalExif into captureRendererBlobWithExif so it can stitch metadata", async () => {
      const blob = createCapturedBlob({ type: "image/jpeg" });
      captureBlobWithExifMock.mockResolvedValue(blob);

      const originalExif = new ArrayBuffer(4);
      const renderer = createStubRenderer();
      const { result } = renderHook(() =>
        useExportImage({ renderer, originalExif }),
      );

      let returned: CapturedRendererBlob | undefined;
      await act(async () => {
        returned = await result.current.exportBlob();
      });

      expect(returned).toBe(blob);
      expect(captureBlobWithExifMock).toHaveBeenCalledWith(
        renderer,
        expect.objectContaining({ originalExif }),
      );
    });

    it("exportArrayBuffer delegates to captureRendererArrayBufferWithExif", async () => {
      const captureBuffer = createCapturedArrayBuffer();
      captureArrayBufferWithExifMock.mockResolvedValue(captureBuffer);

      const renderer = createStubRenderer();
      const { result } = renderHook(() => useExportImage({ renderer }));

      let returned: CapturedRendererArrayBuffer | undefined;
      await act(async () => {
        returned = await result.current.exportArrayBuffer();
      });

      expect(returned).toBe(captureBuffer);
      expect(captureArrayBufferWithExifMock).toHaveBeenCalledTimes(1);
    });

    it("merges per-call options on top of the hook defaults", async () => {
      captureImageMock.mockReturnValue(createCapturedImage());

      const renderer = createStubRenderer();
      const { result } = renderHook(() =>
        useExportImage({ renderer, format: "jpeg", quality: 0.5 }),
      );

      await act(async () => {
        await result.current.exportImage(undefined, { quality: 0.9 });
      });

      expect(captureImageMock).toHaveBeenCalledWith(
        renderer,
        expect.objectContaining({ format: "jpeg", quality: 0.9 }),
      );
    });

    it("uses a per-call renderer override when provided", async () => {
      captureImageMock.mockReturnValue(createCapturedImage());

      const defaultRenderer = createStubRenderer();
      const overrideRenderer = createStubRenderer();
      const { result } = renderHook(() =>
        useExportImage({ renderer: defaultRenderer }),
      );

      await act(async () => {
        await result.current.exportImage(overrideRenderer);
      });

      expect(captureImageMock).toHaveBeenCalledWith(
        overrideRenderer,
        expect.any(Object),
      );
    });

    it("throws when no renderer is available anywhere", async () => {
      const { result } = renderHook(() => useExportImage());

      let caught: unknown;
      await act(async () => {
        try {
          await result.current.exportImage();
        } catch (error) {
          caught = error;
        }
      });

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/renderer is required/i);
      expect(result.current.status).toBe("error");
      expect(result.current.isExporting).toBe(false);
    });
  });

  describe("loading state", () => {
    it("flips isExporting to true during the call and back to false after", async () => {
      let release: (value: CapturedRendererImage) => void = () => {};
      const pending = new Promise<CapturedRendererImage>((resolve) => {
        release = resolve;
      });
      // captureRendererImage is sync in real life, but the hook awaits its
      // return, so a Promise return is enough to observe the transient state.
      captureImageMock.mockImplementation(
        () => pending as unknown as CapturedRendererImage,
      );

      const renderer = createStubRenderer();
      const { result } = renderHook(() => useExportImage({ renderer }));

      let exportPromise: Promise<CapturedRendererImage> | undefined;
      act(() => {
        exportPromise = result.current.exportImage();
      });

      await waitFor(() => {
        expect(result.current.isExporting).toBe(true);
      });
      expect(result.current.status).toBe("exporting");

      const captured = createCapturedImage();
      await act(async () => {
        release(captured);
        await exportPromise;
      });

      expect(result.current.isExporting).toBe(false);
      expect(result.current.status).toBe("exported");
      expect(result.current.result).toBe(captured);
    });
  });

  describe("error state", () => {
    it("surfaces the error and resets isExporting when the underlying export throws", async () => {
      const failure = new Error("boom");
      captureImageMock.mockImplementation(() => {
        throw failure;
      });

      const onError = vi.fn();
      const renderer = createStubRenderer();
      const { result } = renderHook(() =>
        useExportImage({ renderer, onError }),
      );

      let caught: unknown;
      await act(async () => {
        try {
          await result.current.exportImage();
        } catch (error) {
          caught = error;
        }
      });

      expect(caught).toBe(failure);
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe(failure);
      expect(result.current.isExporting).toBe(false);
      expect(onError).toHaveBeenCalledWith(failure);
    });

    it("reset() clears error/result/status back to idle", async () => {
      captureImageMock.mockImplementation(() => {
        throw new Error("nope");
      });

      const renderer = createStubRenderer();
      const { result } = renderHook(() => useExportImage({ renderer }));

      await act(async () => {
        try {
          await result.current.exportImage();
        } catch {
          // swallow — asserting on hook state below
        }
      });

      expect(result.current.status).toBe("error");

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.result).toBeNull();
    });
  });

  describe("multiple sequential exports", () => {
    it("does not leak loading state across calls and reflects only the latest result", async () => {
      const first = createCapturedImage({ dataUrl: "data:image/png;base64,AAA" });
      const second = createCapturedImage({ dataUrl: "data:image/png;base64,BBB" });
      captureImageMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

      const renderer = createStubRenderer();
      const { result } = renderHook(() => useExportImage({ renderer }));

      await act(async () => {
        await result.current.exportImage();
      });
      expect(result.current.result).toBe(first);
      expect(result.current.isExporting).toBe(false);
      expect(result.current.status).toBe("exported");

      await act(async () => {
        await result.current.exportImage();
      });
      expect(result.current.result).toBe(second);
      expect(result.current.isExporting).toBe(false);
      expect(result.current.status).toBe("exported");
    });

    it("recovers from an error on a subsequent successful export", async () => {
      const failure = new Error("first-fail");
      const success = createCapturedImage();
      captureImageMock
        .mockImplementationOnce(() => {
          throw failure;
        })
        .mockReturnValueOnce(success);

      const renderer = createStubRenderer();
      const { result } = renderHook(() => useExportImage({ renderer }));

      let caught: unknown;
      await act(async () => {
        try {
          await result.current.exportImage();
        } catch (error) {
          caught = error;
        }
      });
      expect(caught).toBe(failure);
      expect(result.current.status).toBe("error");

      await act(async () => {
        await result.current.exportImage();
      });

      expect(result.current.status).toBe("exported");
      expect(result.current.error).toBeNull();
      expect(result.current.result).toBe(success);
      expect(result.current.isExporting).toBe(false);
    });
  });
});
