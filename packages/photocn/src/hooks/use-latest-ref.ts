import { useRef, type RefObject } from "react";

/**
 * Returns a ref whose `.current` always holds the latest `value` seen during
 * render. Use this when an async callback or long-lived event listener needs
 * to read the freshest prop without re-binding on every render.
 *
 * Render-time assignment is safe here: refs are not part of React's rendering
 * output, and consumers must read `.current` from inside event handlers,
 * effects, or async continuations — never during render.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
