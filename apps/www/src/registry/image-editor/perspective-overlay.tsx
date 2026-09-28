"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PerspectiveQuad } from "photocn";

import { cn } from "@/lib/utils";

export interface PerspectiveOverlayProps {
  /** Image dimensions in renderer pixels (used to size the SVG viewBox). */
  imageWidth: number;
  imageHeight: number;
  /** Current quad in normalized 0..1 coords (top-left, top-right, bottom-right, bottom-left). */
  quad: PerspectiveQuad;
  disabled?: boolean;
  className?: string;
  onQuadChange?: (quad: PerspectiveQuad) => void;
  onQuadCommit?: (quad: PerspectiveQuad) => void;
}

const HANDLE_INDICES = [0, 1, 2, 3] as const;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function PerspectiveOverlay({
  imageWidth,
  imageHeight,
  quad,
  disabled = false,
  className,
  onQuadChange,
  onQuadCommit,
}: PerspectiveOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Latest quad so the global pointermove listener (created on drag start)
  // always mutates the current state, not the snapshot at drag start.
  const quadRef = useRef(quad);
  quadRef.current = quad;
  // Active drag, if any. Ref because the listeners care about the latest
  // value without re-binding on every render.
  const dragRef = useRef<{ index: number; pointerId: number } | null>(null);

  // Cleanup any in-flight drag if the component unmounts.
  useEffect(() => {
    return () => {
      dragRef.current = null;
    };
  }, []);

  const cssToImagePoint = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const local = pt.matrixTransform(ctm.inverse());
      return [local.x, local.y];
    },
    [],
  );

  const startDrag = (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
    if (disabled || !onQuadChange) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    event.stopPropagation();

    dragRef.current = { index, pointerId: event.pointerId };

    const handleMove = (ev: PointerEvent) => {
      if (dragRef.current?.pointerId !== ev.pointerId) return;
      const local = cssToImagePoint(ev.clientX, ev.clientY);
      if (!local) return;
      const norm: [number, number] = [
        clamp01(local[0] / Math.max(1, imageWidth)),
        clamp01(local[1] / Math.max(1, imageHeight)),
      ];
      const current = quadRef.current;
      const next = [
        index === 0 ? norm : current[0],
        index === 1 ? norm : current[1],
        index === 2 ? norm : current[2],
        index === 3 ? norm : current[3],
      ] as PerspectiveQuad;
      onQuadChange(next);
    };

    const handleEnd = (ev: PointerEvent) => {
      if (dragRef.current?.pointerId !== ev.pointerId) return;
      dragRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      onQuadCommit?.(quadRef.current);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  };

  // viewBox in image-pixel coords. preserveAspectRatio="xMidYMid meet"
  // letterboxes the viewBox content to match `object-contain` on the
  // canvas, so quad coords (image pixels) align with the displayed image
  // without any JS layout measurement.
  const viewW = Math.max(1, imageWidth);
  const viewH = Math.max(1, imageHeight);
  const longEdge = Math.max(viewW, viewH);
  // Visible handle is small for a clean look; an invisible larger circle
  // sits on top to give a touch-friendly hit area (~44pt equivalent).
  const handleRadius = longEdge / 50;
  const hitRadius = longEdge / 22;
  const strokeWidth = longEdge / 300;
  const pixelPoints = quad.map(([nx, ny]) => [nx * viewW, ny * viewH] as const);
  const polygonPoints = pixelPoints.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg
      aria-label="Perspective handles"
      className={cn("absolute inset-0 size-full", className)}
      data-slot="perspective-overlay"
      preserveAspectRatio="xMidYMid meet"
      ref={svgRef}
      style={{ pointerEvents: "none", touchAction: "none" }}
      viewBox={`0 0 ${viewW} ${viewH}`}
    >
      {/* 10×10 alignment grid behind the quad. Same look as the original
          mini-photo-editor's perspective overlay: thin gray lines you can
          rest a corner on. */}
      <g style={{ pointerEvents: "none" }} stroke="rgba(255,255,255,0.35)" strokeWidth={strokeWidth * 0.6}>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((i) => {
          const x = (viewW * i) / 10;
          const y = (viewH * i) / 10;
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={0} y2={viewH} />
              <line x1={0} x2={viewW} y1={y} y2={y} />
            </g>
          );
        })}
      </g>
      {/* Quad outline. */}
      <polygon
        fill="none"
        points={polygonPoints}
        stroke="white"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        style={{ pointerEvents: "none" }}
      />
      {/* Corner handles. Visible circle is small + decorative; a larger
          invisible circle on top is the actual hit target so touch users
          (and mouse users with shaky hands) don't have to hit a 12px dot. */}
      {HANDLE_INDICES.map((index) => {
        const [cx, cy] = pixelPoints[index];
        return (
          <g key={index}>
            <circle
              cx={cx}
              cy={cy}
              fill="white"
              r={handleRadius}
              stroke="black"
              strokeWidth={strokeWidth}
              style={{ pointerEvents: "none" }}
            />
            <circle
              cx={cx}
              cy={cy}
              data-perspective-handle={index}
              fill="transparent"
              onPointerDown={startDrag(index)}
              r={hitRadius}
              style={{
                cursor: disabled ? "not-allowed" : "move",
                pointerEvents: disabled ? "none" : "auto",
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}
