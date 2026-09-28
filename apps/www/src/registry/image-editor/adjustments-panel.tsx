"use client";

import { useId, type ReactNode } from "react";

import { useControllableState } from "photocn/hooks";
import {
  adjustDefaultValue,
  useImageEditor,
  type AdjustColorValue,
  type AdjustEffectValue,
  type AdjustLightValue,
  type AdjustValue,
} from "photocn/react";
import {
  PaletteIcon,
  RotateCcwIcon,
  SparklesIcon,
  SunMediumIcon,
  type LucideIcon,
} from "lucide-react";

import { PanelResetHeader } from "./panel-header";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AdjustmentLightValue = AdjustLightValue;
export type AdjustmentColorValue = AdjustColorValue;
export type AdjustmentEffectValue = AdjustEffectValue;
export type AdjustmentPanelValue = AdjustValue;

export type AdjustmentPanelSection = keyof AdjustmentPanelValue;

export type AdjustmentPanelControlKey<
  TSection extends AdjustmentPanelSection,
> = Extract<keyof AdjustmentPanelValue[TSection], string>;

export interface AdjustmentSliderConfig<TKey extends string = string> {
  key: TKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface AdjustmentPanelSectionConfig<
  TSection extends AdjustmentPanelSection = AdjustmentPanelSection,
> {
  value: TSection;
  label: string;
  description: string;
  icon: LucideIcon;
  controls: readonly AdjustmentSliderConfig<AdjustmentPanelControlKey<TSection>>[];
}

export interface AdjustmentPanelProps {
  value: AdjustmentPanelValue;
  activeSection?: AdjustmentPanelSection;
  defaultSection?: AdjustmentPanelSection;
  disabled?: boolean;
  disabledSections?: Partial<Record<AdjustmentPanelSection, boolean>>;
  className?: string;
  onSectionChange?: (section: AdjustmentPanelSection) => void;
  onValueChange?: (value: AdjustmentPanelValue) => void;
  onLightsChange?: (lights: AdjustmentLightValue) => void;
  onColorsChange?: (colors: AdjustmentColorValue) => void;
  onEffectsChange?: (effects: AdjustmentEffectValue) => void;
  onReset?: () => void;
  onResetSection?: (section: AdjustmentPanelSection) => void;
}

export const adjustmentPanelDefaultValue: AdjustmentPanelValue = adjustDefaultValue;

export const adjustmentPanelSections = [
  {
    value: "lights",
    label: "Light",
    description: "Exposure, contrast, and tonal recovery",
    icon: SunMediumIcon,
    controls: [
      { key: "brightness", label: "Brightness", min: -1, max: 1, step: 0.01 },
      { key: "exposure", label: "Exposure", min: -1, max: 1, step: 0.01 },
      { key: "gamma", label: "Gamma", min: -1, max: 1, step: 0.01 },
      { key: "contrast", label: "Contrast", min: -1, max: 1, step: 0.01 },
      { key: "shadows", label: "Shadows", min: -1, max: 1, step: 0.01 },
      { key: "highlights", label: "Highlights", min: -1, max: 1, step: 0.01 },
      { key: "bloom", label: "Bloom", min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    value: "colors",
    label: "Color",
    description: "Temperature, tint, and color intensity",
    icon: PaletteIcon,
    controls: [
      { key: "temperature", label: "Temperature", min: -1, max: 1, step: 0.01 },
      { key: "tint", label: "Tint", min: -1, max: 1, step: 0.01 },
      { key: "vibrance", label: "Vibrance", min: -1, max: 1, step: 0.01 },
      { key: "saturation", label: "Saturation", min: -1, max: 1, step: 0.01 },
      { key: "sepia", label: "Sepia", min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    value: "effects",
    label: "Effects",
    description: "Texture, grain, and edge falloff",
    icon: SparklesIcon,
    controls: [
      { key: "clarity", label: "Clarity", min: -1, max: 1, step: 0.01 },
      { key: "noise", label: "Noise", min: -1, max: 1, step: 0.01 },
      { key: "vignette", label: "Vignette", min: -1, max: 1, step: 0.01 },
    ],
  },
] as const satisfies readonly [
  AdjustmentPanelSectionConfig<"lights">,
  AdjustmentPanelSectionConfig<"colors">,
  AdjustmentPanelSectionConfig<"effects">,
];

export function AdjustmentPanel({
  value,
  activeSection: activeSectionProp,
  defaultSection = "lights",
  disabled = false,
  disabledSections,
  className,
  onSectionChange,
  onValueChange,
  onLightsChange,
  onColorsChange,
  onEffectsChange,
  onReset,
  onResetSection,
}: AdjustmentPanelProps) {
  const [activeSection, handleSectionChange] = useControllableState<AdjustmentPanelSection>({
    value: activeSectionProp,
    defaultValue: defaultSection,
    onChange: onSectionChange,
  });
  const canChangeLights = Boolean(onValueChange || onLightsChange);
  const canChangeColors = Boolean(onValueChange || onColorsChange);
  const canChangeEffects = Boolean(onValueChange || onEffectsChange);
  const lightsDisabled = Boolean(
    disabled || disabledSections?.lights || !canChangeLights,
  );
  const colorsDisabled = Boolean(
    disabled || disabledSections?.colors || !canChangeColors,
  );
  const effectsDisabled = Boolean(
    disabled || disabledSections?.effects || !canChangeEffects,
  );

  const updateLights = (lights: AdjustmentLightValue) => {
    onLightsChange?.(lights);
    onValueChange?.({ ...value, lights });
  };

  const updateColors = (colors: AdjustmentColorValue) => {
    onColorsChange?.(colors);
    onValueChange?.({ ...value, colors });
  };

  const updateEffects = (effects: AdjustmentEffectValue) => {
    onEffectsChange?.(effects);
    onValueChange?.({ ...value, effects });
  };

  return (
    <TooltipProvider>
      <section
        aria-label="Adjustments"
        className={cn(
          "flex h-full min-w-0 flex-col bg-background text-foreground",
          className,
        )}
        data-slot="adjustment-panel"
      >
        <PanelResetHeader
          title="Adjustments"
          description="Light, color, and effects"
          onReset={onReset}
          resetDisabled={disabled}
        />

        <Tabs
          className="min-h-0 flex-1 gap-0"
          onValueChange={(section) =>
            handleSectionChange(section as AdjustmentPanelSection)
          }
          value={activeSection}
        >
          <div className="px-4 py-3">
            <TabsList className="grid w-full grid-cols-3" variant="line">
              {adjustmentPanelSections.map((section) => (
                <AdjustmentTabTrigger
                  disabled={disabled}
                  key={section.value}
                  section={section}
                />
              ))}
            </TabsList>
          </div>
          <Separator />

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            <TabsContent className="m-0" value="lights">
              <AdjustmentSectionFields
                controls={adjustmentPanelSections[0].controls}
                description={adjustmentPanelSections[0].description}
                disabled={lightsDisabled}
                onChange={updateLights}
                onReset={
                  onResetSection
                    ? () => onResetSection("lights")
                    : undefined
                }
                resetDisabled={lightsDisabled || !onResetSection}
                title={adjustmentPanelSections[0].label}
                value={value.lights}
              />
            </TabsContent>

            <TabsContent className="m-0" value="colors">
              <AdjustmentSectionFields
                controls={adjustmentPanelSections[1].controls}
                description={adjustmentPanelSections[1].description}
                disabled={colorsDisabled}
                onChange={updateColors}
                onReset={
                  onResetSection
                    ? () => onResetSection("colors")
                    : undefined
                }
                resetDisabled={colorsDisabled || !onResetSection}
                title={adjustmentPanelSections[1].label}
                value={value.colors}
              />
            </TabsContent>

            <TabsContent className="m-0" value="effects">
              <AdjustmentSectionFields
                controls={adjustmentPanelSections[2].controls}
                description={adjustmentPanelSections[2].description}
                disabled={effectsDisabled}
                onChange={updateEffects}
                onReset={
                  onResetSection
                    ? () => onResetSection("effects")
                    : undefined
                }
                resetDisabled={effectsDisabled || !onResetSection}
                title={adjustmentPanelSections[2].label}
                value={value.effects}
              />
            </TabsContent>
          </div>
        </Tabs>
      </section>
    </TooltipProvider>
  );
}

export type ImageEditorAdjustmentsProps = Partial<AdjustmentPanelProps>;

/** Light, color and effect sliders wired to the nearest `<ImageEditorProvider>`. */
export function ImageEditorAdjustments(props: ImageEditorAdjustmentsProps) {
  const editor = useImageEditor();
  return (
    <AdjustmentPanel
      disabled={editor.disabled}
      onColorsChange={editor.adjust.setColors}
      onEffectsChange={editor.adjust.setEffects}
      onLightsChange={editor.adjust.setLights}
      onReset={editor.adjust.reset}
      onResetSection={editor.adjust.resetSection}
      value={editor.adjust.value}
      {...props}
    />
  );
}

function AdjustmentTabTrigger({
  disabled,
  section,
}: {
  disabled?: boolean;
  section: (typeof adjustmentPanelSections)[number];
}) {
  const Icon = section.icon;

  // No Tooltip wrapper — TooltipTrigger asChild clobbers Radix Tabs'
  // data-state, hiding the active underline. Use title for hover hints.
  return (
    <TabsTrigger
      aria-label={section.label}
      disabled={disabled}
      title={section.description}
      value={section.value}
    >
      <Icon aria-hidden="true" />
      <span>{section.label}</span>
    </TabsTrigger>
  );
}

function AdjustmentSectionFields<
  TKey extends string,
  TValue extends Record<TKey, number>,
>({
  controls,
  description,
  disabled,
  onChange,
  onReset,
  resetDisabled,
  title,
  value,
}: {
  controls: readonly AdjustmentSliderConfig<TKey>[];
  description: string;
  disabled?: boolean;
  onChange?: (value: TValue) => void;
  onReset?: () => void;
  resetDisabled?: boolean;
  title: string;
  value: TValue;
}) {
  return (
    <FieldSet className="gap-4">
      <FieldLegend className="sr-only">{title}</FieldLegend>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <FieldTitle>{title}</FieldTitle>
          <FieldDescription>{description}</FieldDescription>
        </div>
        <IconButtonTooltip label={`Reset ${title.toLowerCase()}`}>
          <Button
            aria-label={`Reset ${title.toLowerCase()}`}
            disabled={resetDisabled}
            onClick={onReset}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          </Button>
        </IconButtonTooltip>
      </div>
      <FieldGroup className="gap-4">
        {controls.map((control) => (
          <AdjustmentSlider
            disabled={disabled}
            key={control.key}
            label={control.label}
            max={control.max}
            min={control.min}
            onValueChange={(nextValue) =>
              onChange?.({ ...value, [control.key]: nextValue } as TValue)
            }
            step={control.step}
            value={value[control.key]}
          />
        ))}
      </FieldGroup>
    </FieldSet>
  );
}

function AdjustmentSlider({
  disabled,
  label,
  max,
  min,
  onValueChange,
  step,
  value,
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onValueChange?: (value: number) => void;
  step: number;
  value: number;
}) {
  const sliderId = useId();
  const labelId = `${sliderId}-label`;

  return (
    <Field data-disabled={disabled} data-slot="adjustment-slider">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel id={labelId}>{label}</FieldLabel>
        <output className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatAdjustmentValue(value)}
        </output>
      </div>
      <FieldContent>
        <Slider
          aria-labelledby={labelId}
          disabled={disabled}
          id={sliderId}
          max={max}
          min={min}
          onValueChange={(nextValue) =>
            onValueChange?.(readSliderValue(nextValue, value))
          }
          step={step}
          value={[value]}
        />
      </FieldContent>
    </Field>
  );
}

function IconButtonTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function readSliderValue(nextValue: number[], fallback: number): number {
  return nextValue[0] ?? fallback;
}

function formatAdjustmentValue(value: number): string {
  const rounded = Math.round(value * 100) / 100;

  if (rounded > 0) {
    return `+${rounded.toFixed(2)}`;
  }

  return rounded.toFixed(2);
}
