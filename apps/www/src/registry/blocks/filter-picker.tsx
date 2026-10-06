"use client";

import { ImageEditorProvider, useImageEditor } from "photocn/react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorExportDialog } from "@/registry/image-editor/export-dialog";
import { cn } from "@/lib/utils";

/** Phone-style filter picker: the photo, a row of looks, a strength slider. */
export function FilterPicker({ src, className }: { src?: string | File | Blob; className?: string }) {
  return (
    <ImageEditorProvider src={src}>
      <div className={cn("flex h-[640px] max-w-sm flex-col overflow-hidden rounded-3xl border bg-background", className)}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Filters</span>
          <ImageEditorExportDialog />
        </div>
        <ImageEditorCanvas className="min-h-0 flex-1 p-2" showOpenButton={!src} />
        <Strip />
      </div>
    </ImageEditorProvider>
  );
}

function Strip() {
  const { filters, isReady } = useImageEditor();
  return (
    <div className="flex flex-col gap-3 border-t p-3">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {[null, ...filters.presets].map((preset) => {
          const label = preset?.label ?? null;
          const active = filters.value.label === label;
          return (
            <Button
              aria-pressed={active}
              className="h-10 shrink-0 rounded-full capitalize"
              disabled={!isReady || filters.loading !== null}
              key={label ?? "original"}
              onClick={() => void filters.select(preset)}
              size="sm"
              variant={active ? "default" : "outline"}
            >
              {label ?? "Original"}
            </Button>
          );
        })}
      </div>
      {filters.value.label ? (
        <Slider
          aria-label="Filter strength"
          max={100}
          onValueChange={([value]) => filters.setStrength((value ?? 0) / 100)}
          value={[Math.round(filters.value.strength * 100)]}
        />
      ) : null}
    </div>
  );
}
