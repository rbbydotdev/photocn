import { clamp } from "..";

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface TransformState {
  x: number;
  y: number;
  scale: number;
}

export interface PointerHandlerEvent {
  el: HTMLElement;
  ev: PointerEvent;
}

export interface PointerMoveHandlerEvent extends PointerHandlerEvent {
  x: number;
  y: number;
}

export interface PointerZoomHandlerEvent {
  el: HTMLElement;
  ev: WheelEvent;
  zoom: number;
}

export interface PointerPinchHandlerEvent {
  el: HTMLElement;
  ev0: PointerEvent;
  ev1: PointerEvent;
  diff: number;
}

export interface PointerHandlersOptions {
  el: HTMLElement;
  onStart?: (event: PointerHandlerEvent) => void;
  onMove?: (event: PointerMoveHandlerEvent) => void;
  onEnd?: (event: PointerHandlerEvent) => void;
  onZoom?: (event: PointerZoomHandlerEvent) => void;
  onPinch?: (event: PointerPinchHandlerEvent) => void;
  disableLeave?: boolean;
}

export interface ZoomOnPointerOptions {
  factor?: number;
  minScale?: number;
  maxScale?: number;
}

export interface PointerViewportOptions {
  viewport: HTMLElement;
  content: HTMLElement;
  factor?: number;
  pinchFactor?: number;
  minScale?: number;
  maxScale?: number;
  shouldHandlePoint?: (element: Element | null) => boolean;
}

export type DisposePointerHandlers = () => void;

const DEFAULT_ZOOM_FACTOR = 0.06;
const DEFAULT_PINCH_FACTOR = 0.1;
const DEFAULT_MIN_SCALE = 0.9;
const DEFAULT_MAX_SCALE = 8;

export function handlePointer(options: PointerHandlersOptions): DisposePointerHandlers {
  const { el, disableLeave = false } = options;
  const evCache: PointerEvent[] = [];
  let prevDiff = 0;
  let lastX = 0;
  let lastY = 0;
  let firstPinch = true;

  const start = (ev: PointerEvent): void => {
    evCache.push(ev);
    options.onStart?.({ el, ev });
    lastX = ev.clientX;
    lastY = ev.clientY;
    firstPinch = true;
  };

  const end = (ev: PointerEvent): void => {
    if (!evCache.length) return;

    const index = evCache.findIndex((cachedEv) => cachedEv.pointerId === ev.pointerId);
    if (index >= 0) {
      evCache.splice(index, 1);
    }

    if (evCache.length < 2) {
      prevDiff = 0;
    }

    options.onEnd?.({ el, ev });
  };

  const move = (ev: PointerEvent): void => {
    if (!evCache.length) return;

    const index = evCache.findIndex((cachedEv) => cachedEv.pointerId === ev.pointerId);
    if (index < 0) return;

    evCache[index] = ev;

    if (evCache.length === 1) {
      options.onMove?.({
        el,
        ev,
        x: ev.clientX - lastX,
        y: ev.clientY - lastY,
      });
      lastX = ev.clientX;
      lastY = ev.clientY;
      return;
    }

    if (evCache.length === 2) {
      const curDiff = Math.abs(evCache[0].clientX - evCache[1].clientX);
      if (prevDiff > 0) {
        let diff = curDiff - prevDiff;
        if (firstPinch) {
          firstPinch = false;
          diff *= -1;
        }

        ev.preventDefault();
        options.onPinch?.({ el, ev0: evCache[0], ev1: evCache[1], diff });
      }

      prevDiff = curDiff;
    }
  };

  const preventTouchZoom = (ev: TouchEvent): void => {
    if (ev.touches.length === 2) {
      ev.preventDefault();
    }
  };

  const wheel = (ev: WheelEvent): void => {
    options.onZoom?.({ el, ev, zoom: ev.deltaY / 100 });
  };

  el.addEventListener("pointerdown", start);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  if (!disableLeave) {
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerout", end);
  }
  el.addEventListener("pointerleave", end);
  el.addEventListener("touchstart", preventTouchZoom, { passive: false });

  if (options.onZoom) {
    el.addEventListener("wheel", wheel, { passive: false });
  }

  return () => {
    el.removeEventListener("pointerdown", start);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    if (!disableLeave) {
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("pointerout", end);
    }
    el.removeEventListener("pointerleave", end);
    el.removeEventListener("touchstart", preventTouchZoom);

    if (options.onZoom) {
      el.removeEventListener("wheel", wheel);
    }
  };
}

export function getTransformState(el: HTMLElement): TransformState {
  const translate = el.style.transform
    .match(/translate\((.*?)\)/)?.[1]
    ?.split(",")
    .map((value) => Number.parseFloat(value)) ?? [0, 0];
  const scale =
    el.style.transform
      .match(/scale\((.*?)\)/)?.[1]
      ?.split(",")
      .map((value) => Number.parseFloat(value))[0] ?? 1;

  return {
    x: Number.isFinite(translate[0]) ? translate[0] : 0,
    y: Number.isFinite(translate[1]) ? translate[1] : 0,
    scale: Number.isFinite(scale) ? scale : 1,
  };
}

