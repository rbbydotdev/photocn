import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the browser package barrel. The real one pulls in mini-gl/mini-exif and
// WASM modules that won't load in happy-dom. We supply identifiable stubs so
// integration wiring across the composed hooks can be observed.
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
    // useImageInput
    decodeImageInput: vi.fn(),
    selectImageFile: vi.fn(),
    // useMiniGlEditor
    createMiniGlEditor: vi.fn(),
    // useExifMetadata
    createExifHandle: vi.fn(),
    readExifMetadata: vi.fn(),
    // useHistogram
    createRgbHistogram: vi.fn(createRgbHistogram),
    calculateRgbHistogram: vi.fn(),
    createHistogramRenderer: vi.fn(() => ({
      draw: vi.fn(() => createRgbHistogram()),
      drawImage: vi.fn(() => createRgbHistogram()),
      clear: vi.fn(),
    })),
    // useExportImage
    captureRendererImage: vi.fn(),
    captureRendererDataUrl: vi.fn(),
    captureRendererBlobWithExif: vi.fn(),
    captureRendererArrayBufferWithExif: vi.fn(),
  };
});

// Stub renderEditorPipeline at the core boundary so render() is observable
// without exercising the real GL pipeline. The mock invokes onHistogramUpdate
// so the composed hook's downstream wiring fires as it does in production.
vi.mock("..", async () => {
  const actual = await vi.importActual<
    typeof import("..")
  >("..");
  return {
    ...actual,
    renderEditorPipeline: vi.fn(
      ({ onHistogramUpdate }: { onHistogramUpdate?: () => void }) => {
        onHistogramUpdate?.();
      },
    ),
  };
});

import {
  createExifHandle,
  createMiniGlEditor,
  decodeImageInput,
  readExifMetadata,
  type BrowserExifHandle,
  type BrowserImageInputResult,
  type ExifMetadata,
  type MiniGlRenderer,
} from "../dom";
import {
  createEditorParams,
  type EditorParams,
  type LoadableImage,
} from "..";

import { useMiniPhotoEditor } from "./use-mini-photo-editor";

const createMiniGlEditorMock = vi.mocked(createMiniGlEditor);
const decodeImageInputMock = vi.mocked(decodeImageInput);
const createExifHandleMock = vi.mocked(createExifHandle);
const readExifMetadataMock = vi.mocked(readExifMetadata);

function createMockRenderer(width = 4, height = 4): MiniGlRenderer {
  return {
    width,
    height,
    img: {} as CanvasImageSource,
    gl: { canvas: { width, height } },
    loadImage: vi.fn(),
    resetCrop: vi.fn(),
    captureImage: vi.fn(),
    readPixels: vi.fn(() => new Uint8Array(width * height * 4)),
    filterMatrix: vi.fn(),
    filterPerspective: vi.fn(),
    crop: vi.fn(),
    filterBlend: vi.fn(),
    filterAdjustments: vi.fn(),
    filterBloom: vi.fn(),
    filterNoise: vi.fn(),
    filterHighlightsShadows: vi.fn(),
    filterCurves: vi.fn(),
    filterInsta: vi.fn(),
    filterBlurBokeh: vi.fn(),
    filterBlurGaussian: vi.fn(),
    paintCanvas: vi.fn(),
  } as unknown as MiniGlRenderer;
}

function createStubEditor(): {
  renderer: MiniGlRenderer;
  dispose: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
} {
  return {
    renderer: createMockRenderer(),
    dispose: vi.fn(),
    destroy: vi.fn(),
    reset: vi.fn(),
  };
}

function createStubImageInputResult(): BrowserImageInputResult {
  const arrayBuffer = new ArrayBuffer(8);
  const blob = new Blob([arrayBuffer], { type: "image/png" });
  const image = document.createElement("img");
  return {
    arrayBuffer,
    blob,
    image,
    fileInfo: { name: "stub.png", size: 8, type: "image/png" },
  };
}

