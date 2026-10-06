"use client";

import dynamic from "next/dynamic";
import { useId, type ReactNode } from "react";
import type { CurveChannels, CurvePoint } from "photocn";
import { ImageEditorProvider, useImageEditor } from "photocn/react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { LazyMount } from "./lazy-mount";

const ImageEditor = dynamic(() => import("@/registry/image-editor/image-editor").then((m) => m.ImageEditor), { ssr: false });
const ImageEditorCanvas = dynamic(() => import("@/registry/image-editor/canvas").then((m) => m.ImageEditorCanvas), { ssr: false });
const FilterPicker = dynamic(() => import("@/registry/blocks/filter-picker").then((m) => m.FilterPicker), { ssr: false });
const BeforeAfter = dynamic(() => import("@/registry/blocks/before-after").then((m) => m.BeforeAfter), { ssr: false });
const AvatarCropper = dynamic(() => import("@/registry/blocks/avatar-cropper").then((m) => m.AvatarCropper), { ssr: false });
const BatchLooks = dynamic(() => import("@/registry/blocks/batch-looks").then((m) => m.BatchLooks), { ssr: false });

function Tile({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("relative min-h-[320px] overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm", className)}
      data-slot="bento-tile"
    >
      <LazyMount>{children}</LazyMount>
      {label ? <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium shadow-sm backdrop-blur">
        {label}
      </span> : null}
    </div>
  );
}

/** Live examples, mapcn-style: every tile is a real editor. */
export function Bento() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[320px] lg:grid-cols-4">
      <Tile className="h-[640px] sm:col-span-2 lg:row-span-2 lg:h-auto">
        <ImageEditor className="min-h-0" showHistogram={false} showRecipes={false} src="/samples/mountain-lake.jpg" />
      </Tile>
      <Tile className="h-[640px] lg:row-span-2 lg:h-auto">
        <FilterPicker className="h-full max-w-none rounded-none border-0" src="/samples/strawberries.jpg" />
      </Tile>
      <Tile label="Before / after">
        <div className="flex size-full items-center justify-center bg-muted/30 p-3 pt-10">
          <BeforeAfter className="max-h-full" lights={{ exposure: 0.2, contrast: 0.3 }} filter="lark" src="/samples/street.jpg" />
        </div>
      </Tile>
      <Tile label="Straighten">
        <ImageEditorProvider defaultTool="compose" keyboardShortcuts={false} src="/samples/dog.jpg">
          <StraightenTile />
        </ImageEditorProvider>
      </Tile>
      <Tile className="sm:col-span-2" label="Looks">
        <div className="flex size-full flex-col justify-center p-4 pt-12">
          <BatchLooks
            photos={["/samples/dog.jpg", "/samples/street.jpg", "/samples/portrait.jpg", "/samples/strawberries.jpg"]}
          />
        </div>
      </Tile>
      <Tile label="Curves">
        <ImageEditorProvider keyboardShortcuts={false} src="/samples/portrait.jpg">
          <CurvesTile />
        </ImageEditorProvider>
      </Tile>
      <Tile label="Avatar">
        <div className="flex size-full flex-col items-center justify-center gap-3 p-6">
          <AvatarCropper defaultSrc="/samples/portrait.jpg" />
          <p className="text-center text-xs text-muted-foreground">Square crop, saved at 512px.</p>
        </div>
      </Tile>
    </div>
  );
}

function StraightenTile() {
  const { geometry } = useImageEditor();
  const labelId = useId();
  return (
    <div className="flex size-full flex-col pt-8">
      <ImageEditorCanvas className="min-h-0 flex-1" padding={12} showOpenButton={false} />
      <div className="flex items-center gap-3 border-t px-4 py-3 text-sm">
        <span className="w-14 tabular-nums text-muted-foreground">{geometry.value.straighten.toFixed(1)}°</span>
        <span className="sr-only" id={labelId}>
          Straighten
        </span>
        <Slider
          aria-labelledby={labelId}
          max={45}
          min={-45}
          onValueChange={(next) =>
            geometry.setStraighten((typeof next === "number" ? next : next[0]) ?? 0, { transient: true })
          }
          onValueCommitted={() => geometry.commit()}
          step={0.1}
          value={[geometry.value.straighten]}
        />
      </div>
    </div>
  );
}

const line: CurvePoint[] = [
  [0, 0],
  [1, 1],
];
const curvePresets: { label: string; rgb: CurvePoint[] }[] = [
  { label: "Linear", rgb: line },
  { label: "Contrast", rgb: [[0, 0], [0.25, 0.1], [0.75, 0.9], [1, 1]] },
  { label: "Fade", rgb: [[0, 0.12], [0.5, 0.52], [1, 0.92]] },
  { label: "Bright", rgb: [[0, 0], [0.4, 0.55], [1, 1]] },
];

function CurvesTile() {
  const { curves } = useImageEditor();
  return (
    <div className="flex size-full flex-col pt-8">
      <ImageEditorCanvas className="min-h-0 flex-1" padding={12} showOpenButton={false} />
      <div className="flex gap-1.5 overflow-x-auto border-t p-3 [scrollbar-width:none]">
        {curvePresets.map((preset) => (
          <Button
            className="shrink-0"
            key={preset.label}
            onClick={() =>
              preset.rgb === line ? curves.reset() : curves.set([preset.rgb, line, line, line] as CurveChannels)
            }
            size="sm"
            variant="outline"
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
