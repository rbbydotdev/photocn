import { useCallback, useMemo, useState } from "react";

import {
  createPerspectiveState,
  hitTestPerspectivePoint,
  lockPerspectiveState,
  normalizedPerspectiveQuadToPixelQuad,
  perspectiveEditPhase,
  perspectiveEditQuad,
  pixelPerspectivePointToNormalizedPoint,
  replacePerspectivePoint,
  resetPerspectiveQuad,
  resetPerspectiveState,
  unlockPerspectiveState,
  updatePerspectiveState,
  type PerspectivePhase,
  type PerspectivePoint,
  type PerspectivePointIndex,
  type PerspectiveQuad,
  type PerspectiveState,
  type Size,
  type UpdatePerspectiveStateOptions,
} from "..";

export type {
  PerspectivePhase,
  PerspectivePoint,
  PerspectivePointIndex,
  PerspectiveQuad,
  PerspectiveState,
  Size,
  UpdatePerspectiveStateOptions,
} from "..";

export interface PerspectiveGeometryChange {
  state: PerspectiveState;
  quad: PerspectiveQuad;
  phase: PerspectivePhase;
  pointIndex: PerspectivePointIndex | null;
}

export interface UsePerspectiveGeometryOptions {
  size: Size;
  initialState?: Partial<PerspectiveState>;
  state?: PerspectiveState;
  phase?: PerspectivePhase;
  onStateChange?: (change: PerspectiveGeometryChange) => void;
}

export interface UsePerspectiveGeometryResult {
  state: PerspectiveState;
  phase: PerspectivePhase;
  quad: PerspectiveQuad;
  pixelQuad: PerspectiveQuad;
  activePointIndex: PerspectivePointIndex | null;
  isDragging: boolean;
  setState: (state: Partial<PerspectiveState>) => PerspectiveState;
  setQuad: (
    quad: PerspectiveQuad,
    options?: UpdatePerspectiveStateOptions,
  ) => PerspectiveState;
  setPoint: (
    index: PerspectivePointIndex,
    point: PerspectivePoint,
    options?: UpdatePerspectiveStateOptions,
  ) => PerspectiveState;
  setPixelPoint: (
    index: PerspectivePointIndex,
    point: PerspectivePoint,
    options?: UpdatePerspectiveStateOptions,
  ) => PerspectiveState;
  hitTestPoint: (
    point: PerspectivePoint,
    radius?: number,
  ) => PerspectivePointIndex | null;
  startDrag: (index: PerspectivePointIndex) => void;
  moveDrag: (point: PerspectivePoint) => PerspectiveState;
  moveDragPixel: (point: PerspectivePoint) => PerspectiveState;
  endDrag: () => void;
  resetQuad: (options?: UpdatePerspectiveStateOptions) => PerspectiveState;
  reset: () => PerspectiveState;
  lock: () => PerspectiveState;
  unlock: () => PerspectiveState;
}

