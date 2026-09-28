"use client";

import { useState } from "react";
import { buildRecipe, type EditorParams, type RecipeV1 } from "photocn";

import { ImageEditor } from "@/registry/image-editor/image-editor";

// Persist edits anywhere: `onParamsChange` fires with every change and
// `buildRecipe` turns params into a small, serializable diff.
export default function ControlledExample() {
  const [recipe, setRecipe] = useState<RecipeV1 | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <ImageEditor
        className="h-[600px] overflow-hidden rounded-xl border"
        onParamsChange={(params: EditorParams) => setRecipe(buildRecipe(params))}
        src="/samples/mountain-lake.jpg"
      />
      <pre className="max-h-[600px] overflow-auto rounded-xl border bg-muted/40 p-3 font-mono text-xs">
        {recipe ? JSON.stringify(recipe, null, 2) : "// Move a slider…"}
      </pre>
    </div>
  );
}
