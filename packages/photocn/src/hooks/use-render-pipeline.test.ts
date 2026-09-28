import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createEditorParams,
  type EditorParams,
  type EditorRenderer,
  type LoadableImage,
} from "..";

import { useRenderPipeline } from "./use-render-pipeline";

function createMockRenderer(width = 800, height = 600): EditorRenderer {
  const stubImage = {} as CanvasImageSource;
  return {
    width,
    height,
    img: stubImage,
    gl: { canvas: { width, height } },
    loadImage: vi.fn<(image?: LoadableImage) => void>(),
    readPixels: vi.fn(() => new Uint8Array(width * height * 4)),
    loadGeometry: vi.fn(),
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
  };
}

describe("useRenderPipeline", () => {
  describe("canRender", () => {
    it("is false when renderer is null", () => {
      const { result } = renderHook(() =>
        useRenderPipeline({ renderer: null, params: createEditorParams() }),
      );
      expect(result.current.canRender).toBe(false);
    });

    it("is false when renderer is undefined", () => {
      const { result } = renderHook(() =>
        useRenderPipeline({ params: createEditorParams() }),
      );
      expect(result.current.canRender).toBe(false);
    });

    it("is false when params is null even if renderer is supplied", () => {
      const renderer = createMockRenderer();
      const { result } = renderHook(() =>
        useRenderPipeline({ renderer, params: null }),
      );
      expect(result.current.canRender).toBe(false);
    });

    it("is true once a renderer and params are supplied", () => {
      const renderer = createMockRenderer();
      const { result } = renderHook(() =>
        useRenderPipeline({ renderer, params: createEditorParams() }),
      );
      expect(result.current.canRender).toBe(true);
    });

    it("flips to true when renderer becomes available across rerenders", () => {
      const params = createEditorParams();
      const { result, rerender } = renderHook(
        ({ renderer }: { renderer: EditorRenderer | null }) =>
          useRenderPipeline({ renderer, params }),
        { initialProps: { renderer: null as EditorRenderer | null } },
      );

      expect(result.current.canRender).toBe(false);

      const renderer = createMockRenderer();
      rerender({ renderer });

      expect(result.current.canRender).toBe(true);
    });
  });

  describe("render()", () => {
    it("invokes loadGeometry, paintCanvas, and filterAdjustments with default params", () => {
      const renderer = createMockRenderer();
      const { result } = renderHook(() =>
        useRenderPipeline({ renderer, params: createEditorParams() }),
      );

      act(() => {
        result.current.render();
      });

      expect(renderer.loadGeometry).toHaveBeenCalled();
      expect(renderer.paintCanvas).toHaveBeenCalled();
      expect(renderer.filterAdjustments).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when no params are available", () => {
      const renderer = createMockRenderer();
      const { result } = renderHook(() =>
        useRenderPipeline({ renderer, params: null }),
      );

      act(() => {
        result.current.render();
      });

      expect(renderer.loadGeometry).not.toHaveBeenCalled();
      expect(renderer.paintCanvas).not.toHaveBeenCalled();
    });

    it("uses options.params to override the captured params for that call", () => {
      const renderer = createMockRenderer();
      const params = createEditorParams();
      const { result } = renderHook(() =>
        useRenderPipeline({ renderer, params }),
      );

      const customParams: EditorParams = createEditorParams();
      customParams.lights.bloom = 0.5;

      act(() => {
        result.current.render({ params: customParams });
      });

      expect(renderer.filterBloom).toHaveBeenCalledWith(0.5);
    });

    it("does not pass through filterBloom when captured params have no bloom and no override is supplied", () => {
      const renderer = createMockRenderer();
      const { result } = renderHook(() =>
        useRenderPipeline({ renderer, params: createEditorParams() }),
      );

      act(() => {
        result.current.render();
      });

      expect(renderer.filterBloom).not.toHaveBeenCalled();
    });

    it("fires onHistogramUpdate after rendering", () => {
      const renderer = createMockRenderer();
      const onHistogramUpdate = vi.fn();
      const { result } = renderHook(() =>
        useRenderPipeline({
          renderer,
          params: createEditorParams(),
          onHistogramUpdate,
        }),
      );

      act(() => {
        result.current.render();
      });

      expect(onHistogramUpdate).toHaveBeenCalledTimes(1);
    });

  });

  describe("render identity", () => {
    it("is stable across re-renders that don't change inputs", () => {
      const renderer = createMockRenderer();
      const params = createEditorParams();
      const { result, rerender } = renderHook(() =>
        useRenderPipeline({ renderer, params }),
      );

      const before = result.current.render;
      rerender();

      expect(Object.is(result.current.render, before)).toBe(true);
    });

    it("keeps identity when renderer changes (reads the latest via ref)", () => {
      const params = createEditorParams();
      const { result, rerender } = renderHook(
        ({ renderer }: { renderer: EditorRenderer }) =>
          useRenderPipeline({ renderer, params }),
        { initialProps: { renderer: createMockRenderer() } },
      );

      const before = result.current.render;
      rerender({ renderer: createMockRenderer() });

      expect(result.current.render).toBe(before);
    });
  });

  describe("renderer becoming null mid-session", () => {
    it("makes render() a safe no-op without throwing", () => {
      const params = createEditorParams();
      const { result, rerender } = renderHook(
        ({ renderer }: { renderer: EditorRenderer | null }) =>
          useRenderPipeline({ renderer, params }),
        { initialProps: { renderer: createMockRenderer() as EditorRenderer | null } },
      );

      // Drop the renderer.
      rerender({ renderer: null });

      expect(() => {
        act(() => {
          result.current.render();
        });
      }).not.toThrow();
    });
  });

  describe("autoRender", () => {
    it("invokes the pipeline once on mount when autoRender is true", () => {
      const renderer = createMockRenderer();
      renderHook(() =>
        useRenderPipeline({
          renderer,
          params: createEditorParams(),
          autoRender: true,
        }),
      );

      expect(renderer.loadGeometry).toHaveBeenCalledTimes(1);
      expect(renderer.paintCanvas).toHaveBeenCalledTimes(1);
    });

    it("does not invoke the pipeline on mount when autoRender is false (default)", () => {
      const renderer = createMockRenderer();
      renderHook(() =>
        useRenderPipeline({ renderer, params: createEditorParams() }),
      );

      expect(renderer.loadGeometry).not.toHaveBeenCalled();
      expect(renderer.paintCanvas).not.toHaveBeenCalled();
    });
  });
});
