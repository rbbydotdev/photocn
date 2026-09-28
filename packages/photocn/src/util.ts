/**
 * Clamp `value` to the inclusive range `[min, max]`.
 *
 * Argument order is `(value, min, max)` to match the convention used across
 * the editor packages. Some legacy code uses `(min, value, max)` — those call
 * sites should migrate.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
