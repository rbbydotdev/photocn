"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clamp,
  type CurveChannelPoints,
  type CurveChannels,
  type CurvePoint,
} from "photocn";
import { useControllableState } from "photocn/hooks";
import { drawRgbHistogram, type RgbHistogram } from "photocn/dom";
import { useImageEditor } from "photocn/react";

import { PanelResetHeader } from "./panel-header";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

export type CurvesChannel = "rgb" | "r" | "g" | "b";
export type { CurveChannelPoints, CurveChannels, CurvePoint };

export interface CurvesPanelProps {
  value: CurveChannels | null;
  activeChannel?: CurvesChannel;
  disabled?: boolean;
  className?: string;
  onChange: (next: CurveChannels) => void;
  onCommit?: () => void;
  onActiveChannelChange?: (channel: CurvesChannel) => void;
  onReset?: () => void;
  size?: number;
  /** Live RGB histogram drawn as the curves grid backdrop. Adjusting curves
   *  visually appears to "shape" the histogram, like Lightroom. Pass `null`
   *  to render without a backdrop. */
  histogram?: RgbHistogram | null;
}

const CHANNEL_ORDER: readonly CurvesChannel[] = ["rgb", "r", "g", "b"];
const CHANNEL_INDEX: Record<CurvesChannel, 0 | 1 | 2 | 3> = {
  rgb: 0,
  r: 1,
  g: 2,
  b: 3,
};
const CHANNEL_LABEL: Record<CurvesChannel, string> = {
  rgb: "RGB",
  r: "R",
  g: "G",
  b: "B",
};
// Stroke colors per channel (active curve).
const CHANNEL_STROKE: Record<CurvesChannel, string> = {
  rgb: "currentColor",
  r: "#ef4444",
  g: "#22c55e",
  b: "#3b82f6",
};

const DEFAULT_SIZE = 240;
// Curves operate in normalized [0,1] coordinate space — that's the contract
// of `filterCurves` (see packages/mini-gl/src/filters/filterCurves.ts).
// Default points sit on the quarter grid so users have draggable handles
// without clicking first; staying on y=x keeps it a no-op until dragged.
const IDENTITY_POINTS: CurvePoint[] = [
  [0, 0],
  [0.25, 0.25],
  [0.5, 0.5],
  [0.75, 0.75],
  [1, 1],
];
// Minimum gap between adjacent control points (~1/255 — one byte of LUT
// precision) so neighbours never collide.
const POINT_EPSILON = 1 / 255;

function emptyChannels(): CurveChannels {
  return [null, null, null, null];
}

function ensureChannels(value: CurveChannels | null): CurveChannels {
  if (value) return [value[0], value[1], value[2], value[3]];
  return emptyChannels();
}

function getActivePoints(
  value: CurveChannels | null,
  channel: CurvesChannel,
): CurvePoint[] {
  const idx = CHANNEL_INDEX[channel];
  const existing = value?.[idx];
  if (existing && existing.length >= 2) return existing;
  return IDENTITY_POINTS;
}

function isIdentity(points: CurvePoint[] | null | undefined): boolean {
  if (!points) return true;
  // Any set whose points all lie on y=x is the identity curve.
  return points.every(([x, y]) => Math.abs(y - x) < POINT_EPSILON);
}

function hasAnyEdits(value: CurveChannels | null): boolean {
  if (!value) return false;
  return value.some((channel) => channel !== null && !isIdentity(channel));
}

