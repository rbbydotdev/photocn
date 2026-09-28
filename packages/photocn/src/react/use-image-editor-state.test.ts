import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMatrixPreset } from "../filters";
import { adjustDefaultValue } from "./types";
import { useImageEditorState } from "./use-image-editor-state";

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

  it("rotates the canvas in quarter turns and resets composition", () => {
    const { result } = setup();
    act(() => result.current.crop.rotate(90));
    expect(result.current.crop.canvasAngle).toBe(90);
    act(() => result.current.crop.reset());
    expect(result.current.crop.canvasAngle).toBe(0);
  });

  it("rejects export before an image is ready", async () => {
    const { result } = setup();
    await expect(result.current.exportImage()).rejects.toThrow(/not ready/);
  });
});