export function usePerspectiveGeometry({
  size,
  initialState,
  state: controlledState,
  phase: controlledPhase,
  onStateChange,
}: UsePerspectiveGeometryOptions): UsePerspectiveGeometryResult {
  const [internalState, setInternalState] = useState(() =>
    createPerspectiveState(initialState),
  );
  const [activePointIndex, setActivePointIndex] =
    useState<PerspectivePointIndex | null>(null);
  const state = useMemo(
    () => createPerspectiveState(controlledState ?? internalState),
    [controlledState, internalState],
  );
  const phase = controlledPhase ?? perspectiveEditPhase(state);
  const quad = useMemo(
    () => state[phase] || perspectiveEditQuad(state),
    [phase, state],
  );
  const pixelQuad = useMemo(
    () => normalizedPerspectiveQuadToPixelQuad(quad, size),
    [quad, size],
  );

  const publishState = useCallback(
    (
      nextState: PerspectiveState,
      nextQuad: PerspectiveQuad,
      nextPhase: PerspectivePhase,
      pointIndex: PerspectivePointIndex | null,
    ) => {
      if (!controlledState) {
        setInternalState(nextState);
      }

      onStateChange?.({
        state: nextState,
        quad: nextQuad,
        phase: nextPhase,
        pointIndex,
      });

      return nextState;
    },
    [controlledState, onStateChange],
  );

  const publishDerivedState = useCallback(
    (nextState: PerspectiveState, pointIndex: PerspectivePointIndex | null) => {
      const nextPhase = controlledPhase ?? perspectiveEditPhase(nextState);
      const nextQuad =
        nextState[nextPhase] || perspectiveEditQuad(nextState);
      return publishState(nextState, nextQuad, nextPhase, pointIndex);
    },
    [controlledPhase, publishState],
  );

  const setState = useCallback(
    (nextState: Partial<PerspectiveState>) =>
      publishDerivedState(createPerspectiveState(nextState), null),
    [publishDerivedState],
  );

  const setQuad = useCallback(
    (nextQuad: PerspectiveQuad, options: UpdatePerspectiveStateOptions = {}) => {
      const nextPhase = options.phase ?? phase;
      const nextState = updatePerspectiveState(state, nextQuad, {
        ...options,
        phase: nextPhase,
      });
      return publishState(nextState, nextState[nextPhase] || nextQuad, nextPhase, null);
    },
    [phase, publishState, state],
  );

  const setPoint = useCallback(
    (
      index: PerspectivePointIndex,
      point: PerspectivePoint,
      options: UpdatePerspectiveStateOptions = {},
    ) => {
      const nextPhase = options.phase ?? phase;
      const nextQuad = replacePerspectivePoint(
        state[nextPhase] || quad,
        index,
        point,
      );
      const nextState = updatePerspectiveState(state, nextQuad, {
        ...options,
        phase: nextPhase,
      });
      return publishState(nextState, nextState[nextPhase] || nextQuad, nextPhase, index);
    },
    [phase, publishState, quad, state],
  );

  const setPixelPoint = useCallback(
    (
      index: PerspectivePointIndex,
      point: PerspectivePoint,
      options: UpdatePerspectiveStateOptions = {},
    ) => setPoint(index, pixelPerspectivePointToNormalizedPoint(point, size), options),
    [setPoint, size],
  );

  const hitTestPoint = useCallback(
    (point: PerspectivePoint, radius = 12) =>
      hitTestPerspectivePoint(pixelQuad, point, radius),
    [pixelQuad],
  );

  const startDrag = useCallback((index: PerspectivePointIndex) => {
    setActivePointIndex(index);
  }, []);

  const moveDrag = useCallback(
    (point: PerspectivePoint) => {
      if (activePointIndex === null) {
        return state;
      }

      return setPoint(activePointIndex, point);
    },
    [activePointIndex, setPoint, state],
  );

  const moveDragPixel = useCallback(
    (point: PerspectivePoint) => {
      if (activePointIndex === null) {
        return state;
      }

      return setPixelPoint(activePointIndex, point);
    },
    [activePointIndex, setPixelPoint, state],
  );

  const endDrag = useCallback(() => {
    setActivePointIndex(null);
  }, []);

  const resetQuadToDefault = useCallback(
    (options: UpdatePerspectiveStateOptions = {}) =>
      setQuad(resetPerspectiveQuad(), options),
    [setQuad],
  );

  const reset = useCallback(() => {
    setActivePointIndex(null);
    return publishDerivedState(resetPerspectiveState(), null);
  }, [publishDerivedState]);

  const lock = useCallback(
    () => publishDerivedState(lockPerspectiveState(state), null),
    [publishDerivedState, state],
  );

  const unlock = useCallback(
    () => publishDerivedState(unlockPerspectiveState(state), null),
    [publishDerivedState, state],
  );

  return {
    state,
    phase,
    quad,
    pixelQuad,
    activePointIndex,
    isDragging: activePointIndex !== null,
    setState,
    setQuad,
    setPoint,
    setPixelPoint,
    hitTestPoint,
    startDrag,
    moveDrag,
    moveDragPixel,
    endDrag,
    resetQuad: resetQuadToDefault,
    reset,
    lock,
    unlock,
  };
}
