"use client";

import { useId } from "react";
import { ImageEditorProvider, useImageEditor } from "photocn/react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { ImageEditorCanvas } from "@/registry/image-editor/canvas";

export default function FilterStripExample() {
  return (
    <ImageEditorProvider src="/samples/strawberries.jpg">
      <div className="mx-auto flex h-[640px] max-w-sm flex-col overflow-hidden rounded-3xl border bg-background shadow-sm">
        <ImageEditorCanvas className="min-h-0 flex-1 p-2" showOpenButton={false} />
        <FilterStrip />
      </div>
    </ImageEditorProvider>
  );
}

// A custom control built only from `useImageEditor()` — no photocn panel.
function FilterStrip() {
  const { filters, isReady } = useImageEditor();
  const strengthLabelId = useId();
  return (
    <div className="flex flex-col gap-3 border-t p-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterChip
          active={filters.value.label === null}
          disabled={!isReady}
          label="Original"
          onClick={() => void filters.select(null)}
        />
        {filters.presets.map((preset) => (
          <FilterChip
            active={filters.value.label === preset.label}
            disabled={!isReady || filters.loading !== null}
            key={preset.label}
            label={preset.label}
            onClick={() => void filters.select(preset)}
          />
        ))}
      </div>
      {filters.value.label ? (
        <>
          <span className="sr-only" id={strengthLabelId}>
            Filter strength
          </span>
          <Slider
            aria-labelledby={strengthLabelId}
            max={100}
            onValueChange={(next) => filters.setStrength(((typeof next === "number" ? next : next[0]) ?? 0) / 100)}
            value={[Math.round(filters.value.strength * 100)]}
          />
        </>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  label,
  ...props
}: { active: boolean; label: string } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      aria-pressed={active}
      className={cn("shrink-0 rounded-full capitalize", active && "shadow-sm")}
      size="sm"
      variant={active ? "default" : "outline"}
      {...props}
    >
      {label}
    </Button>
  );
}
