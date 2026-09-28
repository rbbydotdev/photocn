import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createEditorParams,
  type EditorParams,
} from "..";

import { useEditorHistory } from "./use-editor-history";

describe("useEditorHistory", () => {
  describe("patch & undo basics", () => {
    it("starts with default params and no undo/redo available", () => {
      const { result } = renderHook(() => useEditorHistory());
      expect(result.current.params).toEqual(createEditorParams());
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it("non-transient patch updates params and enables undo", () => {
      const { result } = renderHook(() => useEditorHistory());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });

      expect(result.current.params.lights.exposure).toBe(0.5);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("undo restores previous params and enables redo", () => {
      const { result } = renderHook(() => useEditorHistory());
      const initial = createEditorParams();

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.params).toEqual(initial);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it("redo re-applies the patch and re-enables undo", () => {
      const { result } = renderHook(() => useEditorHistory());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });

      expect(result.current.params.lights.exposure).toBe(0.5);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("a new patch after an undo clears the future stack", () => {
      const { result } = renderHook(() => useEditorHistory());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });
      act(() => {
        result.current.undo();
      });
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.patchSection("colors", { saturation: 0.25 });
      });

      expect(result.current.canRedo).toBe(false);
      expect(result.current.params.colors.saturation).toBe(0.25);
    });
  });

  describe("transient batching", () => {
    it("first transient patch sets canUndo via pendingBaseline without pushing past", () => {
      const { result } = renderHook(() => useEditorHistory());

      act(() => {
        result.current.patchSection(
          "lights",
          { exposure: 0.1 },
          { transient: true },
        );
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.params.lights.exposure).toBe(0.1);

      act(() => {
        result.current.commit();
      });

      // After commit there should be one undo entry; undoing returns to baseline.
      act(() => {
        result.current.undo();
      });
      expect(result.current.params.lights.exposure).toBe(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it("multiple transient patches coalesce to a single undo entry", () => {
      const { result } = renderHook(() => useEditorHistory());

      act(() => {
        result.current.patchSection(
          "lights",
          { exposure: 0.1 },
          { transient: true },
        );
      });
      act(() => {
        result.current.patchSection(
          "lights",
          { exposure: 0.4 },
          { transient: true },
        );
      });
      act(() => {
        result.current.patchSection(
          "lights",
          { exposure: 0.7 },
          { transient: true },
        );
      });
      act(() => {
        result.current.commit();
      });

      expect(result.current.params.lights.exposure).toBe(0.7);

      act(() => {
        result.current.undo();
      });

      expect(result.current.params.lights.exposure).toBe(0);
      expect(result.current.canUndo).toBe(false);
    });

    it("undo while transient pending restores the baseline and clears the batch", () => {
      const { result } = renderHook(() => useEditorHistory());

      // Establish a non-transient state first to populate past.
      act(() => {
        result.current.patchSection("colors", { saturation: 0.2 });
      });
      const afterFirst = result.current.params;
      expect(result.current.canUndo).toBe(true);

      // Begin a transient batch (slider drag).
      act(() => {
        result.current.patchSection(
          "lights",
          { exposure: 0.3 },
          { transient: true },
        );
      });
      act(() => {
        result.current.patchSection(
          "lights",
          { exposure: 0.6 },
          { transient: true },
        );
      });

      // Undo without committing — should restore the pending baseline.
      act(() => {
        result.current.undo();
      });

      expect(result.current.params).toEqual(afterFirst);
      // canUndo now reflects only the past stack (the earlier saturation patch).
      expect(result.current.canUndo).toBe(true);

      // A second undo unwinds the saturation patch.
      act(() => {
        result.current.undo();
      });
      expect(result.current.params).toEqual(createEditorParams());
      expect(result.current.canUndo).toBe(false);
    });

    it("non-transient patch while transient pending uses the pending baseline as the undo target", () => {
      const { result } = renderHook(() => useEditorHistory());

      act(() => {
        result.current.patchSection(
          "lights",
          { exposure: 0.3 },
          { transient: true },
        );
      });
      act(() => {
        result.current.patchSection(
          "lights",
          { exposure: 0.6 },
          { transient: true },
        );
      });
      // Non-transient patch flushes the pending baseline onto past and applies the patch.
      act(() => {
        result.current.patchSection("colors", { saturation: 0.5 });
      });

      expect(result.current.params.lights.exposure).toBe(0.6);
      expect(result.current.params.colors.saturation).toBe(0.5);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      // Undo restores the pre-transient baseline (defaults), discarding the
      // entire transient batch and the non-transient patch in one step.
      act(() => {
        result.current.undo();
      });
      expect(result.current.params).toEqual(createEditorParams());
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });
  });

  describe("reset and replace", () => {
    it("reset restores defaults and pushes a history entry", () => {
      const { result } = renderHook(() => useEditorHistory());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.5 });
      });
      act(() => {
        result.current.patchSection("colors", { saturation: 0.4 });
      });
      const preReset = result.current.params;

      act(() => {
        result.current.reset();
      });
      expect(result.current.params).toEqual(createEditorParams());
      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.undo();
      });
      expect(result.current.params).toEqual(preReset);
    });

    it("setParams replaces wholesale and pushes a history entry", () => {
      const { result } = renderHook(() => useEditorHistory());

      act(() => {
        result.current.patchSection("lights", { exposure: 0.2 });
      });
      const prior = result.current.params;

      const custom: EditorParams = createEditorParams();
      custom.lights.exposure = 0.9;
      custom.colors.saturation = -0.5;

      act(() => {
        result.current.setParams(custom);
      });

      expect(result.current.params.lights.exposure).toBe(0.9);
      expect(result.current.params.colors.saturation).toBe(-0.5);
      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.undo();
      });
      expect(result.current.params).toEqual(prior);
    });
  });

  describe("setSectionSkipped", () => {
    it("flips $skip and pushes a history entry, undo restores prior value", () => {
      const { result } = renderHook(() => useEditorHistory());
      expect(result.current.params.blur.$skip).toBeUndefined();

      act(() => {
        result.current.setSectionSkipped("blur", true);
      });

      expect(result.current.params.blur.$skip).toBe(true);
      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.undo();
      });
      expect(result.current.params.blur.$skip).toBeUndefined();
    });
  });

  describe("limit cap", () => {
    it("drops the oldest history entries beyond the limit", () => {
      const { result } = renderHook(() => useEditorHistory({ limit: 3 }));

      // Apply 5 non-transient patches: exposure 0 -> 0.1 -> 0.2 -> 0.3 -> 0.4 -> 0.5
      // After each patch the prior state is pushed onto past. Past, capped at 3,
      // retains only the three most recent baselines: [0.2, 0.3, 0.4].
      for (let i = 1; i <= 5; i++) {
        const value = i / 10;
        act(() => {
          result.current.patchSection("lights", { exposure: value });
        });
      }

      expect(result.current.params.lights.exposure).toBe(0.5);
      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.undo();
      });
      expect(result.current.params.lights.exposure).toBe(0.4);

      act(() => {
        result.current.undo();
      });
      expect(result.current.params.lights.exposure).toBe(0.3);

      act(() => {
        result.current.undo();
      });
      expect(result.current.params.lights.exposure).toBe(0.2);
      expect(result.current.canUndo).toBe(false);

      // Two further undos are no-ops because the oldest baselines were dropped.
      act(() => {
        result.current.undo();
      });
      expect(result.current.params.lights.exposure).toBe(0.2);

      act(() => {
        result.current.undo();
      });
      expect(result.current.params.lights.exposure).toBe(0.2);
    });
  });

  describe("no-op behavior", () => {
    it("commit with no pending baseline is a no-op", () => {
      const { result } = renderHook(() => useEditorHistory());
      const before = result.current.params;

      act(() => {
        result.current.commit();
      });

      expect(result.current.params).toBe(before);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it("undo with empty past and no pending baseline is a no-op", () => {
      const { result } = renderHook(() => useEditorHistory());
      const before = result.current.params;

      act(() => {
        result.current.undo();
      });

      expect(result.current.params).toBe(before);
      expect(result.current.canUndo).toBe(false);
    });

    it("redo with empty future is a no-op", () => {
      const { result } = renderHook(() => useEditorHistory());
      const before = result.current.params;

      act(() => {
        result.current.redo();
      });

      expect(result.current.params).toBe(before);
      expect(result.current.canRedo).toBe(false);
    });
  });
});