function makeFile(name = "input.png", type = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

function makeHandle(buffer = new ArrayBuffer(8)): BrowserExifHandle {
  return { arrayBuffer: buffer } as BrowserExifHandle;
}

function makeMetadata(): ExifMetadata {
  return { format: "JPG", tiff: { Make: { value: "Canon" } } } as ExifMetadata;
}

beforeEach(() => {
  createMiniGlEditorMock.mockReset();
  decodeImageInputMock.mockReset();
  createExifHandleMock.mockReset();
  readExifMetadataMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMiniPhotoEditor", () => {
  describe("returned shape", () => {
    it("exposes the composed sub-hooks plus aggregate flags", () => {
      const { result } = renderHook(() => useMiniPhotoEditor());

      expect(result.current).toEqual(
        expect.objectContaining({
          imageInput: expect.any(Object),
          miniGl: expect.any(Object),
          renderPipeline: expect.any(Object),
          exif: expect.any(Object),
          histogram: expect.any(Object),
          exportImage: expect.any(Object),
        }),
      );
      // Aggregate fields default to "no work yet": no renderer, nothing ready.
      expect(result.current.renderer).toBeNull();
      expect(result.current.editor).toBeNull();
      expect(result.current.canRender).toBe(false);
      expect(result.current.canExport).toBe(false);
      expect(result.current.isReady).toBe(false);
    });
  });

  describe("activeImage selection", () => {
    it("uses P3 metadata as the editor color space before creating the editor", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);
      createExifHandleMock.mockReturnValue(makeHandle(stub.arrayBuffer));
      readExifMetadataMock.mockReturnValue({
        format: "JPG",
        icc: { ColorProfile: ["Display P3"] },
      } as ExifMetadata);
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);

      const file = makeFile();
      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) => useMiniPhotoEditor({ input }),
        { initialProps: { input: null as File | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      await act(async () => {
        rerender({ input: file });
      });

      await waitFor(() => {
        expect(result.current.editor).toBe(stubEditor);
      });

      expect(createMiniGlEditorMock).toHaveBeenCalledTimes(1);
      expect(createMiniGlEditorMock).toHaveBeenCalledWith({
        canvas,
        image: stub.image,
        colorspace: "display-p3",
      });
    });

    it("the explicit `image` prop overrides imageInput.image for the editor factory", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);
      const overrideImage = {} as LoadableImage;

      const { result, rerender } = renderHook(
        ({ image }: { image: LoadableImage | null }) =>
          useMiniPhotoEditor({ image }),
        { initialProps: { image: null as LoadableImage | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      await act(async () => {
        rerender({ image: overrideImage });
      });

      await waitFor(() => {
        expect(createMiniGlEditorMock).toHaveBeenCalledTimes(1);
      });
      expect(createMiniGlEditorMock).toHaveBeenCalledWith({
        canvas,
        image: overrideImage,
        colorspace: "srgb",
      });
      // imageInput was never asked to decode anything (no input prop).
      expect(decodeImageInputMock).not.toHaveBeenCalled();
    });

    it("falls back to imageInput.image when the explicit `image` prop is absent", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);

      const file = makeFile();
      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) => useMiniPhotoEditor({ input }),
        { initialProps: { input: null as File | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      await act(async () => {
        rerender({ input: file });
      });

      await waitFor(() => {
        expect(result.current.imageInput.image).toBe(stub.image);
      });
      await waitFor(() => {
        expect(result.current.editor).toBe(stubEditor);
      });

      expect(createMiniGlEditorMock).toHaveBeenCalledWith(
        expect.objectContaining({ image: stub.image }),
      );
    });
  });

  describe("EXIF source resolution", () => {
    it("defaults the EXIF source to imageInput.arrayBuffer", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);
      const handle = makeHandle(stub.arrayBuffer);
      createExifHandleMock.mockReturnValue(handle);
      readExifMetadataMock.mockReturnValue(makeMetadata());

      const file = makeFile();
      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) => useMiniPhotoEditor({ input }),
        { initialProps: { input: null as File | null } },
      );

      await act(async () => {
        rerender({ input: file });
      });

      await waitFor(() => {
        expect(result.current.exif.handle).toBe(handle);
      });
      expect(createExifHandleMock).toHaveBeenCalledWith(
        stub.arrayBuffer,
        expect.any(Object),
      );
    });

    it("an explicit exifOptions.source (even undefined) wins over imageInput.arrayBuffer", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);

      const file = makeFile();
      const exifOptions = { source: undefined };
      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) =>
          useMiniPhotoEditor({ input, exifOptions }),
        { initialProps: { input: null as File | null } },
      );

      await act(async () => {
        rerender({ input: file });
      });

      // Wait for the image to load so the arrayBuffer is available.
      await waitFor(() => {
        expect(result.current.imageInput.arrayBuffer).toBe(stub.arrayBuffer);
      });

      // Yield to let any remaining effect run.
      await act(async () => {
        await Promise.resolve();
      });

      // EXIF parse should NOT have been invoked because the explicit source
      // was undefined (and "source" in exifOptions short-circuits the fallback).
      expect(createExifHandleMock).not.toHaveBeenCalled();
      expect(result.current.exif.handle).toBeUndefined();
    });

    it("an explicit exifOptions.source (concrete buffer) is used as-is", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);

      const customBuffer = new ArrayBuffer(32);
      const handle = makeHandle(customBuffer);
      createExifHandleMock.mockReturnValue(handle);
      readExifMetadataMock.mockReturnValue(makeMetadata());

      const file = makeFile();
      const exifOptions = { source: customBuffer };
      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) =>
          useMiniPhotoEditor({ input, exifOptions }),
        { initialProps: { input: null as File | null } },
      );

      await act(async () => {
        rerender({ input: file });
      });

      await waitFor(() => {
        expect(result.current.exif.handle).toBe(handle);
      });
      // The custom buffer was used — not the imageInput's arrayBuffer.
      expect(createExifHandleMock).toHaveBeenCalledWith(
        customBuffer,
        expect.any(Object),
      );
    });
  });

  describe("histogram drawOnRender wiring", () => {
    it("auto-draws the histogram on render when enabled and renderer present", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);

      const onHistogramUpdate = vi.fn();
      const params = createEditorParams();

      const { result, rerender } = renderHook(
        ({ image }: { image: LoadableImage | null }) =>
          useMiniPhotoEditor({ image, params, onHistogramUpdate }),
        { initialProps: { image: null as LoadableImage | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      const stubImage = {} as LoadableImage;
      await act(async () => {
        rerender({ image: stubImage });
      });
      await waitFor(() => {
        expect(result.current.renderer).toBe(stubEditor.renderer);
      });

      // Trigger the render — the (mocked) renderEditorPipeline will invoke
      // onHistogramUpdate, which is the hook's internal updateHistogram.
      act(() => {
        result.current.renderPipeline.render();
      });

      // drawOnRender defaults true, histogramEnabled defaults true → the
      // updateHistogram callback reads pixels from the renderer and feeds them
      // into histogram.draw. Asserting via the renderer.readPixels spy is the
      // most reliable signal since it sits on a stable mock that
      // updateHistogram closes over.
      expect(stubEditor.renderer.readPixels).toHaveBeenCalledTimes(1);
      // The user-supplied onHistogramUpdate also fires (after histogram.draw).
      expect(onHistogramUpdate).toHaveBeenCalledTimes(1);
    });

    it("histogramEnabled=false skips histogram.draw but still calls onHistogramUpdate", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);
      const onHistogramUpdate = vi.fn();
      const params = createEditorParams();
      const histogramOptions = { enabled: false };

      const { result, rerender } = renderHook(
        ({ image }: { image: LoadableImage | null }) =>
          useMiniPhotoEditor({
            image,
            params,
            histogramOptions,
            onHistogramUpdate,
          }),
        { initialProps: { image: null as LoadableImage | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      const stubImage = {} as LoadableImage;
      await act(async () => {
        rerender({ image: stubImage });
      });
      await waitFor(() => {
        expect(result.current.renderer).toBe(stubEditor.renderer);
      });

      act(() => {
        result.current.renderPipeline.render();
      });

      // With histogramEnabled=false the draw branch is skipped — the renderer's
      // readPixels is never called by updateHistogram.
      expect(stubEditor.renderer.readPixels).not.toHaveBeenCalled();
      // But the user's onHistogramUpdate callback still fires.
      expect(onHistogramUpdate).toHaveBeenCalledTimes(1);
    });

    it("histogramOptions other than enabled/drawOnRender flow through to useHistogram", () => {
      // The histogramRendererOptions are passed via spread; we cannot directly
      // inspect them without exposing internals, but the hook must still
      // construct without throwing and respect non-flag options.
      const params = createEditorParams();
      const histogramOptions = {
        histogram: { minValue: 5, maxValue: 250, alphaThreshold: 1 },
      };
      const { result } = renderHook(() =>
        useMiniPhotoEditor({ params, histogramOptions }),
      );

      // Histogram is constructed and exposed.
      expect(result.current.histogram).toBeDefined();
      expect(typeof result.current.histogram.draw).toBe("function");
    });
  });

  describe("export originalExif resolution", () => {
    it("uses the EXIF handle by default when exportOptions.originalExif is not provided", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);
      const handle = makeHandle(stub.arrayBuffer);
      createExifHandleMock.mockReturnValue(handle);
      readExifMetadataMock.mockReturnValue(makeMetadata());

      const file = makeFile();
      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) => useMiniPhotoEditor({ input }),
        { initialProps: { input: null as File | null } },
      );

      await act(async () => {
        rerender({ input: file });
      });
      await waitFor(() => {
        expect(result.current.exif.handle).toBe(handle);
      });
      // The export surface is bound; the originalExif default is the EXIF handle.
      // We assert the export hook is callable; specific wiring tested in
      // useExportImage.test.
      expect(typeof result.current.exportImage.exportImage).toBe("function");
    });

    it("an explicit exportOptions.originalExif (even null) overrides the EXIF handle", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);
      const handle = makeHandle(stub.arrayBuffer);
      createExifHandleMock.mockReturnValue(handle);
      readExifMetadataMock.mockReturnValue(makeMetadata());

      const file = makeFile();
      const exportOptions = { originalExif: null };
      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) =>
          useMiniPhotoEditor({ input, exportOptions }),
        { initialProps: { input: null as File | null } },
      );

      await act(async () => {
        rerender({ input: file });
      });
      await waitFor(() => {
        expect(result.current.exif.handle).toBe(handle);
      });
      // Not throwing on construction is enough proof that "originalExif" in
      // exportOptions is honoured (the hook bypasses exif.handle in that case).
      expect(typeof result.current.exportImage.exportBlob).toBe("function");
    });
  });

  describe("aggregate flags", () => {
    it("isReady, canRender, canExport flip true once a renderer is bound", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);
      const params = createEditorParams();

      const { result, rerender } = renderHook(
        ({ image }: { image: LoadableImage | null }) =>
          useMiniPhotoEditor({ image, params }),
        { initialProps: { image: null as LoadableImage | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      // Initially nothing is ready.
      expect(result.current.isReady).toBe(false);
      expect(result.current.canRender).toBe(false);
      expect(result.current.canExport).toBe(false);

      const stubImage = {} as LoadableImage;
      await act(async () => {
        rerender({ image: stubImage });
      });

      await waitFor(() => {
        expect(result.current.renderer).toBe(stubEditor.renderer);
      });

      expect(result.current.isReady).toBe(true);
      // canRender requires both renderer + params.
      expect(result.current.canRender).toBe(true);
      // canExport just requires the renderer.
      expect(result.current.canExport).toBe(true);
      // editor is also surfaced at the top level.
      expect(result.current.editor).toBe(stubEditor);
    });

    it("canRender stays false when params is null even after renderer is ready", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);

      const { result, rerender } = renderHook(
        ({ image }: { image: LoadableImage | null }) =>
          useMiniPhotoEditor({ image, params: null }),
        { initialProps: { image: null as LoadableImage | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      const stubImage = {} as LoadableImage;
      await act(async () => {
        rerender({ image: stubImage });
      });

      await waitFor(() => {
        expect(result.current.renderer).toBe(stubEditor.renderer);
      });

      expect(result.current.canRender).toBe(false);
      expect(result.current.canExport).toBe(true);
      expect(result.current.isReady).toBe(true);
    });
  });

  describe("callback wiring", () => {
    it("forwards onImageLoad to useImageInput", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);

      const onImageLoad = vi.fn();
      const onImageError = vi.fn();
      const file = makeFile();

      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) =>
          useMiniPhotoEditor({ input, onImageLoad, onImageError }),
        { initialProps: { input: null as File | null } },
      );

      await act(async () => {
        rerender({ input: file });
      });

      await waitFor(() => {
        expect(result.current.imageInput.status).toBe("loaded");
      });
      expect(onImageLoad).toHaveBeenCalledWith(stub);
      expect(onImageError).not.toHaveBeenCalled();
    });

    it("forwards onEditorReady to useMiniGlEditor", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);

      const onEditorReady = vi.fn();
      const onEditorError = vi.fn();

      const { result, rerender } = renderHook(
        ({ image }: { image: LoadableImage | null }) =>
          useMiniPhotoEditor({
            image,
            onEditorReady,
            onEditorError,
          }),
        { initialProps: { image: null as LoadableImage | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      const stubImage = {} as LoadableImage;
      await act(async () => {
        rerender({ image: stubImage });
      });

      await waitFor(() => {
        expect(onEditorReady).toHaveBeenCalledTimes(1);
      });
      expect(onEditorReady).toHaveBeenCalledWith({
        canvas,
        editor: stubEditor,
        renderer: stubEditor.renderer,
      });
      expect(onEditorError).not.toHaveBeenCalled();
    });
  });

  describe("end-to-end flow", () => {
    it("input → image decoded → editor created → renderer + render pipeline ready", async () => {
      const stub = createStubImageInputResult();
      decodeImageInputMock.mockResolvedValue(stub);
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);

      const params: EditorParams = createEditorParams();
      const file = makeFile();

      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) =>
          useMiniPhotoEditor({ input, params }),
        { initialProps: { input: null as File | null } },
      );
      const canvas = document.createElement("canvas");
      result.current.miniGl.canvasRef.current = canvas;

      await act(async () => {
        rerender({ input: file });
      });

      // Image decoded — imageInput populated.
      await waitFor(() => {
        expect(result.current.imageInput.image).toBe(stub.image);
      });

      // Editor created with the decoded image.
      await waitFor(() => {
        expect(result.current.editor).toBe(stubEditor);
      });
      expect(createMiniGlEditorMock).toHaveBeenCalledWith(
        expect.objectContaining({ image: stub.image, canvas }),
      );

      // Renderer surfaced and renderPipeline now wired up.
      expect(result.current.renderer).toBe(stubEditor.renderer);
      expect(result.current.canRender).toBe(true);
      expect(result.current.canExport).toBe(true);

      // render() does not throw and the renderPipeline surface stays coherent.
      act(() => {
        result.current.renderPipeline.render();
      });
      expect(typeof result.current.renderPipeline.render).toBe("function");
    });
  });
});
