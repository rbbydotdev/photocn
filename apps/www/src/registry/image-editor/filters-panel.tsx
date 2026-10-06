"use client";

import { useId, useState } from "react";
import { Loader2Icon } from "lucide-react";

import type { FilterOption } from "photocn";
import { filterPresets } from "photocn/filters";
import { useImageEditor } from "photocn/react";

import { PanelResetHeader } from "./panel-header";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FiltersPanelValue {
  label: string | null;
  /** 0 = original photo, 1 = full filter. */
  strength: number;
}

export interface FiltersPanelOption {
  label: string;
  load: () => Promise<FilterOption>;
}

export interface FiltersPanelSelection {
  label: string;
  opt: FilterOption;
}

export interface FiltersPanelProps {
  value: FiltersPanelValue;
  options?: readonly FiltersPanelOption[];
  disabled?: boolean;
  className?: string;
  onSelect: (next: FiltersPanelSelection | null) => void;
  onStrengthChange?: (strength: number) => void;
  onReset?: () => void;
}

/** Built-in presets: 9 LUT looks + 4 color matrices. */
export const filtersPanelDefaultOptions: readonly FiltersPanelOption[] = filterPresets;

export function FiltersPanel({
  value,
  options = filtersPanelDefaultOptions,
  disabled = false,
  className,
  onSelect,
  onStrengthChange,
  onReset,
}: FiltersPanelProps) {
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const strengthSliderId = useId();

  const isLoading = loadingLabel !== null;
  const activeLabel = value.label;
  const strengthPercent = Math.round(clamp01(value.strength) * 100);

  const handleSelect = async (option: FiltersPanelOption) => {
    if (disabled || isLoading) return;
    setLoadingLabel(option.label);
    try {
      const opt = await option.load();
      onSelect({ label: option.label, opt });
    } finally {
      setLoadingLabel(null);
    }
  };

  const handleClear = () => {
    if (disabled || isLoading) return;
    onSelect(null);
  };

  const handleStrengthChange = (next: number[]) => {
    const raw = next[0] ?? strengthPercent;
    onStrengthChange?.(clamp01(raw / 100));
  };

  return (
    <TooltipProvider>
      <section
        aria-label="Filters"
        className={cn(
          "flex h-full min-w-0 flex-col bg-background text-foreground",
          className,
        )}
        data-slot="filters-panel"
      >
        <PanelResetHeader
          title="Filters"
          description="Film-style looks"
          onReset={onReset}
          resetDisabled={disabled}
        />

        <FieldGroup className="min-h-0 flex-1 gap-5 overflow-auto px-4 py-4">
          <div
            className="grid grid-cols-3 gap-2 @md/field-group:grid-cols-4"
            data-slot="filters-grid"
          >
            <Button
              aria-pressed={activeLabel === null}
              className={cn(
                "h-9 px-2 text-xs",
                activeLabel === null && "ring-2 ring-ring",
              )}
              disabled={disabled || isLoading}
              onClick={handleClear}
              type="button"
              variant={activeLabel === null ? "default" : "outline"}
            >
              None
            </Button>
            {options.map((option) => {
              const selected = activeLabel === option.label;
              const loading = loadingLabel === option.label;
              return (
                <Button
                  aria-pressed={selected}
                  className={cn(
                    "h-9 px-2 text-xs capitalize",
                    selected && "ring-2 ring-ring",
                  )}
                  disabled={
                    disabled || (isLoading && !loading)
                  }
                  key={option.label}
                  onClick={() => handleSelect(option)}
                  type="button"
                  variant={selected ? "default" : "outline"}
                >
                  {loading ? (
                    <>
                      <Loader2Icon
                        aria-hidden="true"
                        className="animate-spin"
                      />
                      <span className="sr-only">Loading {option.label}</span>
                    </>
                  ) : (
                    option.label
                  )}
                </Button>
              );
            })}
          </div>

          {activeLabel !== null ? (
            <Field data-slot="filters-strength" data-disabled={disabled}>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor={strengthSliderId}>Strength</FieldLabel>
                <output className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {strengthPercent}%
                </output>
              </div>
              <Slider
                aria-label="Filter strength"
                disabled={disabled || !onStrengthChange}
                id={strengthSliderId}
                max={100}
                min={0}
                onValueChange={handleStrengthChange}
                step={1}
                value={[strengthPercent]}
              />
            </Field>
          ) : null}
        </FieldGroup>
      </section>
    </TooltipProvider>
  );
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export type ImageEditorFiltersProps = Partial<FiltersPanelProps>;

/** LUT / color-matrix presets with a strength slider, wired to the nearest `<ImageEditorProvider>`. */
export function ImageEditorFilters(props: ImageEditorFiltersProps) {
  const editor = useImageEditor();
  return (
    <FiltersPanel
      disabled={editor.disabled}
      onStrengthChange={editor.filters.setStrength}
      onReset={editor.filters.reset}
      onSelect={(next) =>
        next
          ? editor.patch("filters", { opt: next.opt, mix: 0 })
          : void editor.filters.select(null)
      }
      options={editor.filters.presets}
      value={editor.filters.value}
      {...props}
    />
  );
}

