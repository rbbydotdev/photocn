"use client";

import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface BlurCenterOverlayProps {
  /** Normalized 0..1 position of the blur center within the displayed image rect. */
  centerX: number;
  centerY: number;
  disabled?: boolean;
  className?: string;
  /** Fires transient on drag and on pointer-up; the parent decides debouncing/commit. */
  onCenterChange?: (next: { centerX: number; centerY: number }) => void;
  onCenterCommit?: (next: { centerX: number; centerY: number }) => void;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function BlurCenterOverlay({
  centerX,
  centerY,
  disabled = false,
  className,
  onCenterChange,
  onCenterCommit,
}: BlurCenterOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const positionFromEvent = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        centerX: clamp01((event.clientX - rect.left) / rect.width),
        centerY: clamp01((event.clientY - rect.top) / rect.height),
      };
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const pos = positionFromEvent(event);
    if (!pos) return;
    // Don't let pointerdown bubble up to the workspace's compare gesture —
    // clicking the blur handle should drag, not flash the original image.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onCenterChange?.(pos);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dragging) return;
    const pos = positionFromEvent(event);
    if (!pos) return;
    onCenterChange?.(pos);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    const pos = positionFromEvent(event);
    if (pos) onCenterCommit?.(pos);
  };

  return (
    <div
      className={cn(
        "absolute inset-0",
        disabled ? "pointer-events-none" : "pointer-events-auto cursor-crosshair",
        className,
      )}
      data-slot="blur-center-overlay"
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      ref={containerRef}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 bg-white/10 shadow-[0_0_0_2px_rgba(0,0,0,0.5)] transition-transform"
        style={{
          left: `${centerX * 100}%`,
          top: `${centerY * 100}%`,
          transform: dragging
            ? "translate(-50%, -50%) scale(1.15)"
            : "translate(-50%, -50%)",
        }}
      >
        <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>
    </div>
  );
}
