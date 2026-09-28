import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMatrixPreset } from "../filters";
import { adjustDefaultValue } from "./types";
import { resolveOutputSize, useImageEditorState } from "./use-image-editor-state";

// No image is loaded, so no renderer is created: this exercises the pure
// state/API layer only.
const setup = (options: Parameters<typeof useImageEditorState>[0] = {}) =>
  renderHook(() => useImageEditorState({ renderMode: "main", ...options }));

describe("useImageEditorState", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts idle with default params and tool", () => {
    const { result } = setup();
    expect(result.current.status).toBe("idle");
    expect(result.current.hasImage).toBe(false);
    expect(result.current.tool).toBe("adjust");
    expect(result.current.adjust.value).toEqual(adjustDefaultValue);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("merges a slider drag into one undo step", () => {
    const onParamsChange = vi.fn();
    const { result } = setup({ onParamsChange });
    for (const exposure of [0.1, 0.2, 0.3]) {
      act(() =>
        result.current.adjust.setLights({ ...result.current.adjust.value.lights, exposure }),
      );
    }
    expect(result.current.params.lights.exposure).toBe(0.3);
    expect(onParamsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ lights: expect.objectContaining({ exposure: 0.3 }) }),
    );
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.history.canUndo).toBe(true);
    act(() => result.current.history.undo());
    expect(result.current.params.lights.exposure).toBe(0);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("undo flushes a pending drag first", () => {
    const { result } = setup();
    act(() => result.current.adjust.setColors({ ...adjustDefaultValue.colors, saturation: 0.5 }));
    act(() => result.current.history.undo());
    expect(result.current.params.colors.saturation).toBe(0);
  });

  it("selects filters by preset, label or null", async () => {
    const custom = createMatrixPreset("sepia-ish", "browni");
    const { result } = setup({ filterPresets: [custom] });
    await act(() => result.current.filters.select("sepia-ish"));
    expect(result.current.filters.value.label).toBe("sepia-ish");
    expect(result.current.filters.value.strength).toBe(1);
    act(() => result.current.filters.setStrength(0));
    expect(result.current.params.filters.mix).toBe(-1);
    await act(() => result.current.filters.select(null));
    expect(result.current.filters.value.label).toBeNull();
    await expect(result.current.filters.select("nope")).rejects.toThrow(/Unknown filter/);
  });

  it("round-trips a recipe, resolving the filter preset", async () => {
    const { result } = setup({ filterPresets: [createMatrixPreset("kodak", "kodachrome")] });
    await act(() => result.current.filters.select("kodak"));
    act(() => result.current.adjust.setLights({ ...adjustDefaultValue.lights, contrast: 0.4 }));
    const recipe = result.current.recipes.current;
    expect(recipe).toMatchObject({ version: 1, lights: { contrast: 0.4 }, filters: { label: "kodak" } });

    act(() => result.current.resetAll());
    expect(result.current.recipes.current).toBeNull();

    await act(() => result.current.recipes.apply(recipe!));
    expect(result.current.params.lights.contrast).toBe(0.4);
    expect(result.current.params.filters.opt).toMatchObject({ label: "kodak", type: "MTX" });
  });

  it("supports a controlled tool", () => {
    const onToolChange = vi.fn();
    const { result } = setup({ tool: "curves", onToolChange });
    act(() => result.current.setTool("blur"));
    expect(onToolChange).toHaveBeenCalledWith("blur");
    expect(result.current.tool).toBe("curves");
  });

  it("stores geometry non-destructively and undoes it", () => {
    const { result } = setup();
    act(() => result.current.geometry.setStraighten(8));
    act(() => result.current.geometry.setPerspective({ y: 0.4 }));
    expect(result.current.params.geometry).toMatchObject({ straighten: 8, perspectiveY: 0.4 });
    act(() => result.current.history.undo());
    expect(result.current.params.geometry.perspectiveY).toBe(0);
    expect(result.current.params.geometry.straighten).toBe(8);
    act(() => result.current.geometry.reset());
    expect(result.current.geometry.isDefault).toBe(true);
  });

  it("clamps straighten to ±45° and perspective to ±1", () => {
    const { result } = setup();
    act(() => result.current.geometry.setStraighten(90));
    act(() => result.current.geometry.setPerspective({ x: 3 }));
    expect(result.current.params.geometry.straighten).toBe(45);
    expect(result.current.params.geometry.perspectiveX).toBe(1);
  });

  it("renders the whole image in the crop tool and the result elsewhere", () => {
    const { result } = setup({ defaultTool: "compose" });
    expect(result.current.geometry.view).toBe("full");
    expect(result.current.renderParams.geometry.$view).toBe("full");
    expect(result.current.params.geometry.$view).toBeUndefined();
    act(() => result.current.setTool("adjust"));
    expect(result.current.renderParams.geometry.$view).toBeUndefined();
  });

  it("round-trips geometry through recipes", async () => {
    const { result } = setup();
    act(() => result.current.geometry.rotate(1));
    act(() => result.current.geometry.setStraighten(-5));
    const recipe = result.current.recipes.current!;
    expect(recipe.geometry).toEqual({ quarterTurns: 1, straighten: -5 });
    act(() => result.current.resetAll());
    await act(() => result.current.recipes.apply(recipe));
    expect(result.current.params.geometry).toMatchObject({ quarterTurns: 1, straighten: -5 });
  });

  it("rejects export before an image is ready", async () => {
    const { result } = setup();
    await expect(result.current.exportImage()).rejects.toThrow(/not ready/);
  });
});

describe("resolveOutputSize (export resize)", () => {
  const crop = { width: 3000, height: 2000 };
  it("defaults to the crop at full resolution", () => {
    expect(resolveOutputSize(crop, {})).toEqual(crop);
  });
  it("keeps the ratio when one side is given", () => {
    expect(resolveOutputSize(crop, { width: 1200 })).toEqual({ width: 1200, height: 800 });
    expect(resolveOutputSize(crop, { height: 500 })).toEqual({ width: 750, height: 500 });
  });
  it("uses both sides when given and caps huge sizes", () => {
    expect(resolveOutputSize(crop, { width: 640, height: 640 })).toEqual({ width: 640, height: 640 });
    expect(resolveOutputSize(crop, { width: 100000 }).width).toBe(16384);
  });
});
