"use client";

import { useRef, type ChangeEvent } from "react";
import { BookmarkPlusIcon, FolderOpenIcon } from "lucide-react";
import {
  buildRecipe,
  downloadRecipe,
  parseRecipe,
  type EditorParams,
  type RecipeV1,
} from "photocn";
import { useImageEditor } from "photocn/react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface RecipeActionsProps {
  params: EditorParams;
  onLoad: (recipe: RecipeV1) => void;
  filename?: string;
  disabled?: boolean;
  className?: string;
  /** Called when a picked recipe file can't be parsed. */
  onError?: (error: unknown) => void;
}

export function RecipeActions({
  params,
  onLoad,
  filename,
  disabled = false,
  className,
  onError = (error) => console.error("[photocn] Failed to load recipe", error),
}: RecipeActionsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Computed inline each render — recipe-building is cheap and avoids stale state.
  const recipe = buildRecipe(params);
  const saveDisabled = disabled || recipe === null;

  const handleSave = () => {
    if (!recipe) return;
    downloadRecipe(recipe, filename);
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Reset before async work so picking the same file again still fires onChange.
    input.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseRecipe(text);
      onLoad(parsed);
    } catch (err) {
      onError(err);
    }
  };

  return (
    <TooltipProvider>
      <div
        className={cn("flex items-center gap-1", className)}
        data-slot="recipe-actions"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              saveDisabled ? (
                <span className="inline-flex">
                  <Button
                    aria-label="Save recipe"
                    disabled
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <BookmarkPlusIcon aria-hidden="true" />
                    <span className="sr-only">Save recipe</span>
                  </Button>
                </span>
              ) : (
                <Button
                  aria-label="Save recipe"
                  onClick={handleSave}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <BookmarkPlusIcon aria-hidden="true" />
                  <span className="sr-only">Save recipe</span>
                </Button>
              )
            }
          />
          <TooltipContent side="bottom">
            {recipe === null ? "Nothing to save yet" : "Save recipe"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Load recipe"
                disabled={disabled}
                onClick={handleLoadClick}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <FolderOpenIcon aria-hidden="true" />
                <span className="sr-only">Load recipe</span>
              </Button>
            }
          />
          <TooltipContent side="bottom">Load recipe</TooltipContent>
        </Tooltip>

        <input
          accept="application/json"
          aria-hidden="true"
          className="hidden"
          onChange={handleFileChange}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />
      </div>
    </TooltipProvider>
  );
}

export type ImageEditorRecipesProps = Partial<RecipeActionsProps>;

/**
 * Save the current look as a `.recipe.json` and re-apply it to any photo.
 * Wired to the nearest `<ImageEditorProvider>`.
 */
export function ImageEditorRecipes(props: ImageEditorRecipesProps) {
  const editor = useImageEditor();
  return (
    <RecipeActions
      disabled={editor.disabled}
      filename={editor.filename}
      onLoad={(recipe) => void editor.recipes.apply(recipe)}
      params={editor.params}
      {...props}
    />
  );
}

