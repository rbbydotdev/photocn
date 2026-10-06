"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlusIcon, XIcon } from "lucide-react";

import { decodeImageInput } from "photocn/dom";
import { useImageEditor } from "photocn/react";

import { PanelResetHeader } from "./panel-header";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface BlenderPanelValue {
  blendMix: number;
}

export interface BlenderPanelProps {
  value: BlenderPanelValue;
  disabled?: boolean;
  className?: string;
  onBlendMapChange: (image: HTMLImageElement | null) => void;
  onMixChange?: (mix: number) => void;
  onReset?: () => void;
  onError?: (error: unknown) => void;
}

const DEFAULT_MIX = 0.5;

export function BlenderPanel({
  value,
  disabled = false,
  className,
  onBlendMapChange,
  onMixChange,
  onReset,
  onError,
}: BlenderPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sliderId = useId();
  const labelId = `${sliderId}-label`;
  const [name, setName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Revoke the captured object URL when `preview` changes (cleanup runs with
  // the prior closure) and on unmount.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const hasBlend = name !== null;
  const isDirty = hasBlend || value.blendMix !== DEFAULT_MIX;
  const resetDisabled = disabled || !onReset || !isDirty;
  const sliderDisabled = disabled || !hasBlend || !onMixChange;

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const setBlend = (next: { name: string; preview: string } | null) => {
    setPreview(next?.preview ?? null);
    setName(next?.name ?? null);
  };

  const handleSelectFile = async (file: File) => {
    try {
      const result = await decodeImageInput(file);
      const nextPreview = URL.createObjectURL(file);
      setBlend({ name: file.name, preview: nextPreview });
      onBlendMapChange(result.image);
    } catch (error) {
      onError?.(error);
    }
  };

  const handleClear = () => {
    setBlend(null);
    onBlendMapChange(null);
  };

  const handleReset = () => {
    setBlend(null);
    onReset?.();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset the input so re-selecting the same file fires onChange again.
    event.target.value = "";
    if (file) void handleSelectFile(file);
  };

  return (
    <TooltipProvider>
      <section
        aria-label="Blender"
        className={cn(
          "flex h-full min-w-0 flex-col bg-background text-foreground",
          className,
        )}
        data-slot="blender-panel"
      >
        <PanelResetHeader
          title="Blend"
          description="Mix a second image into the photo"
          onReset={handleReset}
          resetDisabled={resetDisabled}
        />

        <input
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />

        <FieldGroup className="min-h-0 flex-1 gap-5 overflow-auto px-4 py-4">
          {hasBlend ? (
            <BlendImageSummary
              disabled={disabled}
              name={name ?? ""}
              onChange={openFilePicker}
              onClear={handleClear}
              preview={preview}
            />
          ) : (
            <BlendImageEmpty
              disabled={disabled}
              onChoose={openFilePicker}
            />
          )}

          <Field data-disabled={sliderDisabled} data-slot="blender-mix">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor={sliderId} id={labelId}>
                Blend mix
              </FieldLabel>
              <output className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatMix(value.blendMix)}
              </output>
            </div>
            <FieldContent>
              <Slider
                aria-labelledby={labelId}
                disabled={sliderDisabled}
                id={sliderId}
                max={1}
                min={0}
                onValueChange={(next) =>
                  onMixChange?.(readSliderValue(next, value.blendMix))
                }
                step={0.01}
                value={[value.blendMix]}
              />
            </FieldContent>
          </Field>
        </FieldGroup>
      </section>
    </TooltipProvider>
  );
}

function BlendImageEmpty({
  disabled,
  onChoose,
}: {
  disabled?: boolean;
  onChoose: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center",
        disabled && "opacity-60",
      )}
      data-slot="blender-empty"
    >
      <ImagePlusIcon
        aria-hidden="true"
        className="size-6 text-muted-foreground"
      />
      <p className="text-sm font-medium">Choose blend image</p>
      <p className="text-xs text-muted-foreground">
        Pick an image to blend with the current photo
      </p>
      <Button
        className="mt-1"
        disabled={disabled}
        onClick={onChoose}
        size="sm"
        type="button"
      >
        Choose blend image
      </Button>
    </div>
  );
}

function BlendImageSummary({
  disabled,
  name,
  onChange,
  onClear,
  preview,
}: {
  disabled?: boolean;
  name: string;
  onChange: () => void;
  onClear?: () => void;
  preview: string | null;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2"
      data-slot="blender-summary"
    >
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
        {preview ? (
          <img
            alt=""
            className="size-full object-cover"
            src={preview}
          />
        ) : (
          <ImagePlusIcon aria-hidden="true" className="size-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <p className="text-xs text-muted-foreground">Blend image</p>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              disabled={disabled}
              onClick={onChange}
              size="sm"
              type="button"
              variant="ghost"
            >
              Change
            </Button>
          }
        />
        <TooltipContent>Pick a different blend image</TooltipContent>
      </Tooltip>
      {onClear ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Clear blend image"
                disabled={disabled}
                onClick={onClear}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent>Clear blend image</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function readSliderValue(nextValue: number | readonly number[], fallback: number): number {
  return (typeof nextValue === "number" ? nextValue : nextValue[0]) ?? fallback;
}

function formatMix(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export type ImageEditorBlendProps = Partial<BlenderPanelProps>;

/** Blend a second image into the photo, wired to the nearest `<ImageEditorProvider>`. */
export function ImageEditorBlend(props: ImageEditorBlendProps) {
  const editor = useImageEditor();
  return (
    <BlenderPanel
      disabled={editor.disabled}
      // Remount per image so the picked blend file doesn't leak across photos.
      key={editor.imageSrc ?? "no-image"}
      onBlendMapChange={editor.blend.setImage}
      onMixChange={editor.blend.setMix}
      onReset={editor.blend.reset}
      value={editor.blend.value}
      {...props}
    />
  );
}
