import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The browser package barrel pulls in mini-gl/mini-exif which won't load under
// happy-dom. Mock the createMiniGlEditor entry point that the hook calls; tests
// drive behaviour through this mock.
vi.mock("../dom", () => ({
  createMiniGlEditor: vi.fn(),
}));

import {
  createMiniGlEditor,
  type MiniGlRenderer,
} from "../dom";

import {
  useMiniGlEditor,
  type CreateMiniGlEditor,
  type MiniGlEditorImage,
  type MiniGlEditorInstance,
} from "./use-mini-gl-editor";

const createMiniGlEditorMock = vi.mocked(createMiniGlEditor);

type StubEditor = MiniGlEditorInstance<MiniGlRenderer>;

function createStubRenderer(): MiniGlRenderer {
  return {} as MiniGlRenderer;
}

function createStubEditor(): StubEditor & {
  dispose: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
} {
  return {
    renderer: createStubRenderer(),
    dispose: vi.fn(),
    destroy: vi.fn(),
    reset: vi.fn(),
  };
}

function createStubImage(): MiniGlEditorImage {
  // The hook never inspects the image directly; the stub only travels through
  // the factory call.
  return {} as MiniGlEditorImage;
}

function attachCanvasFromHook(
  result: { current: { canvasRef: { current: HTMLCanvasElement | null } } },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  result.current.canvasRef.current = canvas;
  return canvas;
}

