import { useCallback, useState } from "react";

import { useLatestRef } from "./use-latest-ref";

export interface UseControllableStateOptions<T> {
  /** Controlled value. When `undefined`, the hook falls back to internal state. */
  value: T | undefined;
  /** Initial value for the internal (uncontrolled) state. */
  defaultValue: T;
  /** Fires on every change, in both controlled and uncontrolled modes. */
  onChange?: (value: T) => void;
}

/**
 * Bridges a controlled-or-uncontrolled prop pair (`value` / `onChange`) into
 * a single `[value, setValue]` API. When the parent supplies `value`, the
 * hook returns it verbatim and only forwards changes via `onChange`. When the
 * parent omits it, the hook keeps its own state seeded from `defaultValue`.
 *
 * The returned setter has a stable identity, so consumers can hand it to
 * children without churning their props.
 */
export function useControllableState<T>({
  value: controlledValue,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>): [T, (next: T) => void] {
  const [internal, setInternal] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? (controlledValue as T) : internal;

  const onChangeRef = useLatestRef(onChange);
  const isControlledRef = useLatestRef(isControlled);

  const setValue = useCallback((next: T) => {
    if (!isControlledRef.current) setInternal(next);
    onChangeRef.current?.(next);
  }, [isControlledRef, onChangeRef]);

  return [value, setValue];
}
