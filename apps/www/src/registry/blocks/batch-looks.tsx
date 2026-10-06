"use client";

import { useEffect, useState } from "react";
import { DownloadIcon } from "lucide-react";
import { buildRecipe, createEditorParams, type RecipeV1 } from "photocn";
import { filterPresets } from "photocn/filters";
import { useImageEditorState } from "photocn/react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export interface BatchLooksProps {
  /** Photos to edit together. */
  photos: string[];
  className?: string;
}

/** Pick one look and apply it to every photo at once. */
export function BatchLooks({ photos, className }: BatchLooksProps) {
  const [filter, setFilter] = useState<string | null>("crema");
  const [exposure, setExposure] = useState(0.1);

  // One recipe, shared by every photo.
  const recipe: RecipeV1 = (() => {
    const params = createEditorParams();
    params.lights.exposure = exposure;
    const built = buildRecipe(params) ?? { version: 1 as const };
    return filter ? { ...built, filters: { label: filter } } : built;
  })();

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photos.map((photo) => (
          <BatchPhoto key={photo} recipe={recipe} src={photo} />
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {[null, ...filterPresets.map((preset) => preset.label)].map((label) => (
            <Button
              className="shrink-0 capitalize"
              key={label ?? "none"}
              onClick={() => setFilter(label)}
              size="sm"
              variant={filter === label ? "default" : "outline"}
            >
              {label ?? "None"}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm sm:w-56">
          Exposure
          <Slider max={100} min={-100} onValueChange={([v]) => setExposure((v ?? 0) / 100)} value={[exposure * 100]} />
        </label>
      </div>
    </div>
  );
}

function BatchPhoto({ src, recipe }: { src: string; recipe: RecipeV1 }) {
  const editor = useImageEditorState({ src, keyboardShortcuts: false });
  const key = JSON.stringify(recipe);
  useEffect(() => {
    if (editor.isReady) void editor.recipes.apply(JSON.parse(key) as RecipeV1);
    // Re-apply when the look changes or the photo becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, editor.isReady]);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg bg-muted" ref={editor.rootRef}>
      <div className="absolute inset-0" ref={editor.stageRef}>
        {editor.imageSrc ? (
          <canvas className="absolute inset-0 size-full object-cover" key={editor.canvasKey} ref={editor.canvasRef} />
        ) : null}
      </div>
      <Button
        aria-label="Download"
        className="absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        disabled={!editor.isReady}
        onClick={() => void editor.download({ format: "jpeg" })}
        size="icon-sm"
        variant="secondary"
      >
        <DownloadIcon />
      </Button>
    </div>
  );
}
