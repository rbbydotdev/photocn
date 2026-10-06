import {
  cloneEditorParams,
  createEditorParams,
  type BlurParams,
  type ColorParams,
  type CurveChannels,
  type EditorParams,
  type EffectParams,
  type LightParams,
} from "./editor-params";
import { createGeometry, type GeometryParams } from "./compose";

export interface RecipeV1 {
  version: 1;
  name?: string;
  lights?: Partial<LightParams>;
  colors?: Partial<ColorParams>;
  effects?: Partial<EffectParams>;
  blur?: Partial<
    Pick<
      BlurParams,
      | "bokehstrength"
      | "bokehlensout"
      | "gaussianstrength"
      | "gaussianlensout"
      | "centerX"
      | "centerY"
    >
  >;
  /** Tone curves `[rgb, r, g, b]` (`null` = straight line). */
  curves?: CurveChannels;
  /**
   * Blended second image: its URL (or a data: URL for picked files) and the
   * mix, 0..1. Applying a recipe loads the image back.
   */
  blend?: { src: string; mix: number };
  /** `strength` is 0..1 (omitted = full strength). */
  filters?: { label: string; strength?: number };
  /** Crop, straighten, perspective, turns and flips (only non-default fields). */
  geometry?: Partial<GeometryParams>;
}

const BLUR_KEYS = [
  "bokehstrength",
  "bokehlensout",
  "gaussianstrength",
  "gaussianlensout",
  "centerX",
  "centerY",
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
  // Stored as 0..1 strength; params keep the renderer's offset (0 = full).
  const strength = Math.min(1, Math.max(0, (params.filters.mix ?? 0) + 1));
  const filters =
    filterLabel && filterLabel.length > 0
      ? strength < 1
        ? { label: filterLabel, strength }
        : { label: filterLabel }
      : undefined;

  const geometry = diffGeometry(params.geometry);
  const curves = diffCurves(params.curve.curvepoints);
  const blendSrc = imageSource(params.blender.blendmap);
  const blend = blendSrc ? { src: blendSrc, mix: params.blender.blendmix } : undefined;

  if (!lights && !colors && !effects && !blur && !filters && !geometry && !curves && !blend) {
    return null;
  }

  const recipe: RecipeV1 = { version: 1 };
  if (name) recipe.name = name;
  if (lights) recipe.lights = lights;
  if (colors) recipe.colors = colors;
  if (effects) recipe.effects = effects;
  if (blur) recipe.blur = blur;
  if (curves) recipe.curves = curves;
  if (blend) recipe.blend = blend;
  if (filters) recipe.filters = filters;
  if (geometry) recipe.geometry = geometry;
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
  // Curves, blend and filter describe the look: a recipe without them clears them.
  next.curve.curvepoints = recipe.curves ?? 0;
  // The blend image is loaded asynchronously by the caller (see
  // `loadRecipeBlend`); keep the mix and clear the old image.
  next.blender.blendmap = 0;
  next.blender.blendmix = recipe.blend?.mix ?? 0.5;
  // Geometry is normalized, so it applies to any photo. Recipes without it
  // leave the current crop alone.
  if (recipe.geometry) next.geometry = { ...createGeometry(), ...recipe.geometry };

  if (recipe.filters) {
    // Label-only placeholder; resolve it to a renderer-ready option with a
    // FilterPreset (the React controller's `recipes.apply` does this).
    next.filters.opt = { label: recipe.filters.label };
    next.filters.mix = (recipe.filters.strength ?? 1) - 1;
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

/** URL of an image a recipe can reload (`blob:` URLs die with the page). */
function imageSource(image: CanvasImageSource | 0): string | undefined {
  if (!image || typeof image !== "object" || !("src" in image)) return undefined;
  const src = (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src;
  return src && !src.startsWith("blob:") ? src : undefined;
}

const isStraight = (points: CurveChannels[number]) =>
  !points ||
  (points.length === 2 &&
    points[0]![0] === 0 &&
    points[0]![1] === 0 &&
    points[1]![0] === 1 &&
    points[1]![1] === 1);

function diffCurves(curvepoints: CurveChannels | 0): CurveChannels | undefined {
  if (!curvepoints || curvepoints.every(isStraight)) return undefined;
  return curvepoints.map((points) =>
    isStraight(points) ? null : points!.map(([x, y]) => [x, y]),
  ) as CurveChannels;
}

function diffGeometry(geometry: GeometryParams): Partial<GeometryParams> | undefined {
  const defaults = createGeometry() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(geometry)) {
    if (key.startsWith("$")) continue;
    if (JSON.stringify(value) !== JSON.stringify(defaults[key])) out[key] = value;
  }
  return Object.keys(out).length ? (out as Partial<GeometryParams>) : undefined;
}
