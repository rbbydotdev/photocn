/**
 * End-to-end-ish integration test for the crop → undo → reset flow.
 *
 * Wires `useEditorHistory` and `useRenderPipeline` together (the way the
 * workbench does) with a tracked renderer that mirrors mini-gl's `crop` /
 * `resetCrop` semantics. Verifies that:
 *   - committing a crop calls `renderer.crop` with the right rect
 *   - undo calls `renderer.resetCrop`
 *   - reset() also calls `resetCrop`
 *   - changing crop rects calls reset+crop
 *
 * This is the regression net for the "undo doesn't undo crop" / "reset doesn't
 * reset crop" bugs: if reconciliation breaks again, these tests fail.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createEditorParams,
  type CropBox,
  type EditorParams,
  type EditorRenderer,
  type LoadableImage,
} from "..";

import { useEditorHistory } from "./use-editor-history";
import { useRenderPipeline } from "./use-render-pipeline";

interface TrackedRenderer extends EditorRenderer {
  cropCalls: CropBox[];
  resetCropCalls: number;
}

/**
 * Renderer that mirrors mini-gl's `appliedCrop` state so the render
 * pipeline's reconciliation sees a realistic state machine.
 */
function createTrackedRenderer(width = 1000, height = 500): TrackedRenderer {
  const state: { applied?: CropBox } = {};
  const renderer: TrackedRenderer = {
    width,
    height,
    img: {} as CanvasImageSource,
    gl: { canvas: { width, height } },
    cropCalls: [],
    resetCropCalls: 0,
    get appliedCrop() {
      return state.applied;
    },
    loadImage: vi.fn<(image?: LoadableImage) => void>(),
    resetCrop: vi.fn(() => {
      state.applied = undefined;
      renderer.resetCropCalls += 1;
    }),
    readPixels: vi.fn(() => new Uint8Array(width * height * 4)),
    filterMatrix: vi.fn(),
    filterPerspective: vi.fn(),
    crop: vi.fn((rect: CropBox) => {
      state.applied = { ...rect };
      renderer.cropCalls.push({ ...rect });
    }),
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
  return renderer;
}

/** Mirrors `commitPatchSections` in the workbench. */
function withAppliedCrop(params: EditorParams, cropBox: CropBox): EditorParams {
  const next = createEditorParams();
  for (const key of Object.keys(next) as Array<keyof EditorParams>) {
    Object.assign(next[key] as object, params[key]);
  }
  Object.assign(next.crop, {
    appliedCrop: cropBox,
    currentcrop: 0,
    glcrop: 0,
    ar: 0,
    arindex: 0,
  });
  Object.assign(next.trs, { angle: 0, scale: 0, fliph: 0, flipv: 0 });
  return next;
}

interface HookProps {
  renderer: TrackedRenderer;
}

function setupCropFlow({ renderer }: HookProps) {
  return renderHook(() => {
    const history = useEditorHistory();
    const pipeline = useRenderPipeline({
      renderer,
      params: history.params,
      autoRender: true,
    });
    return { history, pipeline };
  });
}

describe("crop → undo → reset flow", () => {
  const cropBox: CropBox = { left: 100, top: 50, width: 400, height: 300 };

  it("commits a crop: renderer.crop is called with the rect", () => {
    const renderer = createTrackedRenderer();
    const { result } = setupCropFlow({ renderer });

    expect(renderer.cropCalls).toHaveLength(0);

    act(() => {
      result.current.history.setParams(
        withAppliedCrop(result.current.history.params, cropBox),
      );
    });

    expect(renderer.cropCalls).toEqual([cropBox]);
    expect(renderer.appliedCrop).toEqual(cropBox);
    expect(renderer.resetCropCalls).toBe(0);
  });

  it("undo after a crop: renderer.resetCrop is called and the renderer becomes uncropped", () => {
    const renderer = createTrackedRenderer();
    const { result } = setupCropFlow({ renderer });

    act(() => {
      result.current.history.setParams(
        withAppliedCrop(result.current.history.params, cropBox),
      );
    });
    expect(renderer.appliedCrop).toEqual(cropBox);

    act(() => {
      result.current.history.undo();
    });

    expect(renderer.resetCropCalls).toBeGreaterThanOrEqual(1);
    expect(renderer.appliedCrop).toBeUndefined();
  });

  it("redo after undo: the same crop is re-applied", () => {
    const renderer = createTrackedRenderer();
    const { result } = setupCropFlow({ renderer });

    act(() => {
      result.current.history.setParams(
        withAppliedCrop(result.current.history.params, cropBox),
      );
    });
    act(() => {
      result.current.history.undo();
    });
    expect(renderer.appliedCrop).toBeUndefined();

    act(() => {
      result.current.history.redo();
    });

    expect(renderer.appliedCrop).toEqual(cropBox);
    // crop was called twice total (apply + redo).
    expect(renderer.cropCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("changing crop rect: renderer is reset then re-cropped to the new rect", () => {
    const renderer = createTrackedRenderer();
    const { result } = setupCropFlow({ renderer });

    act(() => {
      result.current.history.setParams(
        withAppliedCrop(result.current.history.params, cropBox),
      );
    });

    const newCrop: CropBox = { left: 200, top: 100, width: 200, height: 200 };
    act(() => {
      result.current.history.setParams(
        withAppliedCrop(result.current.history.params, newCrop),
      );
    });

    expect(renderer.resetCropCalls).toBeGreaterThanOrEqual(1);
    expect(renderer.appliedCrop).toEqual(newCrop);
    expect(renderer.cropCalls).toContainEqual(newCrop);
  });

  it("reset() after a crop: renderer.resetCrop is called (regression for 'reset is broken')", () => {
    const renderer = createTrackedRenderer();
    const { result } = setupCropFlow({ renderer });

    act(() => {
      result.current.history.setParams(
        withAppliedCrop(result.current.history.params, cropBox),
      );
    });
    expect(renderer.appliedCrop).toEqual(cropBox);

    act(() => {
      result.current.history.reset();
    });

    expect(renderer.appliedCrop).toBeUndefined();
    expect(renderer.resetCropCalls).toBeGreaterThanOrEqual(1);
  });

  it("idempotent renders: re-rendering with the same applied crop does not re-call renderer.crop", () => {
    const renderer = createTrackedRenderer();
    const { result, rerender } = setupCropFlow({ renderer });

    act(() => {
      result.current.history.setParams(
        withAppliedCrop(result.current.history.params, cropBox),
      );
    });
    const cropCallsAfterApply = renderer.cropCalls.length;

    // Force-rerender the hooks (params identity unchanged → autoRender will
    // not fire, but explicit pipeline.render() should still be safe).
    rerender();
    act(() => {
      result.current.pipeline.render();
    });

    expect(renderer.cropCalls.length).toBe(cropCallsAfterApply);
  });
});
