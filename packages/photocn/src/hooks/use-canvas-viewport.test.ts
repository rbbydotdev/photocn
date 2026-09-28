import { act, renderHook, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// The browser package wires real pointer/wheel listeners onto the supplied
// elements. Mock it so the hook can be exercised in happy-dom without dragging
// the actual pointer state machine into the suite. We keep the
// getTransformState/setTransformState pair functionally honest (they round-trip
// through element.style.transform) so the hook's "publish what's in the DOM"
// behaviour is observable.
vi.mock("../dom", () => {
  function getTransformState(el: HTMLElement) {
    const transform = el.style.transform || "";
    const translate = transform.match(/translate\((.*?)\)/)?.[1]?.split(",") ?? [
      "0",
      "0",
    ];
    const scale = transform.match(/scale\((.*?)\)/)?.[1]?.split(",")[0] ?? "1";
    const x = Number.parseFloat(translate[0] ?? "0");
    const y = Number.parseFloat(translate[1] ?? "0");
    const s = Number.parseFloat(scale);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      scale: Number.isFinite(s) ? s : 1,
    };
  }

  function setTransformState(
    el: HTMLElement,
    transform: { x: number; y: number; scale: number },
  ) {
    el.style.transform = `translate(${transform.x}px,${transform.y}px) scale(${transform.scale},${transform.scale})`;
  }

  const createPointerViewport = vi.fn(() => vi.fn());

  function subscribePointerViewportRefresh({
    viewport,
    content,
    onRefresh,
  }: {
    viewport: HTMLElement;
    content: HTMLElement;
    onRefresh: () => void;
  }) {
    let frame = 0;
    const queueRefresh = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        onRefresh();
      });
    };

    viewport.addEventListener("wheel", queueRefresh);
    viewport.addEventListener("pointermove", queueRefresh);
    content.addEventListener("pointermove", queueRefresh);
    viewport.addEventListener("pointerup", queueRefresh);
    content.addEventListener("pointerup", queueRefresh);

    return () => {
      viewport.removeEventListener("wheel", queueRefresh);
      viewport.removeEventListener("pointermove", queueRefresh);
      content.removeEventListener("pointermove", queueRefresh);
      viewport.removeEventListener("pointerup", queueRefresh);
      content.removeEventListener("pointerup", queueRefresh);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }

  return {
    createPointerViewport,
    getTransformState,
    setTransformState,
    subscribePointerViewportRefresh,
  };
});

// Imported after the mock so the hook picks up the stubs.
import {
  createPointerViewport,
  getTransformState,
  setTransformState,
  type TransformState,
} from "../dom";

import { useCanvasViewport } from "./use-canvas-viewport";

const createPointerViewportMock = vi.mocked(createPointerViewport);

function makeElements() {
  const viewport = document.createElement("div");
  const content = document.createElement("div");
  viewport.appendChild(content);
  document.body.appendChild(viewport);
  return { viewport, content };
}

