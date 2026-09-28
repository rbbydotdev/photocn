import { describe, expect, it } from "vitest";
import {
  clampNormalizedPerspectivePoint,
  clampNormalizedPerspectiveQuad,
  createPerspectiveState,
  defaultNormalizedPerspectiveQuad,
  lockPerspectiveState,
  normalizedPerspectivePointToPixelPoint,
  normalizedPerspectiveQuadToPixelQuad,
  perspectiveEditPhase,
  perspectiveEditQuad,
  pixelPerspectivePointToNormalizedPoint,
  pixelPerspectiveQuadToNormalizedQuad,
  resetPerspectiveQuad,
  resetPerspectiveState,
  unlockPerspectiveState,
  updatePerspectiveState,
  type PerspectiveQuad,
} from "./perspective-geometry";

const sampleQuad: PerspectiveQuad = [
  [0.1, 0.2],
  [0.9, 0.15],
  [0.85, 0.95],
  [0.05, 0.8],
];

describe("clamping", () => {
  it("clamps normalized points into [0, 1]", () => {
    expect(clampNormalizedPerspectivePoint([-0.5, 1.5])).toEqual([0, 1]);
    expect(clampNormalizedPerspectivePoint([0.5, 0.5])).toEqual([0.5, 0.5]);
  });

  it("clamps every point in a quad", () => {
    const clamped = clampNormalizedPerspectiveQuad([
      [-1, 0],
      [2, 0],
      [2, 2],
      [-1, 2],
    ]);
    expect(clamped).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });
});

describe("normalized <-> pixel conversion", () => {
  const size = { width: 800, height: 600 };

  it("round-trips quads", () => {
    const pixel = normalizedPerspectiveQuadToPixelQuad(sampleQuad, size);
    const back = pixelPerspectiveQuadToNormalizedQuad(pixel, size);
    for (let i = 0; i < 4; i++) {
      expect(back[i][0]).toBeCloseTo(sampleQuad[i][0], 5);
      expect(back[i][1]).toBeCloseTo(sampleQuad[i][1], 5);
    }
  });

  it("converts a single point", () => {
    expect(normalizedPerspectivePointToPixelPoint([0.5, 0.25], size)).toEqual([400, 150]);
    expect(pixelPerspectivePointToNormalizedPoint([400, 150], size)).toEqual([0.5, 0.25]);
  });

  it("guards against zero size on the inverse direction", () => {
    expect(() =>
      pixelPerspectivePointToNormalizedPoint([10, 10], { width: 0, height: 0 }),
    ).not.toThrow();
  });
});

describe("perspective state lifecycle", () => {
  it("creates an empty state by default", () => {
    expect(createPerspectiveState()).toEqual({ before: 0, after: 0, modified: 0 });
  });

  it("clamps incoming quads", () => {
    const state = createPerspectiveState({
      before: [
        [-1, -1],
        [2, -1],
        [2, 2],
        [-1, 2],
      ],
    });
    expect(state.before).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it("resetPerspectiveQuad returns the default quad", () => {
    expect(resetPerspectiveQuad()).toEqual(defaultNormalizedPerspectiveQuad);
  });

  it("resetPerspectiveState empties before/after/modified", () => {
    expect(resetPerspectiveState()).toEqual({ before: 0, after: 0, modified: 0 });
  });

  it("perspectiveEditPhase points at 'before' until before is set, then 'after'", () => {
    expect(perspectiveEditPhase({ before: 0, after: 0, modified: 0 })).toBe("before");
    expect(
      perspectiveEditPhase({ before: sampleQuad, after: 0, modified: 0 }),
    ).toBe("after");
  });

  it("perspectiveEditQuad falls back through after, before, then default", () => {
    expect(
      perspectiveEditQuad({ before: 0, after: 0, modified: 0 }),
    ).toEqual(defaultNormalizedPerspectiveQuad);
    expect(
      perspectiveEditQuad({ before: sampleQuad, after: 0, modified: 0 }),
    ).toEqual(sampleQuad);
  });
});

describe("updatePerspectiveState", () => {
  it("writes to 'before' first when no phase is given and before is empty", () => {
    const next = updatePerspectiveState(
      createPerspectiveState(),
      sampleQuad,
    );
    expect(next.before).toEqual(sampleQuad);
    expect(next.after).toBe(0);
    expect(next.modified).toBe(1);
  });

  it("writes to 'after' once before is populated", () => {
    const initial = createPerspectiveState({ before: sampleQuad });
    const next = updatePerspectiveState(initial, defaultNormalizedPerspectiveQuad);
    expect(next.after).toEqual(defaultNormalizedPerspectiveQuad);
    expect(next.before).toEqual(sampleQuad);
  });

  it("respects an explicit phase override", () => {
    const next = updatePerspectiveState(
      createPerspectiveState({ before: sampleQuad }),
      defaultNormalizedPerspectiveQuad,
      { phase: "before" },
    );
    expect(next.before).toEqual(defaultNormalizedPerspectiveQuad);
  });

  it("normalises the modified flag", () => {
    expect(
      updatePerspectiveState(createPerspectiveState(), sampleQuad, { modified: false })
        .modified,
    ).toBe(0);
    expect(
      updatePerspectiveState(createPerspectiveState(), sampleQuad, { modified: 7 }).modified,
    ).toBe(7);
  });
});

describe("lock / unlock", () => {
  it("lock clears 'after' but preserves 'before'", () => {
    const initial = createPerspectiveState({ before: sampleQuad, after: defaultNormalizedPerspectiveQuad });
    const locked = lockPerspectiveState(initial);
    expect(locked.before).toEqual(sampleQuad);
    expect(locked.after).toBe(0);
  });

  it("lock is a no-op when 'before' is empty", () => {
    const locked = lockPerspectiveState(createPerspectiveState());
    expect(locked).toEqual({ before: 0, after: 0, modified: 0 });
  });

  it("unlock clears both 'before' and 'after'", () => {
    const initial = createPerspectiveState({ before: sampleQuad, after: defaultNormalizedPerspectiveQuad });
    const unlocked = unlockPerspectiveState(initial);
    expect(unlocked.before).toBe(0);
    expect(unlocked.after).toBe(0);
  });
});
