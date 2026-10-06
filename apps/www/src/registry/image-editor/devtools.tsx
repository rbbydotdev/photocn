"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GaugeIcon,
  GripHorizontalIcon,
} from "lucide-react";
import type {
  BridgeConfig,
  BridgeStats,
  WorkerEditor,
} from "photocn/worker";

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useImageEditor } from "photocn/react";

export interface DevPanelProps {
  worker: WorkerEditor | undefined;
  className?: string;
}

/**
 * Floating, always-on dev panel for the photo editor's worker bridge.
 *
 * Subscribes to per-paint stats via `worker.onStats` and renders a live
 * timing breakdown (replay/read/hist + RTT). Lets you flip runtime knobs
 * (proxy on/off, idle ms, histogram stride, skip-noise-on-proxy) without
 * reloading. Toggling is immediate — next paint reflects the new config.
 *
 * Position: bottom-right, fixed, semi-transparent. Collapse to a single
 * gauge button to get out of your way.
 */
/** Persists drag-positioned panel coordinates so the panel reopens where the
 *  user last dropped it. Top-left in viewport pixels (since the panel
 *  switches from bottom-right anchoring to top-left as soon as you drag). */
const POSITION_STORAGE_KEY = "lw:photo-edit:dev-panel-pos";

interface PanelPosition {
  x: number;
  y: number;
}

function readStoredPosition(): PanelPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function writeStoredPosition(pos: PanelPosition): void {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* ignore — quota or sandbox; panel still works in-session */
  }
}

export function DevPanel({ worker, className }: DevPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [config, setConfigState] = useState<BridgeConfig | null>(null);
  const [stats, setStats] = useState<BridgeStats | null>(null);
  // null = use the default bottom-right anchor; once dragged, becomes
  // top-left viewport coords so the panel sticks where the user dropped it.
  const [position, setPosition] = useState<PanelPosition | null>(() =>
    typeof window !== "undefined" ? readStoredPosition() : null,
  );
  // Slider's local state for proxy max dim. Initialized from the worker's
  // current proxy size; written through to the worker on change. Kept here
  // (not in BridgeConfig) because the value is per-worker not per-config —
  // a new image load will re-derive a default rather than reusing this.
  const [proxyMaxDim, setProxyMaxDim] = useState(0);
  useEffect(() => {
    if (!worker) return;
    setProxyMaxDim(
      worker.proxySize
        ? Math.max(worker.proxySize.width, worker.proxySize.height)
        : 0,
    );
  }, [worker]);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync with the bridge: read initial config + subscribe to per-paint stats.
  useEffect(() => {
    if (!worker) return;
    setConfigState(worker.getConfig());
    setStats(worker.getStats());
    const off = worker.onStats(setStats);
    return off;
  }, [worker]);

  if (!worker || !config) {
    return null;
  }

  const update = (patch: Partial<BridgeConfig>) => {
    worker.setConfig(patch);
    setConfigState(worker.getConfig());
  };

  const handleDragPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Left button only; ignore drags initiated from the collapse button etc.
    if (event.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    // Pointer capture means we keep getting move/up events even if the
    // pointer leaves the panel during a fast drag.
    event.currentTarget.setPointerCapture(event.pointerId);
    // Snap into absolute top-left coords so subsequent setPosition writes
    // place the panel where the cursor expects.
    setPosition({ x: rect.left, y: rect.top });
    event.preventDefault();
  };

  const handleDragPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const panel = panelRef.current;
    const next: PanelPosition = {
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    };
    // Clamp inside the viewport so the panel can't be lost off-screen.
    if (panel) {
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      next.x = Math.max(0, Math.min(window.innerWidth - w, next.x));
      next.y = Math.max(0, Math.min(window.innerHeight - h, next.y));
    }
    setPosition(next);
  };

  const handleDragPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (position) writeStoredPosition(position);
  };

  // Style: floating panel switches between two positioning regimes.
  // Default (untouched): pinned bottom-right via `right-4 bottom-4`.
  // Dragged: absolute top-left coords from `position`.
  const positionStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
    : {};

  if (collapsed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setCollapsed(false)}
        className={cn(
          "fixed right-4 bottom-4 z-50 size-9 rounded-full bg-background/90 shadow-md backdrop-blur",
          className,
        )}
        aria-label="Show dev panel"
      >
        <GaugeIcon aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={positionStyle}
      className={cn(
        "fixed z-50 w-72 rounded-lg border bg-background/95 shadow-xl backdrop-blur",
        // Default anchor only when the user hasn't dragged yet.
        !position && "right-4 bottom-4",
        className,
      )}
      role="region"
      aria-label="Photo editor dev panel"
    >
      <header
        className="flex cursor-grab touch-none items-center justify-between border-b px-3 py-2 active:cursor-grabbing"
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerUp}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <GripHorizontalIcon className="size-3.5" aria-hidden="true" />
          <GaugeIcon className="size-3.5" aria-hidden="true" />
          Dev
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          // Stop the click+drag pointerdown from also starting a drag.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed(true)}
          aria-label="Collapse dev panel"
        >
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="space-y-3 p-3">
        <StatsBlock stats={stats} proxyScale={worker.proxyScale} proxySize={worker.proxySize} />

        <Section label="Proxy">
          <Row>
            <Label htmlFor="dev-proxy-enabled" className="text-xs">
              Enabled
            </Label>
            <Switch
              id="dev-proxy-enabled"
              checked={config.proxyEnabled}
              onCheckedChange={(v) => update({ proxyEnabled: v })}
            />
          </Row>
          <NumberRow
            id="dev-proxy-max-dim"
            label="Max dim (px)"
            value={proxyMaxDim}
            min={0}
            max={4000}
            step={100}
            onChange={(v) => {
              setProxyMaxDim(v);
              void worker.setProxyMaxDim(v);
            }}
            help="Long edge of the preview-time bitmap. Lower = more aggressive downsample (snappier drag, softer preview). 0 disables."
          />
          <NumberRow
            id="dev-idle-ms"
            label="Idle ms"
            value={config.idleSwapMs}
            min={0}
            max={1000}
            step={50}
            onChange={(v) => update({ idleSwapMs: v })}
            help="Wait this long after the last drag before swapping back to full-res."
          />
        </Section>

        <Section label="Histogram">
          <NumberRow
            id="dev-stride"
            label="Stride"
            value={config.histogramStride}
            min={1}
            max={32}
            step={1}
            onChange={(v) => update({ histogramStride: Math.max(1, v) })}
            help="Sample every Nth pixel. Higher = faster, slightly less precise."
          />
        </Section>

        <Section label="Filters">
          <Row>
            <Label htmlFor="dev-skip-noise" className="text-xs">
              Skip noise on proxy
            </Label>
            <Switch
              id="dev-skip-noise"
              checked={config.skipNoiseOnProxy}
              onCheckedChange={(v) => update({ skipNoiseOnProxy: v })}
            />
          </Row>
        </Section>
      </div>
    </div>
  );
}

