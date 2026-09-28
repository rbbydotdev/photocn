import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  createPointerViewport,
  getTransformState,
  setTransformState,
  subscribePointerViewportRefresh,
  type PointerViewportOptions,
  type TransformState,
} from "../dom";

import { useLatestRef } from "./use-latest-ref";

export interface UseCanvasViewportOptions
  extends Omit<PointerViewportOptions, "viewport" | "content"> {
  viewport?: HTMLElement | null;
  content?: HTMLElement | null;
  enabled?: boolean;
  initialTransform?: TransformState;
  onTransformChange?: (transform: TransformState) => void;
}

export interface UseCanvasViewportResult {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  transform: TransformState;
  isEnabled: boolean;
  refreshTransform: () => TransformState;
  setTransform: (transform: TransformState) => void;
  resetTransform: () => void;
}

const DEFAULT_TRANSFORM: TransformState = {
  x: 0,
  y: 0,
  scale: 1,
};

export function useCanvasViewport({
  viewport,
  content,
  enabled = true,
  initialTransform = DEFAULT_TRANSFORM,
  onTransformChange,
  factor,
  pinchFactor,
  minScale,
  maxScale,
  shouldHandlePoint,
}: UseCanvasViewportOptions = {}): UseCanvasViewportResult {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const onTransformChangeRef = useLatestRef(onTransformChange);
  const [transform, setTransformStateValue] = useState<TransformState>(initialTransform);

  const getElements = useCallback(() => {
    const nextViewport = viewport ?? viewportRef.current;
    const nextContent = content ?? contentRef.current;

    if (!nextViewport || !nextContent) {
      return null;
    }

    return {
      viewport: nextViewport,
      content: nextContent,
    };
  }, [content, viewport]);

  const publishTransform = useCallback((nextTransform: TransformState) => {
    setTransformStateValue(nextTransform);
    onTransformChangeRef.current?.(nextTransform);
    return nextTransform;
  }, []);

  const refreshTransform = useCallback(() => {
    const elements = getElements();
    const nextTransform = elements ? getTransformState(elements.viewport) : initialTransform;
    return publishTransform(nextTransform);
  }, [getElements, initialTransform, publishTransform]);

  const setTransform = useCallback(
    (nextTransform: TransformState) => {
      const elements = getElements();

      if (elements) {
        setTransformState(elements.viewport, nextTransform);
      }

      publishTransform(nextTransform);
    },
    [getElements, publishTransform],
  );

  const resetTransform = useCallback(() => {
    setTransform(initialTransform);
  }, [initialTransform, setTransform]);

  useEffect(() => {
    const elements = getElements();
    if (!elements) return;

    setTransformState(elements.viewport, initialTransform);
    publishTransform(initialTransform);
  }, [getElements, initialTransform, publishTransform]);

  useEffect(() => {
    if (!enabled) return;

    const elements = getElements();
    if (!elements) return;

    const disposeViewport = createPointerViewport({
      factor,
      pinchFactor,
      minScale,
      maxScale,
      shouldHandlePoint,
      viewport: elements.viewport,
      content: elements.content,
    });
    const disposeRefresh = subscribePointerViewportRefresh({
      viewport: elements.viewport,
      content: elements.content,
      onRefresh: refreshTransform,
    });

    return () => {
      disposeViewport();
      disposeRefresh();
    };
  }, [
    enabled,
    factor,
    getElements,
    maxScale,
    minScale,
    pinchFactor,
    refreshTransform,
    shouldHandlePoint,
  ]);

  return {
    viewportRef,
    contentRef,
    transform,
    isEnabled: enabled,
    refreshTransform,
    setTransform,
    resetTransform,
  };
}
