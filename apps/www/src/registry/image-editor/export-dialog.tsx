"use client";

import { useId, useState, type ReactNode } from "react";
import { DownloadIcon, Loader2Icon, UploadIcon } from "lucide-react";
import {
  useImageEditor,
  type ImageEditorExportFormat,
  type ImageEditorExportResult,
} from "photocn/react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export const exportFormats = [
  { value: "png", label: "PNG", lossy: false, defaultQuality: 1 },
  { value: "jpeg", label: "JPEG", lossy: true, defaultQuality: 0.92 },
  { value: "webp", label: "WebP", lossy: true, defaultQuality: 0.9 },
] as const satisfies readonly {
  value: ImageEditorExportFormat;
  label: string;
  lossy: boolean;
  defaultQuality: number;
}[];

export interface ImageEditorExportDialogProps {
  /** Element that opens the dialog. Defaults to an "Export" button. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultFormat?: ImageEditorExportFormat;
  /**
   * Save the result somewhere (e.g. upload it). When set, a primary "Save"
   * button appears next to "Download".
   */
  onSave?: (result: ImageEditorExportResult) => void | Promise<void>;
  saveLabel?: string;
  /** Hide the Download button (e.g. when you only want `onSave`). */
  hideDownload?: boolean;
  className?: string;
}

/** Format + quality picker that downloads (or saves) the edited image. */
export function ImageEditorExportDialog({
  trigger,
  open,
  onOpenChange,
  defaultFormat = "png",
  onSave,
  saveLabel = "Save",
  hideDownload = false,
  className,
}: ImageEditorExportDialogProps) {
  const editor = useImageEditor();
  const id = useId();
  const [format, setFormat] = useState<ImageEditorExportFormat>(defaultFormat);
  const selected =
    exportFormats.find((option) => option.value === format) ?? exportFormats[0];
  const [quality, setQuality] = useState<number>(selected.defaultQuality);
  const [pending, setPending] = useState<"download" | "save" | null>(null);
  // Output width in px; height follows the crop's ratio. null = full size.
  const [width, setWidth] = useState<number | null>(null);
  const full = editor.geometry.outputSize;
  const output = full
    ? width
      ? { width, height: Math.max(1, Math.round((width * full.height) / full.width)) }
      : full
    : null;
  const [error, setError] = useState<unknown>(null);

  const canExport = editor.isReady && !editor.disabled;

  const run = async (kind: "download" | "save") => {
    setError(null);
    setPending(kind);
    try {
      const options = {
        format,
        quality: selected.lossy ? quality : undefined,
        width: output && width ? output.width : undefined,
        height: output && width ? output.height : undefined,
      };
      if (kind === "download") {
        await editor.download(options);
      } else {
        await onSave?.(await editor.exportImage(options));
      }
    } catch (err) {
      setError(err);
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            disabled={!editor.hasImage || editor.disabled}
            size="sm"
            type="button"
          >
            <DownloadIcon aria-hidden="true" data-icon="inline-start" />
            Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className={cn("sm:max-w-md", className)}
        data-slot="image-editor-export-dialog"
      >
        <DialogHeader>
          <DialogTitle>Export image</DialogTitle>
          <DialogDescription>
            Pick a format and size. Rendering always starts from the original.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field orientation="horizontal">
            <FieldLabel id={`${id}-format`}>Format</FieldLabel>
            <FieldContent className="items-end">
              <Select
                onValueChange={(value) => {
                  const next = exportFormats.find((option) => option.value === value);
                  if (!next) return;
                  setFormat(next.value);
                  setQuality(next.defaultQuality);
                }}
                value={format}
              >
                <SelectTrigger
                  aria-labelledby={`${id}-format`}
                  className="w-32"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {exportFormats.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          {selected.lossy ? (
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel id={`${id}-quality`}>Quality</FieldLabel>
                <output className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(quality * 100)}%
                </output>
              </div>
              <Slider
                aria-labelledby={`${id}-quality`}
                max={100}
                min={10}
                onValueChange={(value) => setQuality((value[0] ?? 90) / 100)}
                step={1}
                value={[Math.round(quality * 100)]}
              />
            </Field>
          ) : null}

          {full && output ? (
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor={`${id}-width`}>Size</FieldLabel>
                {width ? (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setWidth(null)}
                    type="button"
                  >
                    Full size
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Width in pixels"
                  className="h-8 w-24 tabular-nums"
                  id={`${id}-width`}
                  inputMode="numeric"
                  max={16384}
                  min={1}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setWidth(next > 0 ? Math.min(16384, Math.round(next)) : null);
                  }}
                  type="number"
                  value={output.width}
                />
                <span className="text-muted-foreground">×</span>
                <Input
                  aria-label="Height in pixels"
                  className="h-8 w-24 tabular-nums"
                  inputMode="numeric"
                  max={16384}
                  min={1}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setWidth(
                      next > 0
                        ? Math.min(16384, Math.max(1, Math.round((next * full.width) / full.height)))
                        : null,
                    );
                  }}
                  type="number"
                  value={output.height}
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {width ? `${Math.round((output.width / full.width) * 100)}% of the crop` : "Full resolution"}
                {format === "jpeg" ? " · EXIF preserved" : null}
              </p>
            </Field>
          ) : null}

          {error ? (
            <Alert role="alert" variant="destructive">
              <AlertDescription>
                {error instanceof Error ? error.message : "Export failed."}
              </AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>

        <DialogFooter>
          {hideDownload ? null : (
            <Button
              disabled={!canExport || pending !== null}
              onClick={() => void run("download")}
              type="button"
              variant={onSave ? "outline" : "default"}
            >
              {pending === "download" ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <DownloadIcon aria-hidden="true" data-icon="inline-start" />
              )}
              Download
            </Button>
          )}
          {onSave ? (
            <Button
              disabled={!canExport || pending !== null}
              onClick={() => void run("save")}
              type="button"
            >
              {pending === "save" ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <UploadIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {saveLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
