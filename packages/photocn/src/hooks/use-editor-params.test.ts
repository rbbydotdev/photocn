import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createEditorParams,
  type EditorParams,
} from "..";

import { useEditorParams } from "./use-editor-params";

describe("useEditorParams", () => {
  describe("initial state", () => {
    it("defaults to createEditorParams() when no initialParams given", () => {
      const { result } = renderHook(() => useEditorParams());

      expect(result.current.params).toEqual(createEditorParams());
    });

    it("honors initialParams when provided", () => {
      const initial: EditorParams = createEditorParams();
      initial.lights.exposure = 0.42;
      initial.colors.saturation = -0.3;

      const { result } = renderHook(() => useEditorParams(initial));

      expect(result.current.params.lights.exposure).toBe(0.42);
      expect(result.current.params.colors.saturation).toBe(-0.3);
    });
  });

  describe("patchSection", () => {
    it("updates the targeted section without touching others", () => {
      const { result } = renderHook(() => useEditorParams());
      const before = result.current.params;

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });

      expect(result.current.params.lights.exposure).toBe(0.5);
      // Other sections remain at defaults.
      expect(result.current.params.colors).toEqual(before.colors);
      expect(result.current.params.effects).toEqual(before.effects);
      expect(result.current.params.trs).toEqual(before.trs);
    });

    it("preserves untouched fields within the same section", () => {
      const { result } = renderHook(() => useEditorParams());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });

      // Only exposure changes; other lights fields stay at their defaults.
      expect(result.current.params.lights.exposure).toBe(0.5);
      expect(result.current.params.lights.brightness).toBe(0);
      expect(result.current.params.lights.contrast).toBe(0);
      expect(result.current.params.lights.shadows).toBe(0);
      expect(result.current.params.lights.highlights).toBe(0);
    });

    it("multiple section patches don't cross-contaminate", () => {
      const { result } = renderHook(() => useEditorParams());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });
      act(() => {
        result.current.patchSection("colors", { saturation: 0.25 });
      });
      act(() => {
        result.current.patchSection("effects", { vignette: 0.1 });
      });

      expect(result.current.params.lights.exposure).toBe(0.5);
      expect(result.current.params.colors.saturation).toBe(0.25);
      expect(result.current.params.effects.vignette).toBe(0.1);
      // Earlier patches survive.
      expect(result.current.params.lights.brightness).toBe(0);
      expect(result.current.params.colors.temperature).toBe(0);
    });

    it("returns a new params reference on each patch", () => {
      const { result } = renderHook(() => useEditorParams());
      const before = result.current.params;

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });

      expect(result.current.params).not.toBe(before);
    });
  });

  describe("reset", () => {
    it("restores defaults after patches", () => {
      const { result } = renderHook(() => useEditorParams());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });
      act(() => {
        result.current.patchSection("colors", { saturation: 0.4 });
      });
      act(() => {
        result.current.reset();
      });

      expect(result.current.params).toEqual(createEditorParams());
    });

    it("reset on an already-default state still yields defaults", () => {
      const { result } = renderHook(() => useEditorParams());

      act(() => {
        result.current.reset();
      });

      expect(result.current.params).toEqual(createEditorParams());
    });
  });

  describe("setSkipped", () => {
    it("sets $skip=true on a skippable section", () => {
      const { result } = renderHook(() => useEditorParams());
      expect(result.current.params.blur.$skip).toBeUndefined();

      act(() => {
        result.current.setSkipped("blur", true);
      });

      expect(result.current.params.blur.$skip).toBe(true);
    });

    it("sets $skip=false to unskip", () => {
      const { result } = renderHook(() => useEditorParams());

      act(() => {
        result.current.setSkipped("lights", true);
      });
      expect(result.current.params.lights.$skip).toBe(true);

      act(() => {
        result.current.setSkipped("lights", false);
      });
      expect(result.current.params.lights.$skip).toBe(false);
    });

    it("doesn't disturb section field values", () => {
      const { result } = renderHook(() => useEditorParams());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });
      act(() => {
        result.current.setSkipped("lights", true);
      });

      expect(result.current.params.lights.exposure).toBe(0.5);
      expect(result.current.params.lights.$skip).toBe(true);
    });
  });

  describe("callback identity", () => {
    it("keeps reset / patchSection / setSkipped stable across renders", () => {
      const { result, rerender } = renderHook(() => useEditorParams());
      const before = {
        reset: result.current.reset,
        patchSection: result.current.patchSection,
        setSkipped: result.current.setSkipped,
      };

      rerender();

      expect(result.current.reset).toBe(before.reset);
      expect(result.current.patchSection).toBe(before.patchSection);
      expect(result.current.setSkipped).toBe(before.setSkipped);
    });
  });
});
