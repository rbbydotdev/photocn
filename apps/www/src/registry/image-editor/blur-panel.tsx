"use client";

import { useId, type ReactNode } from "react";
import { ApertureIcon, CircleDotIcon } from "lucide-react";

import { useControllableState } from "photocn/hooks";
import { useImageEditor } from "photocn/react";

import { PanelResetHeader } from "./panel-header";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface BlurPanelValue {
  bokehStrength: number;
  bokehLensOut: number;
  gaussianStrength: number;
  gaussianLensOut: number;
  centerX: number;
  centerY: number;
}

export type BlurPanelKind = "bokeh" | "gaussian";

export interface BlurPanelProps {
  value: BlurPanelValue;
  activeKind?: BlurPanelKind;
  disabled?: boolean;
  className?: string;
  /** Called transient on slider drag; the parent uses `commitPatchSectionTransient` so drags coalesce into one undo step. */
  onChange: (next: BlurPanelValue) => void;
  onActiveKindChange?: (kind: BlurPanelKind) => void;
  onReset?: () => void;
}

export const blurPanelDefaultValue: BlurPanelValue = {
  bokehStrength: 0,
  bokehLensOut: 0.5,
  gaussianStrength: 0,
  gaussianLensOut: 0.5,
  centerX: 0.5,
  centerY: 0.5,
};

export function isBlurPanelValueDefault(value: BlurPanelValue): boolean {
  return (
    value.bokehStrength === blurPanelDefaultValue.bokehStrength &&
    value.bokehLensOut === blurPanelDefaultValue.bokehLensOut &&
    value.gaussianStrength === blurPanelDefaultValue.gaussianStrength &&
    value.gaussianLensOut === blurPanelDefaultValue.gaussianLensOut &&
    value.centerX === blurPanelDefaultValue.centerX &&
    value.centerY === blurPanelDefaultValue.centerY
  );
}

interface BlurKindConfig {
  value: BlurPanelKind;
  label: string;
  description: string;
  icon: typeof ApertureIcon;
  strengthKey: "bokehStrength" | "gaussianStrength";
  lensOutKey: "bokehLensOut" | "gaussianLensOut";
  strengthLabel: string;
  lensOutLabel: string;
}

const blurKindConfigs = [
  {
    value: "bokeh",
    label: "Bokeh",
    description: "Lens-style circular bokeh",
    icon: ApertureIcon,
    strengthKey: "bokehStrength",
    lensOutKey: "bokehLensOut",
    strengthLabel: "Strength",
    lensOutLabel: "Radius",
  },
  {
    value: "gaussian",
    label: "Gaussian",
    description: "Soft gaussian falloff",
    icon: CircleDotIcon,
    strengthKey: "gaussianStrength",
    lensOutKey: "gaussianLensOut",
    strengthLabel: "Strength",
    lensOutLabel: "Radius",
  },
] as const satisfies readonly BlurKindConfig[];

