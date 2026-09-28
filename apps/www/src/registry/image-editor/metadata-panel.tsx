"use client";

import type { ReactNode } from "react";
import type { UseMiniPhotoEditorResult } from "photocn/hooks";
import { useImageEditor } from "photocn/react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, FieldContent, FieldGroup, FieldTitle } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface MetadataPanelProps {
  editor: UseMiniPhotoEditorResult;
  title?: ReactNode;
  className?: string;
}

interface MetadataRow {
  label: string;
  value: ReactNode;
}

export function MetadataPanel({
  editor,
  title = "Metadata",
  className,
}: MetadataPanelProps) {
  const rows = metadataRows(editor);
  const exifError = editor.exif.status === "error" ? editor.exif.error : null;

  return (
    <FieldGroup className={cn("gap-3 p-3", className)} data-slot="metadata-panel">
      <Field orientation="horizontal">
        <FieldContent>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <FieldTitle className="truncate">{title}</FieldTitle>
            <Badge variant={editor.exif.status === "loaded" ? "secondary" : "outline"}>
              {editor.exif.status === "loading"
                ? "Reading"
                : editor.exif.status === "loaded"
                  ? "EXIF ready"
                  : "File"}
            </Badge>
          </div>
        </FieldContent>
      </Field>

      {exifError ? (
        <Alert>
          <AlertDescription>{errorMessage(exifError)}</AlertDescription>
        </Alert>
      ) : null}

      <Separator />

      {rows.length ? (
        <Table>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="w-28 align-top text-xs text-muted-foreground">
                  {row.label}
                </TableCell>
                <TableCell className="whitespace-normal break-words text-xs">
                  {row.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-xs text-muted-foreground">No image metadata loaded.</p>
      )}
    </FieldGroup>
  );
}

function metadataRows(editor: UseMiniPhotoEditorResult): MetadataRow[] {
  const { fileInfo, image, blob } = editor.imageInput;
  const metadata = editor.exif.metadata;
  const rows: MetadataRow[] = [];

  addRow(rows, "Name", fileInfo?.name);
  addRow(rows, "Type", fileInfo?.type || blob?.type);
  addRow(rows, "Size", fileInfo?.size ? formatBytes(fileInfo.size) : undefined);
  addRow(rows, "Dimensions", image ? `${image.naturalWidth} x ${image.naturalHeight}` : undefined);
  addRow(rows, "Modified", fileInfo?.lastModified ? formatDate(fileInfo.lastModified) : undefined);
  addRow(rows, "Format", metadata?.format);
  addRow(rows, "Color", colorProfile(metadata?.icc));
  addRow(rows, "Captured", exifTagValue(metadata?.exif?.DateTimeOriginal));
  addRow(rows, "Camera", cameraLabel(metadata?.tiff?.Make, metadata?.tiff?.Model));
  addRow(rows, "Lens", exifTagValue(metadata?.exif?.LensModel));
  addRow(rows, "GPS", gpsLabel(metadata?.gps));

  return rows;
}

function addRow(rows: MetadataRow[], label: string, value: ReactNode) {
  if (value === undefined || value === null || value === "") return;
  rows.push({ label, value });
}

function exifTagValue(tag: { hvalue?: unknown; value?: unknown } | undefined): string | undefined {
  return formatMetadataValue(tag?.hvalue ?? tag?.value);
}

function cameraLabel(
  makeTag: { hvalue?: unknown; value?: unknown } | undefined,
  modelTag: { hvalue?: unknown; value?: unknown } | undefined,
): string | undefined {
  const make = exifTagValue(makeTag);
  const model = exifTagValue(modelTag);

  if (make && model) return `${make} ${model}`;
  return make ?? model;
}

function gpsLabel(gps: Record<string, { hvalue?: unknown; value?: unknown }> | undefined): string | undefined {
  const longitude = exifTagValue(gps?.GPSLongitude);
  const latitude = exifTagValue(gps?.GPSLatitude);

  if (longitude && latitude) return `${latitude}, ${longitude}`;
  return latitude ?? longitude;
}

function colorProfile(icc: Record<string, unknown> | undefined): string | undefined {
  const profile = icc?.ColorProfile;
  if (Array.isArray(profile)) return formatMetadataValue(profile[0]);
  return formatMetadataValue(profile);
}

function formatMetadataValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.map(formatMetadataValue).filter(Boolean).join(", ");
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"] as const;
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unable to read metadata.";
}

export type ImageEditorMetadataProps = Omit<MetadataPanelProps, "editor">;

/** File info and EXIF of the open image, from the nearest `<ImageEditorProvider>`. */
export function ImageEditorMetadata(props: ImageEditorMetadataProps) {
  const editor = useImageEditor();
  return <MetadataPanel editor={editor.engine} {...props} />;
}