beforeEach(() => {
  createMiniGlEditorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMiniGlEditor", () => {
  describe("initial state", () => {
    it("starts idle with no editor, renderer, error, or readiness", () => {
      const { result } = renderHook(() => useMiniGlEditor({ image: null }));

      expect(result.current.status).toBe("idle");
      expect(result.current.editor).toBeNull();
      expect(result.current.renderer).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isReady).toBe(false);
      expect(result.current.canvasRef.current).toBeNull();
    });

    it("does not invoke the factory when image is null", () => {
      renderHook(() => useMiniGlEditor({ image: null }));
      expect(createMiniGlEditorMock).not.toHaveBeenCalled();
    });
  });

  describe("loading transitions", () => {
    it("transitions from idle → loading → ready when image and canvas are present", async () => {
      const stubEditor = createStubEditor();
      // Hold the factory promise so the test can observe the transient
      // 'loading' state before letting it resolve.
      let release: (value: StubEditor) => void = () => {};
      const pending = new Promise<StubEditor>((resolve) => {
        release = resolve;
      });
      createMiniGlEditorMock.mockImplementation(
        () => pending as unknown as ReturnType<typeof createMiniGlEditor>,
      );

      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image: img }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );

      // Attach a canvas so the next render can launch the factory.
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      rerender({ image });

      await waitFor(() => {
        expect(result.current.status).toBe("loading");
      });

      await act(async () => {
        release(stubEditor);
        // Yield so the .then handler runs and commits state.
        await pending;
      });

      expect(result.current.status).toBe("ready");
      expect(result.current.isReady).toBe(true);
      expect(result.current.editor).toBe(stubEditor);
      expect(result.current.renderer).toBe(stubEditor.renderer);
    });
  });

  describe("factory selection", () => {
    it("uses the imported createMiniGlEditor when no createEditor prop is supplied", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValueOnce(stubEditor);

      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image: img }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      const canvas = attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      await act(async () => {
        rerender({ image });
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      expect(createMiniGlEditorMock).toHaveBeenCalledTimes(1);
      expect(createMiniGlEditorMock).toHaveBeenCalledWith({
        canvas,
        image,
        colorspace: "srgb",
      });
    });

    it("invokes a custom createEditor factory with {canvas, image, colorspace}", async () => {
      const stubEditor = createStubEditor();
      const factory = vi.fn(async () => stubEditor) as unknown as CreateMiniGlEditor<
        MiniGlRenderer,
        StubEditor
      >;

      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({
            image: img,
            colorspace: "display-p3",
            createEditor: factory,
          }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      const canvas = attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      await act(async () => {
        rerender({ image });
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });

      expect(factory).toHaveBeenCalledTimes(1);
      expect(factory).toHaveBeenCalledWith({
        canvas,
        image,
        colorspace: "display-p3",
      });
      // The default factory is bypassed when a custom one is provided.
      expect(createMiniGlEditorMock).not.toHaveBeenCalled();
    });
  });

  describe("onReady / onError callbacks", () => {
    it("invokes onReady with {canvas, editor, renderer} once the factory resolves", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValueOnce(stubEditor);
      const onReady = vi.fn();

      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image: img, onReady }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      const canvas = attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      await act(async () => {
        rerender({ image });
      });

      await waitFor(() => {
        expect(onReady).toHaveBeenCalledTimes(1);
      });
      expect(onReady).toHaveBeenCalledWith({
        canvas,
        editor: stubEditor,
        renderer: stubEditor.renderer,
      });
    });

    it("calls onError and surfaces the rejection in error/status state", async () => {
      const failure = new Error("boom");
      createMiniGlEditorMock.mockRejectedValueOnce(failure);
      const onError = vi.fn();

      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image: img, onError }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      await act(async () => {
        rerender({ image });
      });

      await waitFor(() => {
        expect(result.current.status).toBe("error");
      });
      expect(result.current.error).toBe(failure);
      expect(result.current.editor).toBeNull();
      expect(result.current.renderer).toBeNull();
      expect(onError).toHaveBeenCalledWith(failure);
    });

    it("keeps onReady/onError refs current — only the latest callback fires", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValue(stubEditor);

      const firstOnReady = vi.fn();
      const secondOnReady = vi.fn();
      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({
          image: img,
          onReady,
        }: {
          image: MiniGlEditorImage | null;
          onReady: typeof firstOnReady;
        }) => useMiniGlEditor({ image: img, onReady }),
        {
          initialProps: {
            image: null as MiniGlEditorImage | null,
            onReady: firstOnReady,
          },
        },
      );
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      // Swap the callback before launching the factory; the hook must read the
      // latest ref when the promise resolves.
      rerender({ image: null, onReady: secondOnReady });

      await act(async () => {
        rerender({ image, onReady: secondOnReady });
      });
      await waitFor(() => {
        expect(secondOnReady).toHaveBeenCalledTimes(1);
      });
      expect(firstOnReady).not.toHaveBeenCalled();
    });
  });

  describe("disposal", () => {
    it("disposes the previous editor when image changes", async () => {
      const firstEditor = createStubEditor();
      const secondEditor = createStubEditor();
      createMiniGlEditorMock
        .mockResolvedValueOnce(firstEditor)
        .mockResolvedValueOnce(secondEditor);

      const firstImage = createStubImage();
      const secondImage = createStubImage();
      const { result, rerender } = renderHook(
        ({ image }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      await act(async () => {
        rerender({ image: firstImage });
      });
      await waitFor(() => {
        expect(result.current.editor).toBe(firstEditor);
      });

      await act(async () => {
        rerender({ image: secondImage });
      });
      await waitFor(() => {
        expect(result.current.editor).toBe(secondEditor);
      });

      expect(firstEditor.dispose).toHaveBeenCalledTimes(1);
      expect(secondEditor.dispose).not.toHaveBeenCalled();
    });

    it("disposes the active editor on unmount", async () => {
      const stubEditor = createStubEditor();
      createMiniGlEditorMock.mockResolvedValueOnce(stubEditor);

      const image = createStubImage();
      const { result, rerender, unmount } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image: img }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      await act(async () => {
        rerender({ image });
      });
      await waitFor(() => {
        expect(result.current.editor).toBe(stubEditor);
      });

      unmount();
      expect(stubEditor.dispose).toHaveBeenCalledTimes(1);
    });

    it("disposes a factory that resolves AFTER unmount, without exposing the editor", async () => {
      const stubEditor = createStubEditor();
      let release: (value: StubEditor) => void = () => {};
      const pending = new Promise<StubEditor>((resolve) => {
        release = resolve;
      });
      createMiniGlEditorMock.mockImplementation(
        () => pending as unknown as ReturnType<typeof createMiniGlEditor>,
      );

      const image = createStubImage();
      const { result, rerender, unmount } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image: img }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      rerender({ image });

      await waitFor(() => {
        expect(result.current.status).toBe("loading");
      });

      // Unmount BEFORE the factory promise resolves.
      unmount();

      // Now release the factory; the hook's .then must dispose without setting state.
      await act(async () => {
        release(stubEditor);
        await pending;
      });

      expect(stubEditor.dispose).toHaveBeenCalledTimes(1);
      // After unmount we can't read result.current safely, but we've asserted
      // dispose() was called via the disposed-flag path inside the hook.
    });
  });

  describe("factory shape", () => {
    it("awaits an async factory before flipping status to ready", async () => {
      const stubEditor = createStubEditor();
      let release: (value: StubEditor) => void = () => {};
      const pending = new Promise<StubEditor>((resolve) => {
        release = resolve;
      });
      const factory = vi.fn(() => pending) as unknown as CreateMiniGlEditor<
        MiniGlRenderer,
        StubEditor
      >;

      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image: img, createEditor: factory }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      rerender({ image });

      await waitFor(() => {
        expect(result.current.status).toBe("loading");
      });
      // Still loading — the factory promise hasn't settled.
      expect(result.current.isReady).toBe(false);

      await act(async () => {
        release(stubEditor);
        await pending;
      });

      expect(result.current.status).toBe("ready");
      expect(result.current.editor).toBe(stubEditor);
    });

    it("works with a synchronous factory by wrapping it in Promise.resolve", async () => {
      const stubEditor = createStubEditor();
      const factory = vi.fn(() => stubEditor) as unknown as CreateMiniGlEditor<
        MiniGlRenderer,
        StubEditor
      >;

      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({ image: img }: { image: MiniGlEditorImage | null }) =>
          useMiniGlEditor({ image: img, createEditor: factory }),
        { initialProps: { image: null as MiniGlEditorImage | null } },
      );
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      await act(async () => {
        rerender({ image });
      });
      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });
      expect(result.current.editor).toBe(stubEditor);
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe("colorspace dependency", () => {
    it("re-creates the editor when colorspace changes", async () => {
      const firstEditor = createStubEditor();
      const secondEditor = createStubEditor();
      createMiniGlEditorMock
        .mockResolvedValueOnce(firstEditor)
        .mockResolvedValueOnce(secondEditor);

      const image = createStubImage();
      const { result, rerender } = renderHook(
        ({
          image: img,
          colorspace,
        }: {
          image: MiniGlEditorImage | null;
          colorspace: "srgb" | "display-p3";
        }) => useMiniGlEditor({ image: img, colorspace }),
        {
          initialProps: {
            image: null as MiniGlEditorImage | null,
            colorspace: "srgb" as "srgb" | "display-p3",
          },
        },
      );
      attachCanvasFromHook(
        result as { current: { canvasRef: { current: HTMLCanvasElement | null } } },
      );

      // Now that the canvas is attached, swap image to launch the first
      // factory call.
      await act(async () => {
        rerender({ image, colorspace: "srgb" });
      });
      await waitFor(() => {
        expect(result.current.editor).toBe(firstEditor);
      });

      // Change colorspace — this is a deps change, so the effect re-runs and
      // the previous editor is disposed.
      await act(async () => {
        rerender({ image, colorspace: "display-p3" });
      });
      await waitFor(() => {
        expect(result.current.editor).toBe(secondEditor);
      });

      expect(firstEditor.dispose).toHaveBeenCalledTimes(1);
      expect(createMiniGlEditorMock).toHaveBeenCalledTimes(2);
      expect(createMiniGlEditorMock.mock.calls[0]?.[0].colorspace).toBe("srgb");
      expect(createMiniGlEditorMock.mock.calls[1]?.[0].colorspace).toBe(
        "display-p3",
      );
    });
  });
});
