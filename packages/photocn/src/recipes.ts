import {
  cloneEditorParams,
  createEditorParams,
  type BlurParams,
  type ColorParams,
  type EditorParams,
  type EffectParams,
  type LightParams,
} from "./editor-params";

export interface RecipeV1 {
  version: 1;
  name?: string;
  lights?: Partial<LightParams>;
  colors?: Partial<ColorParams>;
  effects?: Partial<EffectParams>;
  // Mirror legacy: persist strength/lensout but not centerX/centerY
  blur?: Partial<
    Pick<
      BlurParams,
      "bokehstrength" | "bokehlensout" | "gaussianstrength" | "gaussianlensout"
    >
  >;
  filters?: { label: string };
}

const BLUR_KEYS = [
  "bokehstrength",
  "bokehlensout",
  "gaussianstrength",
  "gaussianlensout",
] as const satisfies readonly (keyof BlurParams)[];

type SectionRecord = Record<string, unknown>;

// Drop $skip plus any field that matches the default (so we only persist user diffs).
function diffSection<T extends object>(
  current: T,
  defaults: T,
  allowedKeys?: readonly (keyof T)[],
): Partial<T> | undefined {
  const out: SectionRecord = {};
  const src = current as unknown as SectionRecord;
  const def = defaults as unknown as SectionRecord;
  const keys = (allowedKeys ?? (Object.keys(src) as (keyof T)[])) as readonly string[];

  for (const key of keys) {
    if (key === "$skip") continue;
    const value = src[key];
    if (value === undefined) continue;
    if (value === def[key]) continue;
    out[key] = value;
  }

  return Object.keys(out).length ? (out as Partial<T>) : undefined;
}

export function buildRecipe(
  params: EditorParams,
  name?: string,
): RecipeV1 | null {
  const defaults = createEditorParams();

  const lights = diffSection(params.lights, defaults.lights);
  const colors = diffSection(params.colors, defaults.colors);
  const effects = diffSection(params.effects, defaults.effects);
  const blur = diffSection(params.blur, defaults.blur, BLUR_KEYS);

  // Filter persists by label only so it can be re-resolved on load.
  const filterLabel = params.filters.opt ? params.filters.opt.label : undefined;
  const filters =
    filterLabel && filterLabel.length > 0
      ? { label: filterLabel }
      : undefined;

  if (!lights && !colors && !effects && !blur && !filters) return null;

  const recipe: RecipeV1 = { version: 1 };
  if (name) recipe.name = name;
  if (lights) recipe.lights = lights;
  if (colors) recipe.colors = colors;
  if (effects) recipe.effects = effects;
  if (blur) recipe.blur = blur;
  if (filters) recipe.filters = filters;
  return recipe;
}

export function applyRecipe(
  params: EditorParams,
  recipe: RecipeV1,
): EditorParams {
  // Section-level clone keeps applyRecipe pure (structuredClone would throw on
  // the HTMLImageElement textures a filter/blend section can hold).
  const next = cloneEditorParams(params);

  if (recipe.lights) Object.assign(next.lights, recipe.lights);
  if (recipe.colors) Object.assign(next.colors, recipe.colors);
  if (recipe.effects) Object.assign(next.effects, recipe.effects);
  if (recipe.blur) Object.assign(next.blur, recipe.blur);

  if (recipe.filters) {
    // Label-only placeholder; resolve it to a renderer-ready option with a
    // FilterPreset (the React controller's `recipes.apply` does this).
    next.filters.opt = { label: recipe.filters.label };
  } else {
    next.filters.opt = 0;
  }

  return next;
}

export function serializeRecipe(recipe: RecipeV1): string {
  return JSON.stringify(recipe, null, 2);
}

export function parseRecipe(json: string): RecipeV1 {
  const parsed = JSON.parse(json) as { version?: unknown } & Record<string, unknown>;
  if (parsed.version !== 1) {
    throw new Error("Unsupported recipe version");
  }
  return parsed as RecipeV1;
}

export function downloadRecipe(recipe: RecipeV1, filename?: string): void {
  // A recipe is JSON. Callers often pass the *image* filename (e.g.
  // "photo.png"), so strip any extension and always emit `.recipe.json` —
  // otherwise the browser downloads a JSON blob named "photo.png".
  const base = filename
    ? filename.replace(/\.[^/.]+$/, "")
    : `recipe_${new Date().toISOString().split("T")[0]}`;
  const name = `${base}.recipe.json`;
  const blob = new Blob([serializeRecipe(recipe)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
