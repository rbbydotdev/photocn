"use client";

import { ImageEditorProvider } from "photocn/react";

import { ImageEditorCanvas } from "@/registry/image-editor/canvas";
import { ImageEditorFilters } from "@/registry/image-editor/filters-panel";
import { ImageEditorRecipes } from "@/registry/image-editor/recipes";

// Pick a filter, save the look as JSON, open another photo and load it back.
export default function RecipesDemo() {
  return (
    <ImageEditorProvider src="/samples/dog.jpg">
      <div className="grid h-[520px] grid-rows-[1fr_auto] overflow-hidden rounded-xl border bg-background sm:grid-cols-[1fr_300px] sm:grid-rows-1">
        <ImageEditorCanvas className="min-h-0 p-2" />
        <aside className="flex max-h-64 flex-col overflow-y-auto border-t sm:max-h-none sm:border-t-0 sm:border-l">
          <div className="flex items-center justify-between border-b px-4 py-2 text-sm font-medium">
            Recipe
            <ImageEditorRecipes />
          </div>
          <ImageEditorFilters />
        </aside>
      </div>
    </ImageEditorProvider>
  );
}
