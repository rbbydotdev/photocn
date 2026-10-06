"use client";

import { CropIcon, SlidersHorizontalIcon, WandSparklesIcon } from "lucide-react";
import { ImageEditorProvider, useImageEditor } from "photocn/react";

import { ImageEditorAdjustments } from "@/registry/image-editor/adjustments-panel";
import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorCrop } from "@/registry/image-editor/crop-panel";
import { ImageEditorExportDialog } from "@/registry/image-editor/export-dialog";
import { ImageEditorFilters } from "@/registry/image-editor/filters-panel";
import { ImageEditorRedoButton, ImageEditorUndoButton } from "@/registry/image-editor/toolbar";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "adjust", label: "Adjust", icon: SlidersHorizontalIcon },
  { value: "filters", label: "Filters", icon: WandSparklesIcon },
  { value: "compose", label: "Crop", icon: CropIcon },
] as const;

/** Three tools and export: the smallest useful editor. */
export function EditorMinimalBlock({ src }: { src?: string | File | Blob }) {
  return (
    <ImageEditorProvider src={src}>
      <div className="flex h-dvh flex-col bg-background">
        <header className="flex items-center gap-1 border-b px-2 py-2">
          <ImageEditorUndoButton />
          <ImageEditorRedoButton />
          <Tabs />
          <div className="ml-auto">
            <ImageEditorExportDialog />
          </div>
        </header>
        <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] md:grid-cols-[1fr_320px] md:grid-rows-1">
          <ImageEditorCanvas className="min-h-0 p-2" />
          <aside className="max-h-[45dvh] overflow-y-auto border-t md:max-h-none md:border-t-0 md:border-l">
            <Panel />
          </aside>
        </div>
      </div>
    </ImageEditorProvider>
  );
}

function Tabs() {
  const editor = useImageEditor();
  return (
    <nav aria-label="Tools" className="mx-auto flex rounded-lg bg-muted p-0.5">
      {tabs.map((tab) => (
        <button
          aria-pressed={editor.tool === tab.value}
          className={cn(
            "flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors",
            editor.tool === tab.value && "bg-background text-foreground shadow-sm",
          )}
          key={tab.value}
          onClick={() => editor.setTool(tab.value)}
          type="button"
        >
          <tab.icon className="size-4" />
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Panel() {
  const { tool } = useImageEditor();
  if (tool === "filters") return <ImageEditorFilters />;
  if (tool === "compose") return <ImageEditorCrop />;
  return <ImageEditorAdjustments />;
}
