"use client";

import { useId, type ReactNode } from "react";
import {
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  RotateCcwIcon,
  RotateCcwSquareIcon,
  RotateCwSquareIcon,
} from "lucide-react";
import {
  aspectRatioOptions as defaultAspectRatioOptions,
  useImageEditor,
  type AspectRatioOption,
} from "photocn/react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
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

import { SkewIcon } from "./icon-skew";
import { PanelResetHeader } from "./panel-header";

export interface CropPanelValue {
  /** Degrees, -45..45. */
  straighten: number;
  /** -1..1 */
  perspectiveX: number;
  /** -1..1 */
  perspectiveY: number;
  /** Aspect preset value ("free", "original", "1:1", …). */
  aspectRatio: string;
  /** Whether the crop is portrait. */
  portrait: boolean;
  /** Whether the advanced corner handles are showing. */
  editingCorners: boolean;
  /** Whether corners were moved (so "Reset corners" means something). */
  hasCorners: boolean;
}

export interface CropPanelProps {
  value: CropPanelValue;
  aspectRatioOptions?: readonly AspectRatioOption[];
  disabled?: boolean;
  className?: string;
  /** Hide the whole perspective section. */
  hidePerspective?: boolean;
  onRotate?: (direction: 1 | -1) => void;
  onFlip?: (axis: "horizontal" | "vertical") => void;
  onAspectRatioChange?: (value: string) => void;
  onToggleOrientation?: () => void;
  /** Live while dragging; `onCommit` fires on release. */
  onStraightenChange?: (degrees: number) => void;
  onPerspectiveChange?: (value: { x?: number; y?: number }) => void;
  onCommit?: () => void;
  onEditingCornersChange?: (editing: boolean) => void;
  onResetCorners?: () => void;
  onReset?: () => void;
}

/**
 * The crop tool's controls: quarter turns, flips, ratio, straighten and
 * perspective. Cropping itself happens on the canvas. See docs/compose.md.
 */
