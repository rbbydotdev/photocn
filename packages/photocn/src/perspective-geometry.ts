import type { Size } from "./geometry";
import { clamp } from "./util";

export type PerspectivePoint = readonly [number, number];
export type PerspectiveQuad = readonly [
  PerspectivePoint,
  PerspectivePoint,
  PerspectivePoint,
  PerspectivePoint,
];
export type PerspectivePhase = "before" | "after";

export interface PerspectiveState {
  before: PerspectiveQuad | 0;
  after: PerspectiveQuad | 0;
  modified: number;
}

export interface UpdatePerspectiveStateOptions {
  phase?: PerspectivePhase;
  modified?: number | boolean;
}

export const defaultNormalizedPerspectiveQuad = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.75, 0.75],
  [0.25, 0.75],
] as const satisfies PerspectiveQuad;

function cloneQuad(points: PerspectiveQuad): PerspectiveQuad {
  return [
    [points[0][0], points[0][1]],
    [points[1][0], points[1][1]],
    [points[2][0], points[2][1]],
    [points[3][0], points[3][1]],
  ];
}

function modifiedValue(value: number | boolean | undefined): number {
  if (typeof value === "number") return value;
  return value === false ? 0 : 1;
}

export function clampNormalizedPerspectivePoint(point: PerspectivePoint): PerspectivePoint {
  return [
    clamp(point[0], 0, 1),
    clamp(point[1], 0, 1),
  ];
}

export function clampNormalizedPerspectiveQuad(points: PerspectiveQuad): PerspectiveQuad {
  return [
    clampNormalizedPerspectivePoint(points[0]),
    clampNormalizedPerspectivePoint(points[1]),
    clampNormalizedPerspectivePoint(points[2]),
    clampNormalizedPerspectivePoint(points[3]),
  ];
}

export function normalizedPerspectivePointToPixelPoint(
  point: PerspectivePoint,
  size: Size,
): PerspectivePoint {
  const [x, y] = clampNormalizedPerspectivePoint(point);
  return [x * size.width, y * size.height];
}

export function pixelPerspectivePointToNormalizedPoint(
  point: PerspectivePoint,
  size: Size,
): PerspectivePoint {
  const width = size.width || 1;
  const height = size.height || 1;

  return clampNormalizedPerspectivePoint([
    point[0] / width,
    point[1] / height,
  ]);
}

export function normalizedPerspectiveQuadToPixelQuad(
  points: PerspectiveQuad,
  size: Size,
): PerspectiveQuad {
  return [
    normalizedPerspectivePointToPixelPoint(points[0], size),
    normalizedPerspectivePointToPixelPoint(points[1], size),
    normalizedPerspectivePointToPixelPoint(points[2], size),
    normalizedPerspectivePointToPixelPoint(points[3], size),
  ];
}

export function pixelPerspectiveQuadToNormalizedQuad(
  points: PerspectiveQuad,
  size: Size,
): PerspectiveQuad {
  return [
    pixelPerspectivePointToNormalizedPoint(points[0], size),
    pixelPerspectivePointToNormalizedPoint(points[1], size),
    pixelPerspectivePointToNormalizedPoint(points[2], size),
    pixelPerspectivePointToNormalizedPoint(points[3], size),
  ];
}

export function createPerspectiveState(
  state: Partial<PerspectiveState> = {},
): PerspectiveState {
  return {
    before: state.before ? clampNormalizedPerspectiveQuad(state.before) : 0,
    after: state.after ? clampNormalizedPerspectiveQuad(state.after) : 0,
    modified: state.modified ?? 0,
  };
}

export function resetPerspectiveState(): PerspectiveState {
  return createPerspectiveState();
}

export function resetPerspectiveQuad(): PerspectiveQuad {
  return cloneQuad(defaultNormalizedPerspectiveQuad);
}

export function perspectiveEditPhase(state: PerspectiveState): PerspectivePhase {
  return state.before ? "after" : "before";
}

export function perspectiveEditQuad(state: PerspectiveState): PerspectiveQuad {
  return state.after || state.before || resetPerspectiveQuad();
}

export function updatePerspectiveState(
  state: PerspectiveState,
  points: PerspectiveQuad,
  options: UpdatePerspectiveStateOptions = {},
): PerspectiveState {
  const phase = options.phase ?? perspectiveEditPhase(state);
  const next = createPerspectiveState(state);

  return {
    ...next,
    [phase]: clampNormalizedPerspectiveQuad(points),
    modified: modifiedValue(options.modified),
  };
}

export function lockPerspectiveState(state: PerspectiveState): PerspectiveState {
  const next = createPerspectiveState(state);
  if (!next.before) return next;

  return {
    ...next,
    after: 0,
  };
}

export function unlockPerspectiveState(state: PerspectiveState): PerspectiveState {
  const next = createPerspectiveState(state);

  return {
    ...next,
    before: 0,
    after: 0,
  };
}

export type PerspectivePointIndex = 0 | 1 | 2 | 3;

export function replacePerspectivePoint(
  quad: PerspectiveQuad,
  index: PerspectivePointIndex,
  point: PerspectivePoint,
): PerspectiveQuad {
  return [
    index === 0 ? point : quad[0],
    index === 1 ? point : quad[1],
    index === 2 ? point : quad[2],
    index === 3 ? point : quad[3],
  ];
}

export function hitTestPerspectivePoint(
  pixelQuad: PerspectiveQuad,
  point: PerspectivePoint,
  radius = 12,
): PerspectivePointIndex | null {
  let closestIndex: PerspectivePointIndex | null = null;
  let closestDistance = radius;

  pixelQuad.forEach((corner, index) => {
    const dx = point[0] - corner[0];
    const dy = point[1] - corner[1];
    const next = Math.hypot(dx, dy);

    if (next <= closestDistance) {
      closestIndex = index as PerspectivePointIndex;
      closestDistance = next;
    }
  });

  return closestIndex;
}
