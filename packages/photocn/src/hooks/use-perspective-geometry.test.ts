import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  resetPerspectiveQuad,
  type PerspectiveQuad,
  type PerspectiveState,
  type Size,
} from "..";

import {
  usePerspectiveGeometry,
  type PerspectiveGeometryChange,
  type UsePerspectiveGeometryOptions,
} from "./use-perspective-geometry";

const size: Size = { width: 1000, height: 800 };

function renderPerspectiveHook(
  options: Partial<UsePerspectiveGeometryOptions> = {},
) {
  const onStateChange = vi.fn<(change: PerspectiveGeometryChange) => void>();

  const hook = renderHook(() =>
    usePerspectiveGeometry({
      size,
      onStateChange,
      ...options,
    }),
  );

  return { ...hook, onStateChange };
}

describe("usePerspectiveGeometry", () => {
  describe("initial state", () => {
    it("returns the expected shape and an unmodified default state", () => {
      const { result } = renderPerspectiveHook();

      // Default empty state -> phase "before", quad falls back to default quad.
      expect(result.current.phase).toBe("before");
      expect(result.current.state).toEqual({
        before: 0,
        after: 0,
        modified: 0,
      } satisfies PerspectiveState);
      expect(result.current.quad).toEqual(resetPerspectiveQuad());
      expect(result.current.activePointIndex).toBeNull();
      expect(result.current.isDragging).toBe(false);

      // Public API surface.
      expect(typeof result.current.setState).toBe("function");
      expect(typeof result.current.setQuad).toBe("function");
      expect(typeof result.current.setPoint).toBe("function");
      expect(typeof result.current.setPixelPoint).toBe("function");
      expect(typeof result.current.hitTestPoint).toBe("function");
      expect(typeof result.current.startDrag).toBe("function");
      expect(typeof result.current.moveDrag).toBe("function");
      expect(typeof result.current.moveDragPixel).toBe("function");
      expect(typeof result.current.endDrag).toBe("function");
      expect(typeof result.current.resetQuad).toBe("function");
      expect(typeof result.current.reset).toBe("function");
      expect(typeof result.current.lock).toBe("function");
      expect(typeof result.current.unlock).toBe("function");
    });

    it("computes pixelQuad from the default quad and size", () => {
      const { result } = renderPerspectiveHook();

      // Default normalized quad is [0.25,0.25],[0.75,0.25],[0.75,0.75],[0.25,0.75].
      expect(result.current.pixelQuad).toEqual([
        [250, 200],
        [750, 200],
        [750, 600],
        [250, 600],
      ]);
    });
  });

  describe("setPoint", () => {
    it("updates one corner immutably and leaves the others untouched", () => {
      const { result } = renderPerspectiveHook();
      const before = result.current.quad;

      act(() => {
        result.current.setPoint(0, [0.1, 0.1]);
      });

      expect(result.current.quad[0]).toEqual([0.1, 0.1]);
      expect(result.current.quad[1]).toEqual(before[1]);
      expect(result.current.quad[2]).toEqual(before[2]);
      expect(result.current.quad[3]).toEqual(before[3]);
    });

    it("flips the modified flag on the first change", () => {
      const { result } = renderPerspectiveHook();
      expect(result.current.state.modified).toBe(0);

      act(() => {
        result.current.setPoint(2, [0.6, 0.6], { modified: true });
      });

      expect(result.current.state.modified).toBe(1);
    });

    it("invokes onStateChange with the right payload", () => {
      const { result, onStateChange } = renderPerspectiveHook();

      act(() => {
        result.current.setPoint(1, [0.8, 0.2]);
      });

      expect(onStateChange).toHaveBeenCalledTimes(1);
      const change = onStateChange.mock.calls[0]![0];
      expect(change.pointIndex).toBe(1);
      expect(change.phase).toBe("before");
      expect(change.quad[1]).toEqual([0.8, 0.2]);
      expect(change.state.before).toBeTruthy();
    });
  });

  describe("setPixelPoint round-trip", () => {
    it("converts pixel coordinates back into normalized space", () => {
      const { result } = renderPerspectiveHook();

      // (500, 400) on a 1000x800 surface -> (0.5, 0.5) normalized.
      act(() => {
        result.current.setPixelPoint(0, [500, 400]);
      });

      expect(result.current.quad[0][0]).toBeCloseTo(0.5, 10);
      expect(result.current.quad[0][1]).toBeCloseTo(0.5, 10);
      // pixelQuad reflects the same pixel position.
      expect(result.current.pixelQuad[0][0]).toBeCloseTo(500, 6);
      expect(result.current.pixelQuad[0][1]).toBeCloseTo(400, 6);
    });
  });

  describe("setQuad", () => {
    it("replaces the entire quad and bumps modified", () => {
      const { result } = renderPerspectiveHook();
      const nextQuad: PerspectiveQuad = [
        [0.1, 0.1],
        [0.9, 0.1],
        [0.9, 0.9],
        [0.1, 0.9],
      ];

      act(() => {
        result.current.setQuad(nextQuad, { modified: true });
      });

      expect(result.current.quad).toEqual(nextQuad);
      expect(result.current.state.modified).toBe(1);
    });
  });

  describe("drag flow", () => {
    it("startDrag/moveDrag/endDrag manages activePointIndex and applies updates", () => {
      const { result } = renderPerspectiveHook();

      act(() => {
        result.current.startDrag(2);
      });
      expect(result.current.activePointIndex).toBe(2);
      expect(result.current.isDragging).toBe(true);

      act(() => {
        result.current.moveDrag([0.6, 0.6]);
      });
      expect(result.current.quad[2]).toEqual([0.6, 0.6]);

      act(() => {
        result.current.endDrag();
      });
      expect(result.current.activePointIndex).toBeNull();
      expect(result.current.isDragging).toBe(false);
    });

    it("moveDrag without an active point is a no-op", () => {
      const { result, onStateChange } = renderPerspectiveHook();
      const before = result.current.state;

      act(() => {
        result.current.moveDrag([0.42, 0.42]);
      });

      expect(result.current.state).toBe(before);
      expect(onStateChange).not.toHaveBeenCalled();
    });
  });

  describe("hitTestPoint", () => {
    it("returns the index of the nearest corner within the radius", () => {
      const { result } = renderPerspectiveHook();

      // Top-left default pixel corner is (250, 200).
      expect(result.current.hitTestPoint([252, 202])).toBe(0);
      // Far away from any corner.
      expect(result.current.hitTestPoint([10, 10])).toBeNull();
    });
  });

  describe("lock / unlock", () => {
    it("lock with no `before` quad keeps state unchanged", () => {
      const { result } = renderPerspectiveHook();

      act(() => {
        result.current.lock();
      });

      // Without a `before` quad established, lock is a structural no-op.
      expect(result.current.state.before).toBe(0);
      expect(result.current.state.after).toBe(0);
    });

    it("lock zeroes the after quad once a before quad exists, unlock restores editability", () => {
      const { result } = renderPerspectiveHook();

      // Establish a `before` quad and an `after` quad via two setPoint calls.
      act(() => {
        result.current.setPoint(0, [0.2, 0.2]); // writes to "before"
      });
      expect(result.current.state.before).toBeTruthy();

      // The next setPoint now targets "after" since `before` is set.
      act(() => {
        result.current.setPoint(0, [0.3, 0.3]);
      });
      expect(result.current.state.after).toBeTruthy();
      expect(result.current.phase).toBe("after");

      // lock drops the after-quad so editing the before-quad is the only option.
      act(() => {
        result.current.lock();
      });
      expect(result.current.state.before).toBeTruthy();
      expect(result.current.state.after).toBe(0);

      // unlock fully resets both phases (re-enabling the initial editing flow).
      act(() => {
        result.current.unlock();
      });
      expect(result.current.state.before).toBe(0);
      expect(result.current.state.after).toBe(0);
    });
  });

  describe("reset", () => {
    it("returns state to the unlocked default and resets modified to 0", () => {
      const { result, onStateChange } = renderPerspectiveHook();

      act(() => {
        result.current.setPoint(0, [0.1, 0.1], { modified: true });
      });
      expect(result.current.state.modified).toBe(1);
      expect(result.current.state.before).toBeTruthy();

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toEqual({
        before: 0,
        after: 0,
        modified: 0,
      } satisfies PerspectiveState);
      expect(result.current.activePointIndex).toBeNull();
      expect(result.current.quad).toEqual(resetPerspectiveQuad());

      // The most recent onStateChange call comes from reset().
      const lastChange = onStateChange.mock.calls.at(-1)![0];
      expect(lastChange.pointIndex).toBeNull();
      expect(lastChange.phase).toBe("before");
    });

    it("resetQuad restores the default normalized quad without zeroing state", () => {
      const { result } = renderPerspectiveHook();

      act(() => {
        result.current.setPoint(0, [0.05, 0.05]);
      });
      expect(result.current.quad[0]).toEqual([0.05, 0.05]);

      act(() => {
        result.current.resetQuad();
      });

      expect(result.current.quad).toEqual(resetPerspectiveQuad());
    });
  });

  describe("controlled state", () => {
    it("uses the controlled state and routes changes through onStateChange only", () => {
      const onStateChange = vi.fn<(change: PerspectiveGeometryChange) => void>();
      const controlled: PerspectiveState = {
        before: [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.9, 0.9],
          [0.1, 0.9],
        ],
        after: 0,
        modified: 1,
      };

      const { result } = renderHook(() =>
        usePerspectiveGeometry({ size, state: controlled, onStateChange }),
      );

      expect(result.current.state.before).toEqual(controlled.before);
      expect(result.current.state.modified).toBe(1);

      act(() => {
        result.current.setPoint(0, [0.2, 0.2]);
      });

      // Internal state should NOT have been mutated (controlled mode); the
      // change is reported via onStateChange instead.
      expect(result.current.state.before).toEqual(controlled.before);
      expect(onStateChange).toHaveBeenCalledTimes(1);
      const change = onStateChange.mock.calls[0]![0];
      expect(change.pointIndex).toBe(0);
    });
  });
});
