import type { SVGProps } from "react";

/**
 * Skew/perspective icon. Path data lifted from xdadda/mini-photo-editor's
 * `icon_skew.svg` so this app's perspective tool reads as a continuation of
 * the original (parallelogram shape, suggests "skew" / "perspective warp").
 * Re-rendered as a stroke-only icon to match lucide-react's visual language.
 */
export function SkewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* parallelogram outline */}
      <path d="M7 5 L21 8 L17 19 L3 16 Z" />
      {/* corner dots — hint of the 4-handle perspective UI */}
      <circle cx="7" cy="5" r="0.7" fill="currentColor" />
      <circle cx="21" cy="8" r="0.7" fill="currentColor" />
      <circle cx="17" cy="19" r="0.7" fill="currentColor" />
      <circle cx="3" cy="16" r="0.7" fill="currentColor" />
    </svg>
  );
}