beforeEach(() => {
  createPointerViewportMock.mockReset();
  createPointerViewportMock.mockImplementation(() => vi.fn());
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useCanvasViewport", () => {
  describe("initial state", () => {
    it("starts with the default identity transform when no override is supplied", () => {
      const { result } = renderHook(() => useCanvasViewport());

      expect(result.current.transform).toEqual({ x: 0, y: 0, scale: 1 });
      expect(result.current.isEnabled).toBe(true);
      expect(result.current.viewportRef.current).toBeNull();
      expect(result.current.contentRef.current).toBeNull();
    });

    it("exposes callable handlers in the result shape", () => {
      const { result } = renderHook(() => useCanvasViewport());

      expect(typeof result.current.refreshTransform).toBe("function");
      expect(typeof result.current.setTransform).toBe("function");
      expect(typeof result.current.resetTransform).toBe("function");
    });

    it("respects the enabled=false flag and skips wiring up pointer handlers", () => {
      const { viewport, content } = makeElements();

      renderHook(() =>
        useCanvasViewport({ viewport, content, enabled: false }),
      );

      expect(createPointerViewportMock).not.toHaveBeenCalled();
    });
  });

  describe("initialTransform", () => {
    it("uses a custom initial transform when provided", () => {
      const initial: TransformState = { x: 10, y: 20, scale: 2 };

      const { result } = renderHook(() =>
        useCanvasViewport({ initialTransform: initial }),
      );

      expect(result.current.transform).toEqual(initial);
    });

    it("writes the initial transform onto the viewport element on mount", async () => {
      const { viewport, content } = makeElements();
      const initial: TransformState = { x: 5, y: 7, scale: 3 };

      renderHook(() =>
        useCanvasViewport({ viewport, content, initialTransform: initial }),
      );

      await waitFor(() => {
        expect(getTransformState(viewport)).toEqual(initial);
      });
    });
  });

  describe("setTransform", () => {
    it("publishes the new transform on the hook state", () => {
      const { result } = renderHook(() => useCanvasViewport());

      const next: TransformState = { x: 100, y: 50, scale: 1.5 };
      act(() => {
        result.current.setTransform(next);
      });

      expect(result.current.transform).toEqual(next);
    });

    it("writes the transform onto the supplied viewport element", () => {
      const { viewport, content } = makeElements();

      const { result } = renderHook(() =>
        useCanvasViewport({ viewport, content }),
      );

      const next: TransformState = { x: 12, y: 34, scale: 1.25 };
      act(() => {
        result.current.setTransform(next);
      });

      expect(getTransformState(viewport)).toEqual(next);
      expect(result.current.transform).toEqual(next);
    });

    it("invokes onTransformChange whenever a transform is published", () => {
      const onTransformChange = vi.fn();

      const { result } = renderHook(() =>
        useCanvasViewport({ onTransformChange }),
      );

      // First call is the mount-time identity publish.
      const callsBefore = onTransformChange.mock.calls.length;

      const next: TransformState = { x: 1, y: 2, scale: 0.5 };
      act(() => {
        result.current.setTransform(next);
      });

      expect(onTransformChange.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(onTransformChange).toHaveBeenLastCalledWith(next);
    });
  });

  describe("resetTransform", () => {
    it("returns the transform back to the initial value", () => {
      const initial: TransformState = { x: 0, y: 0, scale: 1 };

      const { result } = renderHook(() =>
        useCanvasViewport({ initialTransform: initial }),
      );

      act(() => {
        result.current.setTransform({ x: 50, y: 75, scale: 2 });
      });
      expect(result.current.transform).toEqual({ x: 50, y: 75, scale: 2 });

      act(() => {
        result.current.resetTransform();
      });

      expect(result.current.transform).toEqual(initial);
    });

    it("uses the configured initialTransform, not a hardcoded identity", () => {
      const initial: TransformState = { x: -10, y: 5, scale: 2 };

      const { result } = renderHook(() =>
        useCanvasViewport({ initialTransform: initial }),
      );

      act(() => {
        result.current.setTransform({ x: 200, y: 200, scale: 3 });
      });

      act(() => {
        result.current.resetTransform();
      });

      expect(result.current.transform).toEqual(initial);
    });
  });

  describe("refreshTransform", () => {
    it("reads the current transform off the supplied viewport element", () => {
      const { viewport, content } = makeElements();

      const { result } = renderHook(() =>
        useCanvasViewport({ viewport, content }),
      );

      // Simulate something else (the pointer-viewport library) writing the
      // transform directly to the DOM.
      setTransformState(viewport, { x: 99, y: 88, scale: 0.75 });

      let returned: TransformState | undefined;
      act(() => {
        returned = result.current.refreshTransform();
      });

      expect(returned).toEqual({ x: 99, y: 88, scale: 0.75 });
      expect(result.current.transform).toEqual({ x: 99, y: 88, scale: 0.75 });
    });

    it("falls back to the initial transform when no element is attached", () => {
      const initial: TransformState = { x: 1, y: 2, scale: 1.5 };

      const { result } = renderHook(() =>
        useCanvasViewport({ initialTransform: initial }),
      );

      let returned: TransformState | undefined;
      act(() => {
        returned = result.current.refreshTransform();
      });

      expect(returned).toEqual(initial);
    });
  });

  describe("pointer-viewport wiring", () => {
    it("creates a pointer viewport when enabled and elements are supplied", () => {
      const { viewport, content } = makeElements();

      renderHook(() => useCanvasViewport({ viewport, content }));

      expect(createPointerViewportMock).toHaveBeenCalledTimes(1);
      const args = createPointerViewportMock.mock.calls[0]![0];
      expect(args.viewport).toBe(viewport);
      expect(args.content).toBe(content);
    });

    it("forwards factor/minScale/maxScale options to createPointerViewport", () => {
      const { viewport, content } = makeElements();

      renderHook(() =>
        useCanvasViewport({
          viewport,
          content,
          factor: 0.2,
          minScale: 0.5,
          maxScale: 4,
        }),
      );

      expect(createPointerViewportMock).toHaveBeenCalledTimes(1);
      const args = createPointerViewportMock.mock.calls[0]![0];
      expect(args.factor).toBe(0.2);
      expect(args.minScale).toBe(0.5);
      expect(args.maxScale).toBe(4);
    });

    it("disposes the pointer viewport on unmount", () => {
      const dispose = vi.fn();
      createPointerViewportMock.mockImplementation(() => dispose);
      const { viewport, content } = makeElements();

      const { unmount } = renderHook(() =>
        useCanvasViewport({ viewport, content }),
      );

      expect(dispose).not.toHaveBeenCalled();
      unmount();
      expect(dispose).toHaveBeenCalledTimes(1);
    });

    it("queues a refresh on viewport pointer events", async () => {
      const { viewport, content } = makeElements();

      // Use a deterministic synchronous rAF so we can observe the publish.
      const rafSpy = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb: FrameRequestCallback) => {
          cb(0);
          return 1 as unknown as number;
        });

      const { result } = renderHook(() =>
        useCanvasViewport({ viewport, content }),
      );

      // Simulate the pointer-viewport library writing a transform mid-drag.
      setTransformState(viewport, { x: 25, y: 40, scale: 1.1 });

      act(() => {
        viewport.dispatchEvent(
          new Event("pointermove", { bubbles: true }),
        );
      });

      await waitFor(() => {
        expect(result.current.transform).toEqual({ x: 25, y: 40, scale: 1.1 });
      });

      rafSpy.mockRestore();
    });
  });

  describe("handler identity stability", () => {
    it("keeps setTransform/resetTransform/refreshTransform stable across no-op re-renders", () => {
      const { result, rerender } = renderHook(() => useCanvasViewport());

      const setBefore = result.current.setTransform;
      const resetBefore = result.current.resetTransform;
      const refreshBefore = result.current.refreshTransform;

      rerender();

      expect(result.current.setTransform).toBe(setBefore);
      expect(result.current.resetTransform).toBe(resetBefore);
      expect(result.current.refreshTransform).toBe(refreshBefore);
    });
  });
});
