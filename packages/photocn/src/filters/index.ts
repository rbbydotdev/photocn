import type { FilterOption } from "../editor-params";

import lutAden from "./luts/LUT_aden.png";
import lutClarendon1 from "./luts/LUT_clarendon1.png";
import lutClarendon2 from "./luts/LUT_clarendon2.png";
import lutCrema from "./luts/LUT_crema.png";
import lutGingham1 from "./luts/LUT_gingham1.png";
import lutGinghamLgg from "./luts/LUT_gingham_lgg.png";
import lutJuno from "./luts/LUT_juno.png";
import lutLark from "./luts/LUT_lark.png";
import lutLudwig from "./luts/LUT_ludwig.png";
import lutMoon1 from "./luts/LUT_moon1.png";
import lutMoon2 from "./luts/LUT_moon2.png";
import lutReyes from "./luts/LUT_reyes.png";

/**
 * A selectable filter. `load` resolves the renderer-ready option (LUT
 * textures or a color matrix id). LUTs ship inlined as data URLs so the
 * package works in any bundler without asset configuration.
 */
export interface FilterPreset {
  label: string;
  load: () => Promise<FilterOption>;
}

/** Renderer-ready filter shape consumed by the `insta` GL filter. */
export interface LutFilterOption extends FilterOption {
  /** "1" single LUT, "2"/"3"/"4" two-texture variants, "MTX" color matrix. */
  type: "1" | "2" | "3" | "4" | "MTX";
  mtx: string | undefined;
  map1: HTMLImageElement | undefined;
  map2: HTMLImageElement | undefined;
}

const lutImageCache = new Map<string, Promise<HTMLImageElement>>();

/** Load (and cache) an image usable as a LUT texture. */
export function loadLutImage(url: string): Promise<HTMLImageElement> {
  let cached = lutImageCache.get(url);
  if (!cached) {
    cached = (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    })();
    lutImageCache.set(url, cached);
  }
  return cached;
}

/** Build a preset from a single 3D LUT strip (33x1089 PNG). */
export function createLutPreset(label: string, url: string): FilterPreset {
  return {
    label,
    load: async (): Promise<LutFilterOption> => ({
      type: "1",
      label,
      mtx: undefined,
      map1: await loadLutImage(url),
      map2: undefined,
    }),
  };
}

function doubleLut(
  type: "2" | "3" | "4",
  label: string,
  url1: string,
  url2: string,
): FilterPreset {
  return {
    label,
    load: async (): Promise<LutFilterOption> => {
      const [map1, map2] = await Promise.all([
        loadLutImage(url1),
        loadLutImage(url2),
      ]);
      return { type, label, mtx: undefined, map1, map2 };
    },
  };
}

/** Build a preset from one of the built-in color matrices. */
export function createMatrixPreset(
  label: string,
  matrix: "polaroid" | "kodachrome" | "browni" | "vintage" | (string & {}),
): FilterPreset {
  return {
    label,
    load: async (): Promise<LutFilterOption> => ({
      type: "MTX",
      label,
      mtx: matrix,
      map1: undefined,
      map2: undefined,
    }),
  };
}

export const filterPresets: readonly FilterPreset[] = [
  createLutPreset("aden", lutAden),
  createLutPreset("crema", lutCrema),
  doubleLut("2", "clarendon", lutClarendon1, lutClarendon2),
  doubleLut("3", "gingham", lutGingham1, lutGinghamLgg),
  createLutPreset("juno", lutJuno),
  createLutPreset("lark", lutLark),
  createLutPreset("ludwig", lutLudwig),
  doubleLut("4", "moon", lutMoon1, lutMoon2),
  createLutPreset("reyes", lutReyes),
  createMatrixPreset("polaroid", "polaroid"),
  createMatrixPreset("kodak", "kodachrome"),
  createMatrixPreset("browni", "browni"),
  createMatrixPreset("vintage", "vintage"),
];

export function findFilterPreset(
  label: string,
  presets: readonly FilterPreset[] = filterPresets,
): FilterPreset | undefined {
  return presets.find((preset) => preset.label === label);
}
