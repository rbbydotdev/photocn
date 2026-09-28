"use client";

import { useId, useState, type ReactNode } from "react";
import {
  CheckIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  LinkIcon,
  RotateCcwIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { SkewIcon } from "./icon-skew";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useImageEditor } from "photocn/react";

export interface CompositionAspectRatioOption {
  value: string;
  label: string;
}

export interface CompositionCropValue {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompositionTransformValue {
  rotation: number;
  scale: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export interface CompositionResizeValue {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface CompositionResizeChange {
  width: number;
  height: number;
  locked: boolean;
}

export interface CompositionPanelProps {
  aspectRatio: string;
  crop: CompositionCropValue;
  transform: CompositionTransformValue;
  aspectRatioOptions?: readonly CompositionAspectRatioOption[];
  disabled?: boolean;
  className?: string;
  canvasAngle?: number;
  resize?: CompositionResizeValue;
  /** Perspective warp section. When omitted, the section is hidden. */
  perspective?: CompositionPerspectiveValue;
  onAspectRatioChange?: (aspectRatio: string) => void;
  /**
   * Drop the in-progress crop rectangle without un-applying the previously
   * committed crop. The image stays cropped (in other tools and in export);
   * only the rect overlay disappears. Surface only when a draft rect exists.
   */
  onApplyCrop?: () => void;
  onClear?: () => void;
  onCropChange?: (crop: CompositionCropValue) => void;
  onTransformChange?: (transform: CompositionTransformValue) => void;
  onCanvasRotate?: (delta: 90 | -90) => void;
  onResizeChange?: (next: CompositionResizeChange) => void;
  onResizeReset?: () => void;
  onReset?: () => void;
}

export interface CompositionPerspectiveValue {
  /** True while the perspective overlay is active (handles + grid shown). */
  isEditing: boolean;
  /** True when a perspective warp has been committed (so Reset is meaningful). */
  hasCommitted: boolean;
  /** Toggle the overlay on/off. While on, drags update the warp live. */
  onToggle: () => void;
  /** Clear any committed perspective and exit edit mode. */
  onReset: () => void;
}

export const compositionPanelAspectRatioOptions = [
  { value: "free", label: "Free" },
  { value: "original", label: "Original" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "16:9", label: "16:9" },
] as const satisfies readonly CompositionAspectRatioOption[];

type CropKey = keyof CompositionCropValue;
type TransformKey = "rotation" | "scale";

const cropControls = [
  { key: "x", label: "X", min: 0, max: 100, step: 1 },
  { key: "y", label: "Y", min: 0, max: 100, step: 1 },
  { key: "width", label: "Width", min: 1, max: 100, step: 1 },
  { key: "height", label: "Height", min: 1, max: 100, step: 1 },
] as const satisfies readonly CompositionSliderConfig<CropKey>[];

const transformControls = [
  { key: "rotation", label: "Rotate", min: -180, max: 180, step: 1 },
  { key: "scale", label: "Scale", min: 25, max: 300, step: 1 },
] as const satisfies readonly CompositionSliderConfig<TransformKey>[];

interface CompositionSliderConfig<TKey extends string> {
  key: TKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export function CompositionPanel({
  aspectRatio,
  crop,
  transform,
  aspectRatioOptions = compositionPanelAspectRatioOptions,
  disabled = false,
  className,
  canvasAngle,
  resize,
  perspective,
  onAspectRatioChange,
  onApplyCrop,
  onClear,
  onCropChange,
  onTransformChange,
  onCanvasRotate,
  onResizeChange,
  onResizeReset,
  onReset,
}: CompositionPanelProps) {
  const panelId = useId();
  const ratioLabelId = `${panelId}-aspect-ratio-label`;
  const widthInputId = `${panelId}-resize-width`;
  const heightInputId = `${panelId}-resize-height`;
  const [resizeLocked, setResizeLocked] = useState(false);

  const updateCropValue = (key: CropKey, value: number) => {
    onCropChange?.({ ...crop, [key]: value });
  };

  const updateTransformValue = (key: TransformKey, value: number) => {
    onTransformChange?.({ ...transform, [key]: value });
  };

  const displayAngle = normalizeDisplayAngle(canvasAngle ?? 0);
  const resizeValue = resize ?? emptyResizeValue;
  const widthFieldValue = resizeValue.width > 0 ? String(resizeValue.width) : "";
  const heightFieldValue =
    resizeValue.height > 0 ? String(resizeValue.height) : "";
  const widthPercent =
    resizeValue.originalWidth > 0 && resizeValue.width > 0
      ? Math.round((resizeValue.width / resizeValue.originalWidth) * 100)
      : null;

  const emitResize = (next: CompositionResizeChange) => {
    setResizeLocked(next.locked);
    onResizeChange?.(next);
  };

  const handleResizeReset = () => {
    setResizeLocked(false);
    onResizeReset?.();
  };

  return (
    <TooltipProvider>
      <section
        aria-label="Composition"
        className={cn(
          "flex h-full min-w-0 flex-col bg-background text-foreground",
          className,
        )}
        data-slot="composition-panel"
      >
        <div className="flex min-h-12 items-center px-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Compose</h2>
            <p className="truncate text-xs text-muted-foreground">
              Crop and transform
            </p>
          </div>
        </div>
        <Separator />
        <div className="flex items-center gap-1 px-4 py-2">
          <Button
            disabled={disabled || !onReset}
            onClick={onReset}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
            Reset
          </Button>
          {onApplyCrop ? (
            <Button
              disabled={disabled}
              onClick={onApplyCrop}
              size="sm"
              type="button"
              variant="ghost"
            >
              <CheckIcon aria-hidden="true" data-icon="inline-start" />
              Apply
            </Button>
          ) : null}
          {onClear ? (
            <Button
              disabled={disabled}
              onClick={onClear}
              size="sm"
              type="button"
              variant="ghost"
            >
              <XIcon aria-hidden="true" data-icon="inline-start" />
              Clear
            </Button>
          ) : null}
        </div>
        <Separator />

        <FieldGroup className="min-h-0 flex-1 gap-5 overflow-auto px-4 py-4">
          {perspective ? (
            <PanelSection title="Perspective">
              <Field orientation="horizontal" data-disabled={disabled}>
                <FieldContent>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {perspective.isEditing
                        ? "Drag the corners. Each release commits."
                        : perspective.hasCommitted
                          ? "Perspective applied."
                          : "Straighten by marking a quadrilateral."}
                    </span>
                    <div className="flex items-center gap-2">
                      {perspective.hasCommitted && !perspective.isEditing ? (
                        <Button
                          aria-label="Reset perspective"
                          disabled={disabled}
                          onClick={perspective.onReset}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Reset
                        </Button>
                      ) : null}
                      <Toggle
                        aria-label="Perspective"
                        data-state={perspective.isEditing ? "on" : "off"}
                        data-slot="perspective-toggle"
                        disabled={disabled}
                        onPressedChange={() => perspective.onToggle()}
                        pressed={perspective.isEditing}
                        size="sm"
                        variant="outline"
                      >
                        <SkewIcon aria-hidden="true" />
                        <span className="sr-only">Perspective</span>
                      </Toggle>
                    </div>
                  </div>
                </FieldContent>
              </Field>
            </PanelSection>
          ) : null}
          <Field orientation="horizontal" data-disabled={disabled}>
            <FieldLabel id={ratioLabelId}>Aspect</FieldLabel>
            <FieldContent className="items-end">
              <Select
                disabled={disabled || !onAspectRatioChange}
                onValueChange={onAspectRatioChange}
                value={aspectRatio}
              >
                <SelectTrigger
                  aria-labelledby={ratioLabelId}
                  className="w-36"
                  size="sm"
                >
                  <SelectValue placeholder="Ratio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Aspect ratio</SelectLabel>
                    {aspectRatioOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          <Separator />

          <PanelSection title="Crop">
            {cropControls.map((control) => (
              <CompositionSlider
                disabled={disabled || !onCropChange}
                formattedValue={formatPercent(crop[control.key])}
                key={control.key}
                label={control.label}
                max={control.max}
                min={control.min}
                onValueChange={(value) => updateCropValue(control.key, value)}
                step={control.step}
                value={crop[control.key]}
              />
            ))}
          </PanelSection>

          <PanelSection
            title="Transform"
          >
            {transformControls.map((control) => (
              <CompositionSlider
                disabled={disabled || !onTransformChange}
                formattedValue={
                  control.key === "rotation"
                    ? formatDegrees(transform[control.key])
                    : formatPercent(transform[control.key])
                }
                key={control.key}
                label={control.label}
                max={control.max}
                min={control.min}
                onValueChange={(value) =>
                  updateTransformValue(control.key, value)
                }
                step={control.step}
                value={transform[control.key]}
              />
            ))}
            <Field orientation="horizontal" data-disabled={disabled}>
              <FieldTitle>Flip</FieldTitle>
              <FieldContent>
                <div className="flex justify-end gap-1">
                  <IconToggle
                    disabled={disabled || !onTransformChange}
                    label="Flip horizontal"
                    onPressedChange={(pressed) =>
                      onTransformChange?.({
                        ...transform,
                        flipHorizontal: pressed,
                      })
                    }
                    pressed={transform.flipHorizontal}
                  >
                    <FlipHorizontal2Icon aria-hidden="true" />
                  </IconToggle>
                  <IconToggle
                    disabled={disabled || !onTransformChange}
                    label="Flip vertical"
                    onPressedChange={(pressed) =>
                      onTransformChange?.({
                        ...transform,
                        flipVertical: pressed,
                      })
                    }
                    pressed={transform.flipVertical}
                  >
                    <FlipVertical2Icon aria-hidden="true" />
                  </IconToggle>
                </div>
              </FieldContent>
            </Field>
          </PanelSection>

          <PanelSection title="Canvas">
            <Field orientation="horizontal" data-disabled={disabled}>
              <FieldTitle>Rotation</FieldTitle>
              <FieldContent>
                <div className="flex items-center justify-end gap-2">
                  <output className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {displayAngle}&deg;
                  </output>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Rotate 90 degrees counter-clockwise"
                        disabled={disabled || !onCanvasRotate}
                        onClick={() => onCanvasRotate?.(-90)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <RotateCcwIcon aria-hidden="true" />
                        <span className="sr-only">Rotate 90&deg; CCW</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Rotate 90&deg; CCW</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Rotate 90 degrees clockwise"
                        disabled={disabled || !onCanvasRotate}
                        onClick={() => onCanvasRotate?.(90)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <RotateCwIcon aria-hidden="true" />
                        <span className="sr-only">Rotate 90&deg; CW</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Rotate 90&deg; CW</TooltipContent>
                  </Tooltip>
                </div>
              </FieldContent>
            </Field>
          </PanelSection>

          <PanelSection title="Resize">
            <div className="grid grid-cols-2 gap-3">
              <Field data-disabled={disabled}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={widthInputId}>Width (px)</FieldLabel>
                  {widthPercent !== null ? (
                    <output className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {widthPercent}%
                    </output>
                  ) : null}
                </div>
                <Input
                  disabled={disabled || !onResizeChange}
                  id={widthInputId}
                  inputMode="numeric"
                  min={0}
                  onChange={(event) =>
                    emitResize({
                      width: readPositiveInt(event.currentTarget.value),
                      height: resizeValue.height,
                      locked: resizeLocked,
                    })
                  }
                  placeholder={
                    resizeValue.originalWidth > 0
                      ? String(resizeValue.originalWidth)
                      : "auto"
                  }
                  type="number"
                  value={widthFieldValue}
                />
              </Field>
              <Field data-disabled={disabled}>
                <FieldLabel htmlFor={heightInputId}>Height (px)</FieldLabel>
                <Input
                  disabled={disabled || !onResizeChange}
                  id={heightInputId}
                  inputMode="numeric"
                  min={0}
                  onChange={(event) =>
                    emitResize({
                      width: resizeValue.width,
                      height: readPositiveInt(event.currentTarget.value),
                      locked: resizeLocked,
                    })
                  }
                  placeholder={
                    resizeValue.originalHeight > 0
                      ? String(resizeValue.originalHeight)
                      : "auto"
                  }
                  type="number"
                  value={heightFieldValue}
                />
              </Field>
            </div>
            <Field orientation="horizontal" data-disabled={disabled}>
              <FieldTitle>Lock aspect</FieldTitle>
              <FieldContent>
                <div className="flex items-center justify-end gap-2">
                  <IconToggle
                    disabled={disabled || !onResizeChange}
                    label="Lock aspect ratio"
                    onPressedChange={(pressed) =>
                      emitResize({
                        width: resizeValue.width,
                        height: resizeValue.height,
                        locked: pressed,
                      })
                    }
                    pressed={resizeLocked}
                  >
                    <LinkIcon aria-hidden="true" />
                  </IconToggle>
                  <Button
                    disabled={disabled || !onResizeReset}
                    onClick={handleResizeReset}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Reset
                  </Button>
                </div>
              </FieldContent>
            </Field>
          </PanelSection>

        </FieldGroup>
      </section>
    </TooltipProvider>
  );
}

const emptyResizeValue: CompositionResizeValue = {
  width: 0,
  height: 0,
  originalWidth: 0,
  originalHeight: 0,
};

function normalizeDisplayAngle(angle: number): number {
  // Display only — keep sign-stable in [0, 360).
  const mod = ((angle % 360) + 360) % 360;
  return Math.round(mod);
}

function readPositiveInt(raw: string): number {
  if (raw === "") return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function PanelSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <FieldSet className="gap-3" data-slot="composition-section">
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

function CompositionSlider({
  disabled,
  formattedValue,
  label,
  max,
  min,
  onValueChange,
  step,
  value,
}: {
  disabled?: boolean;
  formattedValue: string;
  label: string;
  max: number;
  min: number;
  onValueChange?: (value: number) => void;
  step: number;
  value: number;
}) {
  const sliderId = useId();

  return (
    <Field data-slot="composition-slider" data-disabled={disabled}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={sliderId}>{label}</FieldLabel>
        <output className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formattedValue}
        </output>
      </div>
      <Slider
        aria-label={label}
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
    </Field>
  );
}

function IconToggle({
  children,
  disabled,
  label,
  onPressedChange,
  pressed,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onPressedChange?: (pressed: boolean) => void;
  pressed: boolean;
}) {
  const toggle = (
    <Toggle
      aria-label={label}
      disabled={disabled}
      onPressedChange={onPressedChange}
      pressed={pressed}
      size="sm"
      variant="outline"
    >
      {children}
      <span className="sr-only">{label}</span>
    </Toggle>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span className="inline-flex">{toggle}</span> : toggle}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function readSliderValue(nextValue: number[], fallback: number): number {
  return nextValue[0] ?? fallback;
}

function formatDegrees(value: number): string {
  return `${Math.round(value)} deg`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export type ImageEditorCropProps = Partial<CompositionPanelProps>;

/**
 * Crop, aspect ratio, rotate/flip, perspective and resize — wired to the
 * nearest `<ImageEditorProvider>`. Draw the crop directly on the canvas while
 * the "compose" tool is active.
 */
export function ImageEditorCrop(props: ImageEditorCropProps) {
  const editor = useImageEditor();
  const { crop, perspective } = editor;
  return (
    <CompositionPanel
      aspectRatio={crop.aspectRatio}
      aspectRatioOptions={crop.aspectRatioOptions}
      canvasAngle={crop.canvasAngle}
      crop={crop.rect}
      disabled={editor.disabled}
      onApplyCrop={crop.isDrawn ? crop.apply : undefined}
      onAspectRatioChange={crop.setAspectRatio}
      onCanvasRotate={crop.rotate}
      onClear={crop.isDrawn ? crop.clear : undefined}
      onCropChange={crop.update}
      onReset={crop.reset}
      onResizeChange={crop.setResize}
      onResizeReset={crop.resetResize}
      onTransformChange={crop.setTransform}
      perspective={{
        isEditing: perspective.isEditing,
        hasCommitted: perspective.hasCommitted,
        onToggle: perspective.toggle,
        onReset: perspective.reset,
      }}
      resize={crop.resize}
      transform={crop.transform}
      {...props}
    />
  );
}

