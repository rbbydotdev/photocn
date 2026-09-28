"use client";

import type { ReactNode } from "react";
import { useImageEditor, type ImageEditorToolId } from "photocn/react";

import { ImageEditorAdjustments } from "./adjustments-panel";
import { ImageEditorBlend } from "./blend-panel";
import { ImageEditorBlur } from "./blur-panel";
import { ImageEditorCrop } from "./crop-panel";
import { ImageEditorCurves } from "./curves-panel";
import { ImageEditorFilters } from "./filters-panel";
import { ImageEditorMetadata } from "./metadata-panel";

export const defaultToolPanels: Record<string, ReactNode> = {
  adjust: <ImageEditorAdjustments />,
  effects: <ImageEditorAdjustments defaultSection="effects" />,
  compose: <ImageEditorCrop />,
  curves: <ImageEditorCurves />,
  filters: <ImageEditorFilters />,
  blender: <ImageEditorBlend />,
  blur: <ImageEditorBlur />,
  metadata: <ImageEditorMetadata />,
};

export interface ImageEditorToolPanelProps {
  /**
   * Panel per tool id. Merged over the defaults, so you can replace one
   * panel or add panels for your own tools: `{ stickers: <MyPanel /> }`.
   */
  panels?: Partial<Record<ImageEditorToolId, ReactNode>>;
}

/** Renders the panel for the active tool. */
export function ImageEditorToolPanel({ panels }: ImageEditorToolPanelProps) {
  const editor = useImageEditor();
  const merged: Record<string, ReactNode> = { ...defaultToolPanels, ...panels };
  return <>{merged[editor.tool] ?? null}</>;
}