function StatsBlock({
  stats,
  proxyScale,
  proxySize,
}: {
  stats: BridgeStats | null;
  proxyScale: number;
  proxySize: { width: number; height: number } | null;
}) {
  return (
    <dl className="rounded-md border bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-tight">
      <KV
        k="level"
        v={
          stats ? (
            <span
              className={cn(
                "rounded px-1 font-semibold uppercase",
                stats.level === "proxy"
                  ? "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                  : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {stats.level}
            </span>
          ) : (
            "—"
          )
        }
      />
      <KV
        k="proxy"
        v={
          proxySize
            ? `${proxySize.width}×${proxySize.height} (${(proxyScale * 100).toFixed(1)}%)`
            : "none"
        }
      />
      <KV k="rtt" v={stats ? `${stats.rttMs.toFixed(1)}ms` : "—"} />
      <KV
        k="replay"
        v={stats ? `${stats.replayMs.toFixed(1)}ms` : "—"}
      />
      <KV k="read" v={stats ? `${stats.readMs.toFixed(1)}ms` : "—"} />
      <KV k="hist" v={stats ? `${stats.histMs.toFixed(1)}ms` : "—"} />
      <KV
        k="ops"
        v={stats ? `${stats.opCount}/${stats.rawOpCount}` : "—"}
      />
    </dl>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="space-y-1.5">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDownIcon className="size-3" aria-hidden="true" />
        ) : (
          <ChevronRightIcon className="size-3" aria-hidden="true" />
        )}
        {label}
      </button>
      {open ? <div className="space-y-2 pl-4">{children}</div> : null}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between">{children}</div>;
}

function NumberRow({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  help,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  help?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs">
          {label}
        </Label>
        <Input
          id={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          className="h-7 w-16 text-right font-mono text-xs"
        />
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange((typeof v === "number" ? v : v[0]) ?? value)}
      />
      {help ? (
        <p className="text-[10px] leading-snug text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

/**
 * Floating render stats (proxy size, paint timings) for the worker renderer.
 * Handy while tuning `proxyMaxDim`; don't ship it to users.
 */
export function ImageEditorDevtools({ className }: { className?: string }) {
  const editor = useImageEditor();
  if (!editor.worker) return null;
  return <DevPanel className={className} worker={editor.worker} />;
}