// Monotonic cubic (Fritsch–Carlson) — produces a smooth curve that does not
// overshoot, which is what photo curves need.
function buildSmoothPath(points: CurvePoint[], size: number): string {
  if (points.length < 2) return "";
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const n = sorted.length;
  const xs = sorted.map((p) => p[0]);
  const ys = sorted.map((p) => p[1]);

  const dx: number[] = new Array(n - 1);
  const dy: number[] = new Array(n - 1);
  const slopes: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i] || 1e-9;
    dy[i] = ys[i + 1] - ys[i];
    slopes[i] = dy[i] / dx[i];
  }
  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) tangents[i] = 0;
    else tangents[i] = (slopes[i - 1] + slopes[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangents[i] = t * a * slopes[i];
      tangents[i + 1] = t * b * slopes[i];
    }
  }

  const toScreenX = (x: number) => x * size;
  const toScreenY = (y: number) => size - y * size;

  let d = `M ${toScreenX(xs[0]).toFixed(2)} ${toScreenY(ys[0]).toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    const x1 = xs[i] + h / 3;
    const y1 = ys[i] + (tangents[i] * h) / 3;
    const x2 = xs[i + 1] - h / 3;
    const y2 = ys[i + 1] - (tangents[i + 1] * h) / 3;
    d += ` C ${toScreenX(x1).toFixed(2)} ${toScreenY(y1).toFixed(2)}, ${toScreenX(x2).toFixed(2)} ${toScreenY(y2).toFixed(2)}, ${toScreenX(xs[i + 1]).toFixed(2)} ${toScreenY(ys[i + 1]).toFixed(2)}`;
  }
  return d;
}

// Linear-interp y at x along a sorted point list (used for inserting new
// control points that sit on the current curve).
function interpolateY(points: CurvePoint[], x: number): number {
  if (points.length === 0) return x;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0 || 1);
      return y0 + t * (y1 - y0);
    }
  }
  return x;
}

interface DragState {
  pointerId: number;
  index: number;
}

export function CurvesPanel({
  value,
  activeChannel: activeChannelProp,
  disabled = false,
  className,
  onChange,
  onCommit,
  onActiveChannelChange,
  onReset,
  size = DEFAULT_SIZE,
  histogram,
}: CurvesPanelProps) {
  const panelId = useId();
  const tabsLabelId = `${panelId}-channel`;

  const [activeChannel, applyChannelChange] = useControllableState<CurvesChannel>({
    value: activeChannelProp,
    defaultValue: "rgb",
    onChange: onActiveChannelChange,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const histogramCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Repaint the histogram backdrop whenever the histogram data changes.
  // Uses the existing `drawRgbHistogram` helper — same path as the sidebar
  // histogram strip, just at a larger canvas size that mirrors the curve grid.
  // Lighter alpha + dimmed channels so the backdrop reads as background and
  // the active curve stays visually dominant.
  useEffect(() => {
    const canvas = histogramCanvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!histogram || !histogram.pixels) {
      ctx.clearRect(0, 0, size, size);
      return;
    }
    drawRgbHistogram(ctx, histogram, {
      // Match the channel stroke colors of the curves so the backdrop and
      // the active curve feel like the same family.
      red: CHANNEL_STROKE.r,
      green: CHANNEL_STROKE.g,
      blue: CHANNEL_STROKE.b,
      alpha: 0.35,
    });
  }, [histogram, size]);

  const dirty = hasAnyEdits(value);
  const resetDisabled = disabled || !onReset || !dirty;

  const activePoints = useMemo(
    () => getActivePoints(value, activeChannel),
    [value, activeChannel],
  );
  const sortedActive = useMemo(
    () => [...activePoints].sort((a, b) => a[0] - b[0]),
    [activePoints],
  );
  const lastIndex = sortedActive.length - 1;

  const activePath = useMemo(
    () => buildSmoothPath(sortedActive, size),
    [sortedActive, size],
  );
  const ghostPaths = useMemo(() => {
    return CHANNEL_ORDER.filter((c) => c !== activeChannel).map((c) => {
      const idx = CHANNEL_INDEX[c];
      const pts = value?.[idx];
      if (!pts || isIdentity(pts)) return null;
      return { channel: c, d: buildSmoothPath(pts, size) };
    }).filter((entry): entry is { channel: CurvesChannel; d: string } => entry !== null);
  }, [value, activeChannel, size]);

  const handleChannelChange = (next: string) => {
    const channel = (CHANNEL_ORDER as readonly string[]).includes(next)
      ? (next as CurvesChannel)
      : "rgb";
    applyChannelChange(channel);
  };

  const writeChannelPoints = (points: CurvePoint[]) => {
    const next = ensureChannels(value);
    next[CHANNEL_INDEX[activeChannel]] = points;
    onChange(next);
  };

  const eventToCurveCoords = (event: {
    clientX: number;
    clientY: number;
  }): CurvePoint => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    const px = clamp(event.clientX - rect.left, 0, rect.width);
    const py = clamp(event.clientY - rect.top, 0, rect.height);
    const x = px / rect.width;
    const y = 1 - py / rect.height;
    return [x, y];
  };

  /** Remove a control point. No-ops on endpoints (x=0, x=1) — those are
   *  structural anchors of the curve and removing them would leave the
   *  curve undefined past either edge. */
  const removePointAt = (index: number): void => {
    if (disabled) return;
    if (index === 0 || index === lastIndex) return;
    const next = sortedActive.filter((_, i) => i !== index);
    writeChannelPoints(next);
    onCommit?.();
  };

  /** Insert a new control point at the given normalized 0..1 coordinates,
   *  clamped to a sub-epsilon away from any existing point so neighbours
   *  never collide. Identity-respecting: if `y` is omitted, we interpolate
   *  the current curve at `x` so the new point starts on-curve. */
  const addPointAt = (x: number, y?: number): void => {
    if (disabled) return;
    const insertMin = POINT_EPSILON;
    const insertMax = 1 - POINT_EPSILON;
    let insertX = clamp(x, insertMin, insertMax);
    while (sortedActive.some((p) => Math.abs(p[0] - insertX) < POINT_EPSILON / 2)) {
      insertX = clamp(insertX + POINT_EPSILON, insertMin, insertMax);
      if (insertX >= insertMax) break;
    }
    const newY = clamp(
      y !== undefined ? y : interpolateY(sortedActive, insertX),
      0,
      1,
    );
    const newPoint: CurvePoint = [insertX, newY];
    const next: CurvePoint[] = [...sortedActive, newPoint].sort(
      (a, b) => a[0] - b[0],
    );
    writeChannelPoints(next);
    onCommit?.();
  };

  const handlePointPointerDown = (
    event: ReactPointerEvent<SVGCircleElement>,
    index: number,
  ) => {
    if (disabled) return;
    event.stopPropagation();
    // Shift-click removes a non-endpoint control point.
    if (event.shiftKey) {
      removePointAt(index);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, index };
  };

  /** Double-click on a node removes it (alternative to shift-click).
   *  Endpoints stay — `removePointAt` handles that no-op. */
  const handlePointDoubleClick = (
    event: ReactMouseEvent<SVGCircleElement>,
    index: number,
  ) => {
    event.stopPropagation();
    removePointAt(index);
  };

  const handlePointPointerMove = (
    event: ReactPointerEvent<SVGCircleElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const [rawX, rawY] = eventToCurveCoords(event);
    const next = sortedActive.map((p) => [p[0], p[1]] as CurvePoint);
    const isFirst = drag.index === 0;
    const isLast = drag.index === lastIndex;
    const minX = isFirst ? 0 : next[drag.index - 1][0] + POINT_EPSILON;
    const maxX = isLast ? 1 : next[drag.index + 1][0] - POINT_EPSILON;
    const x = isFirst ? 0 : isLast ? 1 : clamp(rawX, minX, maxX);
    const y = clamp(rawY, 0, 1);
    next[drag.index] = [x, y];
    writeChannelPoints(next);
  };

  const handlePointPointerUp = (
    event: ReactPointerEvent<SVGCircleElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore: capture may already be released
    }
    dragRef.current = null;
    onCommit?.();
  };

  const handleSurfacePointerDown = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (disabled) return;
    if (event.target !== event.currentTarget) return; // points handle their own
    // Right-click goes to the context menu, not surface-add.
    if (event.button !== 0) return;
    const [x] = eventToCurveCoords(event);
    addPointAt(x);
  };

  // Context-menu target tracking. We use one ContextMenu wrapping the SVG;
  // the menu items are conditional on what was right-clicked (a node circle
  // vs. the empty surface). We capture the position + index in onContextMenu
  // before the menu opens.
  const [contextTarget, setContextTarget] = useState<
    | { type: "node"; index: number }
    | { type: "surface"; x: number; y: number }
    | null
  >(null);

  const handleContextMenu = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (disabled) return;
    const target = event.target as SVGElement;
    const indexAttr = target.getAttribute("data-curve-index");
    if (indexAttr !== null) {
      setContextTarget({ type: "node", index: Number(indexAttr) });
    } else {
      const [x, y] = eventToCurveCoords(event);
      setContextTarget({ type: "surface", x, y });
    }
  };

  const strokeColor = CHANNEL_STROKE[activeChannel];

  return (
    <TooltipProvider>
      <section
        aria-label="Curves"
        className={cn(
          "flex h-full min-w-0 flex-col bg-background text-foreground",
          className,
        )}
        data-slot="curves-panel"
      >
        <PanelResetHeader
          title="Curves"
          description="RGB and per-channel tone curves"
          onReset={onReset}
          resetDisabled={resetDisabled}
        />

        <FieldGroup className="min-h-0 flex-1 gap-4 overflow-auto px-4 py-4">
          <FieldSet className="gap-3">
            <FieldLegend id={tabsLabelId} className="sr-only">
              Channel
            </FieldLegend>
            <Tabs
              onValueChange={handleChannelChange}
              value={activeChannel}
            >
              <TabsList className="grid w-full grid-cols-4">
                {CHANNEL_ORDER.map((channel) => (
                  <Tooltip key={channel}>
                    <TooltipTrigger asChild>
                      <TabsTrigger
                        aria-label={`${CHANNEL_LABEL[channel]} channel`}
                        disabled={disabled}
                        value={channel}
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: CHANNEL_STROKE[channel] }}
                        />
                        <span>{CHANNEL_LABEL[channel]}</span>
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {channel === "rgb"
                        ? "Composite (applied first)"
                        : `${CHANNEL_LABEL[channel]} channel`}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex flex-col items-center gap-2">
              <div
                className="relative overflow-hidden rounded-md border bg-muted/30"
                style={{ width: size, height: size }}
              >
                {/* Histogram backdrop. Pointer-events:none so all interaction
                    falls through to the SVG curve editor sitting on top. */}
                <canvas
                  ref={histogramCanvasRef}
                  aria-hidden="true"
                  className="absolute inset-0 size-full"
                  width={size}
                  height={size}
                  style={{ pointerEvents: "none" }}
                />
                <ContextMenu>
                <ContextMenuTrigger asChild>
                <svg
                  ref={svgRef}
                  className={cn(
                    "relative block touch-none",
                    disabled && "pointer-events-none opacity-60",
                  )}
                  height={size}
                  onPointerDown={handleSurfacePointerDown}
                  onContextMenu={handleContextMenu}
                  role="img"
                  aria-label={`${CHANNEL_LABEL[activeChannel]} curve editor`}
                  viewBox={`0 0 ${size} ${size}`}
                  width={size}
                >
                  {/* grid */}
                  <g
                    aria-hidden="true"
                    pointerEvents="none"
                    stroke="currentColor"
                    strokeOpacity={0.12}
                  >
                    {[1, 2, 3].map((i) => (
                      <line
                        key={`vx-${i}`}
                        x1={(i * size) / 4}
                        y1={0}
                        x2={(i * size) / 4}
                        y2={size}
                      />
                    ))}
                    {[1, 2, 3].map((i) => (
                      <line
                        key={`hy-${i}`}
                        x1={0}
                        y1={(i * size) / 4}
                        x2={size}
                        y2={(i * size) / 4}
                      />
                    ))}
                  </g>
                  {/* identity diagonal */}
                  <line
                    aria-hidden="true"
                    pointerEvents="none"
                    stroke="currentColor"
                    strokeOpacity={0.2}
                    strokeDasharray="4 4"
                    x1={0}
                    y1={size}
                    x2={size}
                    y2={0}
                  />
                  {/* dimmed ghost curves for inactive channels */}
                  {ghostPaths.map(({ channel, d }) => (
                    <path
                      key={channel}
                      d={d}
                      fill="none"
                      pointerEvents="none"
                      stroke={CHANNEL_STROKE[channel]}
                      strokeOpacity={0.25}
                      strokeWidth={1.5}
                    />
                  ))}
                  {/* active curve — visual only; clicks fall through to the
                      SVG surface handler so the hit target is the whole grid */}
                  <path
                    d={activePath}
                    fill="none"
                    pointerEvents="none"
                    stroke={strokeColor}
                    strokeWidth={2}
                  />
                  {/* control points */}
                  {sortedActive.map((p, i) => {
                    const cx = p[0] * size;
                    const cy = size - p[1] * size;
                    const isEndpoint = i === 0 || i === lastIndex;
                    return (
                      <circle
                        key={`pt-${i}`}
                        // Read by `handleContextMenu` to identify which
                        // node was right-clicked (vs. the empty surface).
                        data-curve-index={i}
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill="var(--background, #fff)"
                        stroke={strokeColor}
                        strokeWidth={2}
                        style={{
                          cursor: disabled
                            ? "not-allowed"
                            : isEndpoint
                              ? "ns-resize"
                              : "grab",
                        }}
                        onPointerDown={(event) =>
                          handlePointPointerDown(event, i)
                        }
                        onPointerMove={handlePointPointerMove}
                        onPointerUp={handlePointPointerUp}
                        onPointerCancel={handlePointPointerUp}
                        onDoubleClick={(event) =>
                          handlePointDoubleClick(event, i)
                        }
                      />
                    );
                  })}
                </svg>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {contextTarget?.type === "node" ? (
                    <ContextMenuItem
                      disabled={
                        contextTarget.index === 0 ||
                        contextTarget.index === lastIndex
                      }
                      onSelect={() => removePointAt(contextTarget.index)}
                    >
                      Remove point
                    </ContextMenuItem>
                  ) : null}
                  {contextTarget?.type === "surface" ? (
                    <ContextMenuItem
                      onSelect={() =>
                        addPointAt(contextTarget.x, contextTarget.y)
                      }
                    >
                      Add point here
                    </ContextMenuItem>
                  ) : null}
                </ContextMenuContent>
                </ContextMenu>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Click to add. Drag to move. Double-click or right-click to
                remove.
              </p>
            </div>
          </FieldSet>
        </FieldGroup>
      </section>
    </TooltipProvider>
  );
}

export type ImageEditorCurvesProps = Partial<CurvesPanelProps>;

/** Tone curves (RGB + per channel) over a live histogram, wired to the nearest `<ImageEditorProvider>`. */
export function ImageEditorCurves(props: ImageEditorCurvesProps) {
  const editor = useImageEditor();
  return (
    <CurvesPanel
      disabled={editor.disabled}
      histogram={editor.curves.histogram}
      onChange={editor.curves.set}
      onCommit={editor.curves.commit}
      onReset={editor.curves.reset}
      value={editor.curves.value}
      {...props}
    />
  );
}