export function CropPanel({
  value,
  aspectRatioOptions = defaultAspectRatioOptions,
  disabled = false,
  className,
  hidePerspective = false,
  onRotate,
  onFlip,
  onAspectRatioChange,
  onToggleOrientation,
  onStraightenChange,
  onPerspectiveChange,
  onCommit,
  onEditingCornersChange,
  onResetCorners,
  onReset,
}: CropPanelProps) {
  const id = useId();
  const canToggleOrientation = value.aspectRatio !== "1:1";

  return (
    <TooltipProvider>
      <section
        aria-label="Crop"
        className={cn("flex h-full min-w-0 flex-col bg-background text-foreground", className)}
        data-slot="crop-panel"
      >
        <PanelResetHeader
          description="Drag the frame on the image to crop"
          onReset={onReset}
          resetDisabled={disabled}
          title="Crop"
        />

        <FieldGroup className="gap-5 px-4 py-4">
          <div className="flex items-center gap-1" role="group" aria-label="Rotate and flip">
            <IconAction disabled={disabled || !onRotate} label="Rotate left" onClick={() => onRotate?.(-1)}>
              <RotateCcwSquareIcon />
            </IconAction>
            <IconAction disabled={disabled || !onRotate} label="Rotate right" onClick={() => onRotate?.(1)}>
              <RotateCwSquareIcon />
            </IconAction>
            <Separator className="mx-1 h-5" orientation="vertical" />
            <IconAction disabled={disabled || !onFlip} label="Flip horizontal" onClick={() => onFlip?.("horizontal")}>
              <FlipHorizontal2Icon />
            </IconAction>
            <IconAction disabled={disabled || !onFlip} label="Flip vertical" onClick={() => onFlip?.("vertical")}>
              <FlipVertical2Icon />
            </IconAction>
          </div>

          <Field>
            <FieldLabel id={`${id}-ratio`}>Aspect ratio</FieldLabel>
            <div className="flex items-center gap-2">
              <Select
                disabled={disabled || !onAspectRatioChange}
                onValueChange={onAspectRatioChange}
                value={value.aspectRatio}
              >
                <SelectTrigger aria-labelledby={`${id}-ratio`} className="flex-1" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aspectRatioOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <IconAction
                disabled={disabled || !onToggleOrientation || !canToggleOrientation}
                label={value.portrait ? "Switch to landscape" : "Switch to portrait"}
                onClick={() => onToggleOrientation?.()}
                variant="outline"
              >
                {value.portrait ? <RectangleVerticalIcon /> : <RectangleHorizontalIcon />}
              </IconAction>
            </div>
          </Field>

          <CenteredSlider
            disabled={disabled || !onStraightenChange}
            format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`}
            label="Straighten"
            max={45}
            min={-45}
            onChange={(v) => onStraightenChange?.(v)}
            onCommit={onCommit}
            step={0.1}
            value={value.straighten}
          />
        </FieldGroup>

        {hidePerspective ? null : (
          <>
            <Separator />
            <FieldSet className="gap-5 px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <FieldLegend className="mb-0 text-sm" variant="label">
                  Perspective
                </FieldLegend>
                <div className="flex items-center gap-1">
                  {value.hasCorners ? (
                    <Button
                      disabled={disabled || !onResetCorners}
                      onClick={onResetCorners}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      Corners
                    </Button>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        aria-label="Adjust corners"
                        disabled={disabled || !onEditingCornersChange}
                        onPressedChange={(pressed) => onEditingCornersChange?.(pressed)}
                        pressed={value.editingCorners}
                        size="sm"
                        variant="outline"
                      >
                        <SkewIcon />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>Adjust corners</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <CenteredSlider
                disabled={disabled || !onPerspectiveChange}
                format={percent}
                label="Vertical"
                max={1}
                min={-1}
                onChange={(y) => onPerspectiveChange?.({ y })}
                onCommit={onCommit}
                step={0.01}
                value={value.perspectiveY}
              />
              <CenteredSlider
                disabled={disabled || !onPerspectiveChange}
                format={percent}
                label="Horizontal"
                max={1}
                min={-1}
                onChange={(x) => onPerspectiveChange?.({ x })}
                onCommit={onCommit}
                step={0.01}
                value={value.perspectiveX}
              />
            </FieldSet>
          </>
        )}
      </section>
    </TooltipProvider>
  );
}

const percent = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;

function CenteredSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  format: (value: number) => string;
  onChange: (value: number) => void;
  onCommit?: () => void;
}) {
  const id = useId();
  return (
    <Field data-disabled={disabled}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel id={id}>{label}</FieldLabel>
        <button
          className="rounded px-1 text-xs tabular-nums text-muted-foreground hover:text-foreground disabled:pointer-events-none"
          disabled={disabled || value === 0}
          onClick={() => {
            onChange(0);
            onCommit?.();
          }}
          title="Reset"
          type="button"
        >
          {format(value)}
        </button>
      </div>
      <Slider
        aria-labelledby={id}
        disabled={disabled}
        max={max}
        min={min}
        onValueChange={([next]) => onChange(next ?? 0)}
        onValueCommit={() => onCommit?.()}
        step={step}
        value={[value]}
      />
    </Field>
  );
}

function IconAction({
  label,
  children,
  variant = "ghost",
  ...props
}: {
  label: string;
  children: ReactNode;
  variant?: "ghost" | "outline";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const button = (
    <Button aria-label={label} size="icon-sm" type="button" variant={variant} {...props}>
      {children}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {props.disabled ? <span className="inline-flex">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export type ImageEditorCropProps = Partial<CropPanelProps>;

/** Crop tool controls wired to the nearest `<ImageEditorProvider>`. */
export function ImageEditorCrop(props: ImageEditorCropProps) {
  const editor = useImageEditor();
  const g = editor.geometry;
  return (
    <CropPanel
      aspectRatioOptions={g.aspectRatioOptions}
      disabled={editor.disabled || !editor.hasImage}
      onAspectRatioChange={g.setAspectRatio}
      onCommit={g.commit}
      onEditingCornersChange={g.setEditingCorners}
      onFlip={g.flip}
      onPerspectiveChange={(value) => g.setPerspective(value, { transient: true })}
      onReset={g.reset}
      onResetCorners={g.resetCorners}
      onRotate={g.rotate}
      onStraightenChange={(degrees) => g.setStraighten(degrees, { transient: true })}
      onToggleOrientation={g.toggleOrientation}
      value={{
        straighten: g.value.straighten,
        perspectiveX: g.value.perspectiveX,
        perspectiveY: g.value.perspectiveY,
        aspectRatio: g.aspectRatio,
        portrait: g.portrait,
        editingCorners: g.editingCorners,
        hasCorners: Boolean(g.value.corners),
      }}
      {...props}
    />
  );
}