export function setTransformState(el: HTMLElement, transform: TransformState): void {
  el.style.transform = `translate(${transform.x}px,${transform.y}px) scale(${transform.scale},${transform.scale})`;
}

export function translateElement(el: HTMLElement, dx: number, dy: number, scale = 1): TransformState {
  const transform = getTransformState(el);
  transform.x += dx / scale;
  transform.y += dy / scale;
  el.style.transform = `translate(${transform.x}px,${transform.y}px)`;
  return transform;
}

export function zoomOnPointer(
  el: HTMLElement,
  point: ViewportPoint,
  delta: number,
  options: ZoomOnPointerOptions = {},
): TransformState {
  if (!el.style.transformOrigin) {
    el.style.transformOrigin = "0 0";
  }

  const parent = el.parentElement;
  const parentRect = parent?.getBoundingClientRect();
  const transform = getTransformState(el);
  const factor = options.factor ?? DEFAULT_ZOOM_FACTOR;
  const minScale = options.minScale ?? DEFAULT_MIN_SCALE;
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;
  const zoomPoint = {
    x: point.x - (parentRect?.left ?? 0),
    y: point.y - (parentRect?.top ?? 0),
  };
  const normalizedDelta = clamp(delta / 10, -1, 1);

  if (!normalizedDelta) {
    return transform;
  }

  const zoomTarget = {
    x: (zoomPoint.x - transform.x) / transform.scale,
    y: (zoomPoint.y - transform.y) / transform.scale,
  };
  const scale = clamp(
    transform.scale + normalizedDelta * factor * transform.scale,
    minScale,
    maxScale,
  );
  const next = {
    x: -zoomTarget.x * scale + zoomPoint.x,
    y: -zoomTarget.y * scale + zoomPoint.y,
    scale,
  };

  setTransformState(el, next);
  return next;
}

export function createPointerViewport(options: PointerViewportOptions): DisposePointerHandlers {
  const {
    viewport,
    content,
    factor = DEFAULT_ZOOM_FACTOR,
    pinchFactor = DEFAULT_PINCH_FACTOR,
    minScale = DEFAULT_MIN_SCALE,
    maxScale = DEFAULT_MAX_SCALE,
    shouldHandlePoint = (element) => element !== viewport && element !== content,
  } = options;

  const shouldHandle = (point: ViewportPoint): boolean => {
    const element = viewport.ownerDocument.elementFromPoint(point.x, point.y);
    return shouldHandlePoint(element);
  };

  const destroyContent = handlePointer({
    el: content,
    onMove: ({ ev, x, y, el }) => {
      const point = { x: ev.clientX, y: ev.clientY };
      if (!shouldHandle(point)) return;

      translateElement(el, x, y, getTransformState(viewport).scale);
    },
  });
  const destroyViewport = handlePointer({
    el: viewport,
    onZoom: ({ ev, el }) => {
      ev.preventDefault();

      const point = { x: ev.clientX, y: ev.clientY };
      if (!shouldHandle(point)) return;

      zoomOnPointer(el, point, wheelDelta(ev), {
        factor,
        minScale,
        maxScale,
      });
    },
    onPinch: ({ ev0, ev1, diff, el }) => {
      const point = {
        x: (ev0.clientX + ev1.clientX) / 2,
        y: (ev0.clientY + ev1.clientY) / 2,
      };
      if (!shouldHandle(point)) return;

      zoomOnPointer(el, point, diff, {
        factor: pinchFactor,
        minScale,
        maxScale,
      });
    },
  });

  return () => {
    destroyContent();
    destroyViewport();
  };
}

export interface SubscribePointerViewportRefreshOptions {
  viewport: HTMLElement;
  content: HTMLElement;
  onRefresh: () => void;
}

export function subscribePointerViewportRefresh({
  viewport,
  content,
  onRefresh,
}: SubscribePointerViewportRefreshOptions): () => void {
  let frame = 0;
  const queueRefresh = () => {
    if (frame) return;

    frame = window.requestAnimationFrame(() => {
      frame = 0;
      onRefresh();
    });
  };

  viewport.addEventListener("wheel", queueRefresh);
  viewport.addEventListener("pointermove", queueRefresh);
  content.addEventListener("pointermove", queueRefresh);
  viewport.addEventListener("pointerup", queueRefresh);
  content.addEventListener("pointerup", queueRefresh);

  return () => {
    viewport.removeEventListener("wheel", queueRefresh);
    viewport.removeEventListener("pointermove", queueRefresh);
    content.removeEventListener("pointermove", queueRefresh);
    viewport.removeEventListener("pointerup", queueRefresh);
    content.removeEventListener("pointerup", queueRefresh);

    if (frame) {
      window.cancelAnimationFrame(frame);
    }
  };
}

function wheelDelta(ev: WheelEvent): number {
  const legacyEvent = ev as WheelEvent & { wheelDelta?: number; detail?: number };
  return legacyEvent.wheelDelta ?? legacyEvent.detail ?? -ev.deltaY;
}

