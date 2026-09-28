/**
 * Loads params saved before the non-destructive geometry model
 * (docs/compose.md): the separate `trs`, `crop`, `perspective2` and `resizer`
 * sections become one `geometry` section.
 */
import {
  createGeometry,
  homography,
  apply,
  orientationFromMatrix,
  orientationLinear,
  orientedSize,
  type GeometryParams,
  type Lin2,
  type NormalizedRect,
  type Quad,
  type Size,
  type Vec2,
} from "./compose";
import {
  createEditorParams,
  editorParamSections,
  type EditorParams,
} from "./editor-params";

type Num = number | boolean | undefined | null;

/** The pre-geometry sections, as they were stored. */
export interface LegacyGeometrySections {
  trs?: {
    angle?: number;
    scale?: number;
    fliph?: Num;
    flipv?: Num;
  };
  crop?: {
    /** Pixel box in the source-sized canvas. */
    appliedCrop?: { left: number; top: number; width: number; height: number } | 0;
    canvas_angle?: number;
    ar?: number;
  };
  perspective2?: {
    before?: readonly Vec2[] | 0;
    after?: readonly Vec2[] | 0;
  };
  resizer?: { width?: number; height?: number };
}

export interface NormalizeEditorParamsOptions {
  /** Source size in px. Needed to convert a legacy pixel crop and zoom. */
  sourceSize?: Size | null;
}

export interface NormalizedEditorParams {
  params: EditorParams;
  /** Legacy output size (`resizer`). It is now an export option. */
  outputSize: Size | null;
  /** True when the input used the old format. */
  migrated: boolean;
  /** True when parts of it (pixel crop, zoom) still need `sourceSize`. */
  needsSourceSize: boolean;
}

const FLIP_H: Lin2 = [-1, 0, 0, 1];
const FLIP_V: Lin2 = [1, 0, 0, -1];

export function isLegacyEditorParams(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;
  return !("geometry" in record) && ("trs" in record || "crop" in record || "perspective2" in record);
}

/**
 * Accepts current params, legacy params, or a partial object, and returns
 * complete current-format params. Unknown sections are dropped.
 */
export function normalizeEditorParams(
  input: unknown,
  options: NormalizeEditorParamsOptions = {},
): NormalizedEditorParams {
  const params = createEditorParams();
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const section of editorParamSections) {
    const value = source[section];
    if (value && typeof value === "object") Object.assign(params[section], value);
  }
  if (!isLegacyEditorParams(input)) {
    return { params, outputSize: null, migrated: false, needsSourceSize: false };
  }
  const legacy = input as LegacyGeometrySections;
  const { geometry, needsSourceSize } = migrateGeometry(legacy, options.sourceSize ?? null);
  params.geometry = geometry;
  const width = legacy.resizer?.width ?? 0;
  const height = legacy.resizer?.height ?? 0;
  return {
    params,
    outputSize: width > 0 && height > 0 ? { width, height } : null,
    migrated: true,
    needsSourceSize,
  };
}

export function migrateGeometry(
  legacy: LegacyGeometrySections,
  sourceSize: Size | null,
): { geometry: GeometryParams; needsSourceSize: boolean } {
  const geometry = createGeometry();
  let needsSourceSize = false;

  // Rotation: the old UI treated positive as clockwise for both the 90° canvas
  // turns and the fine "Rotate" slider. Fold the total into quarter turns +
  // a ±45° straighten.
  const total = (legacy.crop?.canvas_angle ?? 0) + (legacy.trs?.angle ?? 0);
  const turns = Math.round(total / 90);
  const straighten = total - turns * 90;

  // Flips were applied in image space before rotating (same as ours).
  const fliph = Boolean(legacy.trs?.fliph);
  const flipv = Boolean(legacy.trs?.flipv);
  let flip: Lin2 = [1, 0, 0, 1];
  if (fliph) flip = mul2(FLIP_H, flip);
  if (flipv) flip = mul2(FLIP_V, flip);
  const rotation = rotationLinear(turns);
  const orientation = orientationFromMatrix(mul2(rotation, flip));
  Object.assign(geometry, orientation, { straighten });

  // Perspective: `before → after` in normalized canvas coords. Where the
  // full frame's corners land under that homography is our `corners` quad.
  const before = legacy.perspective2?.before;
  const after = legacy.perspective2?.after;
  if (isQuad(before) && isQuad(after)) {
    const h = homography(before, after);
    geometry.corners = (
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as Quad
    ).map((p) => apply(h, p)) as Quad;
  }

  // Crop: a pixel box in the (unrotated) source-sized canvas, then the old
  // zoom (`trs.scale`, 0 = fit) shrank the view about its center.
  const applied = legacy.crop?.appliedCrop;
  const zoom = (legacy.trs?.scale ?? 0) + 1;
  let crop: NormalizedRect | null = null;
  if (applied && typeof applied === "object" && applied.width > 0 && applied.height > 0) {
    if (sourceSize) {
      crop = {
        x: applied.left / sourceSize.width,
        y: applied.top / sourceSize.height,
        width: applied.width / sourceSize.width,
        height: applied.height / sourceSize.height,
      };
    } else {
      needsSourceSize = true;
    }
  }
  if (zoom > 1.0001) {
    const base = crop ?? { x: 0, y: 0, width: 1, height: 1 };
    const width = base.width / zoom;
    const height = base.height / zoom;
    crop = {
      x: base.x + (base.width - width) / 2,
      y: base.y + (base.height - height) / 2,
      width,
      height,
    };
  }
  if (crop) geometry.crop = rectToOriented(crop, mul2(rotation, flip));

  if (legacy.crop?.ar && legacy.crop.ar > 0) {
    // `ar` was a width/height ratio on screen, i.e. after rotation.
    geometry.aspectRatio = legacy.crop.ar;
  }

  // Sanity: a crop must describe a real area in the oriented frame.
  if (geometry.crop && sourceSize) {
    const oriented = orientedSize(sourceSize, geometry);
    if (geometry.crop.width * oriented.width < 1 || geometry.crop.height * oriented.height < 1) {
      geometry.crop = null;
    }
  }
  return { geometry, needsSourceSize };
}

function isQuad(value: unknown): value is Quad {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
  );
}

function mul2([a, b, c, d]: Lin2, [e, f, g, h]: Lin2): Lin2 {
  return [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];
}

function rotationLinear(quarterTurns: number): Lin2 {
  return orientationLinear({ quarterTurns: (((quarterTurns % 4) + 4) % 4) as 0 | 1 | 2 | 3, flipX: false });
}

/** Map a rect from the source frame into the oriented frame. */
function rectToOriented(rect: NormalizedRect, m: Lin2): NormalizedRect {
  const corners: Vec2[] = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ].map(([x, y]) => {
    const cx = x - 0.5;
    const cy = y - 0.5;
    return [m[0] * cx + m[1] * cy + 0.5, m[2] * cx + m[3] * cy + 0.5];
  });
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