export function BlurPanel({
  value,
  activeKind,
  disabled = false,
  className,
  onChange,
  onActiveKindChange,
  onReset,
}: BlurPanelProps) {
  const [currentKind, handleKindChange] = useControllableState<BlurPanelKind>({
    value: activeKind,
    defaultValue: "bokeh",
    onChange: onActiveKindChange,
  });

  const isDefault = isBlurPanelValueDefault(value);
  const resetDisabled = disabled || !onReset || isDefault;

  const updateValue = <TKey extends keyof BlurPanelValue>(
    key: TKey,
    next: BlurPanelValue[TKey],
  ) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <TooltipProvider>
      <section
        aria-label="Blur"
        className={cn(
          "flex h-full min-w-0 flex-col bg-background text-foreground",
          className,
        )}
        data-slot="blur-panel"
      >
        <PanelResetHeader
          title="Blur"
          description="Bokeh and gaussian blur"
          onReset={onReset}
          resetDisabled={resetDisabled}
        />

        <Tabs
          className="min-h-0 flex-1 gap-0"
          onValueChange={(kind) => handleKindChange(kind as BlurPanelKind)}
          value={currentKind}
        >
          <div className="px-4 py-3">
            <TabsList className="grid w-full grid-cols-2" variant="line">
              {blurKindConfigs.map((kind) => (
                <BlurKindTabTrigger
                  disabled={disabled}
                  key={kind.value}
                  kind={kind}
                />
              ))}
            </TabsList>
          </div>
          <Separator />

          <FieldGroup className="min-h-0 flex-1 gap-5 overflow-auto px-4 py-4">
            {blurKindConfigs.map((kind) => (
              <TabsContent
                className="m-0 flex flex-col gap-4"
                key={kind.value}
                value={kind.value}
              >
                <BlurSlider
                  disabled={disabled}
                  label={kind.strengthLabel}
                  onValueChange={(next) =>
                    updateValue(kind.strengthKey, next)
                  }
                  value={value[kind.strengthKey]}
                />
                <BlurSlider
                  disabled={disabled}
                  label={kind.lensOutLabel}
                  onValueChange={(next) => updateValue(kind.lensOutKey, next)}
                  value={value[kind.lensOutKey]}
                />
              </TabsContent>
            ))}

            <Separator />

            <PanelSection title="Center">
              <BlurSlider
                disabled={disabled}
                label="X"
                onValueChange={(next) => updateValue("centerX", next)}
                value={value.centerX}
              />
              <BlurSlider
                disabled={disabled}
                label="Y"
                onValueChange={(next) => updateValue("centerY", next)}
                value={value.centerY}
              />
            </PanelSection>
          </FieldGroup>
        </Tabs>
      </section>
    </TooltipProvider>
  );
}

function BlurKindTabTrigger({
  disabled,
  kind,
}: {
  disabled?: boolean;
  kind: (typeof blurKindConfigs)[number];
}) {
  const Icon = kind.icon;

  // No Tooltip wrapper — TooltipTrigger asChild clobbers Radix Tabs'
  // data-state, hiding the active underline. Use title for hover hints.
  return (
    <TabsTrigger
      aria-label={kind.label}
      disabled={disabled}
      title={kind.description}
      value={kind.value}
    >
      <Icon aria-hidden="true" />
      <span>{kind.label}</span>
    </TabsTrigger>
  );
}

function PanelSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <FieldSet className="gap-3" data-slot="blur-section">
      <FieldLegend
        className="mb-0 text-xs font-semibold uppercase text-muted-foreground"
        variant="label"
      >
        {title}
      </FieldLegend>
      <FieldGroup className="gap-3">{children}</FieldGroup>
    </FieldSet>
  );
}

function BlurSlider({
  disabled,
  label,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const sliderId = useId();
  const labelId = `${sliderId}-label`;

  return (
    <Field data-disabled={disabled} data-slot="blur-slider">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={sliderId} id={labelId}>
          {label}
        </FieldLabel>
        <output className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatPercent(value)}
        </output>
      </div>
      <FieldContent>
        <Slider
          aria-labelledby={labelId}
          disabled={disabled}
          id={sliderId}
          max={100}
          min={0}
          onValueChange={(next) =>
            onValueChange(fromSliderPercent(next, value))
          }
          step={1}
          value={[toSliderPercent(value)]}
        />
      </FieldContent>
    </Field>
  );
}

function toSliderPercent(value: number): number {
  return Math.round(clamp01(value) * 100);
}

function fromSliderPercent(next: number[], fallback: number): number {
  const raw = next[0];
  if (raw === undefined) return fallback;
  return clamp01(raw / 100);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatPercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

export type ImageEditorBlurProps = Partial<BlurPanelProps>;

/** Bokeh / gaussian lens blur wired to the nearest `<ImageEditorProvider>`. */
export function ImageEditorBlur(props: ImageEditorBlurProps) {
  const editor = useImageEditor();
  return (
    <BlurPanel
      disabled={editor.disabled}
      onChange={editor.blur.set}
      onReset={editor.blur.reset}
      value={editor.blur.value}
      {...props}
    />
  );
}
