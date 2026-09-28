/**
 * Non-destructive geometry: orientation → perspective → straighten → crop.
 *
 * Everything here is pure math. The renderer receives one 3×3 projective
 * matrix per frame (`composeMatrix`) that maps every output pixel back to a
 * source pixel, so no intermediate result is ever baked. See docs/compose.md.
 *
 * Coordinate spaces
 * - source uv:        0..1 over the original bitmap (y down).
 * - oriented:         the source after flip + quarter turns. `W × H` px.
 *                     "normalized oriented" = 0..1 over that frame.
 *                     Crop, corners and the image polygon live here.
 * - iso:              oriented px, centered, divided by L = max(W, H).
 *                     Isotropic, so rotations are rotations. The warp
 *                     (perspective + straighten) is defined here.
 */

export type Vec2 = [number, number];
/** Corners in TL, TR, BR, BL order. */
export type Quad = [Vec2, Vec2, Vec2, Vec2];
/** Row-major 3×3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface GeometryParams {
  /** Clockwise quarter turns, applied after the flip. */
  quarterTurns: 0 | 1 | 2 | 3;
  /** Mirror the source horizontally (before the turns). */
  flipX: boolean;
  /** Fine rotation in degrees, clockwise positive. */
  straighten: number;
  /** Horizontal keystone, -1..1. Positive enlarges the right side. */
  perspectiveX: number;
  /** Vertical keystone, -1..1. Positive enlarges the top. */
  perspectiveY: number;
  /** Advanced perspective: where each oriented image corner goes (normalized oriented, TL TR BR BL). */
  corners: Quad | null;
  /** The user's crop in normalized oriented coords; `null` = the whole image. */
  crop: NormalizedRect | null;
  /** Locked crop aspect ratio (width / height), `null` = free. */
  aspectRatio: number | null;
}

export const STRAIGHTEN_LIMIT = 45;
/** Keystone coefficient at slider ±1. */
export const PERSPECTIVE_STRENGTH = 0.6;

export function createGeometry(): GeometryParams {
  return {
    quarterTurns: 0,
    flipX: false,
    straighten: 0,
    perspectiveX: 0,
    perspectiveY: 0,
    corners: null,
    crop: null,
    aspectRatio: null,
  };
}

export function isGeometryDefault(g: GeometryParams): boolean {
  return (
    g.quarterTurns === 0 &&
    !g.flipX &&
    g.straighten === 0 &&
    g.perspectiveX === 0 &&
    g.perspectiveY === 0 &&
    !g.corners &&
    !g.crop &&
    g.aspectRatio === null
  );
}

/** True when anything besides orientation/crop warps the image. */
export function hasWarp(g: GeometryParams): boolean {
  return g.straighten !== 0 || g.perspectiveX !== 0 || g.perspectiveY !== 0 || Boolean(g.corners);
}

// ── Mat3 ────────────────────────────────────────────────────────────────

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function mulAll(...ms: Mat3[]): Mat3 {
  return ms.reduce((acc, m) => mul(acc, m), IDENTITY);
}

export function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("Singular matrix");
  const s = 1 / det;
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
  ];
}

export function apply(m: Mat3, [x, y]: Vec2): Vec2 {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

const translate = (x: number, y: number): Mat3 => [1, 0, x, 0, 1, y, 0, 0, 1];
const scale = (x: number, y: number): Mat3 => [x, 0, 0, 0, y, 0, 0, 0, 1];
const linear = ([a, b, c, d]: Lin2): Mat3 => [a, b, 0, c, d, 0, 0, 0, 1];

/** Homography mapping the 4 `from` points onto the 4 `to` points. */
export function homography(from: Quad, to: Quad): Mat3 {
  // Solve the 8×8 DLT system with h33 = 1.
  const rows: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = from[k];
    const [u, v] = to[k];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) {
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const p = rows[col][col];
    if (Math.abs(p) < 1e-12) throw new Error("Degenerate quad");
    for (let c = col; c < 9; c++) rows[col][c] /= p;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = rows[r][col];
      if (!f) continue;
      for (let c = col; c < 9; c++) rows[r][c] -= f * rows[col][c];
    }
  }
  const h = rows.map((row) => row[8]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// ── Orientation (dihedral group on centered normalized coords) ─────────

/** 2×2 integer matrix [a, b, c, d] = [[a, b], [c, d]]. */
type Lin2 = [number, number, number, number];

const ROT_CW: Lin2 = [0, -1, 1, 0];
const FLIP_H: Lin2 = [-1, 0, 0, 1];
const FLIP_V: Lin2 = [1, 0, 0, -1];

const mul2 = ([a, b, c, d]: Lin2, [e, f, g, h]: Lin2): Lin2 => [
  a * e + b * g,
  a * f + b * h,
  c * e + d * g,
  c * f + d * h,
];
const apply2 = ([a, b, c, d]: Lin2, [x, y]: Vec2): Vec2 => [a * x + b * y, c * x + d * y];
const transpose2 = ([a, b, c, d]: Lin2): Lin2 => [a, c, b, d];
const det2 = ([a, b, c, d]: Lin2) => a * d - b * c;

function rotation2(quarterTurns: number): Lin2 {
  let m: Lin2 = [1, 0, 0, 1];
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) m = mul2(ROT_CW, m);
  return m;
}

/** Source (centered normalized) → oriented (centered normalized). */
export function orientationLinear(g: Pick<GeometryParams, "quarterTurns" | "flipX">): Lin2 {
  return mul2(rotation2(g.quarterTurns), g.flipX ? FLIP_H : [1, 0, 0, 1]);
}

function decomposeOrientation(m: Lin2): Pick<GeometryParams, "quarterTurns" | "flipX"> {
  for (const flipX of [false, true]) {
    for (const quarterTurns of [0, 1, 2, 3] as const) {
      const candidate = orientationLinear({ quarterTurns, flipX });
      if (candidate.every((v, i) => v === m[i])) return { quarterTurns, flipX };
    }
  }
  throw new Error("Not an orientation matrix");
}

export function orientedSize(source: Size, g: Pick<GeometryParams, "quarterTurns">): Size {
  return g.quarterTurns % 2
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

// ── Warp: perspective + straighten, in iso units ───────────────────────

function isoFrame(oriented: Size) {
  const L = Math.max(oriented.width, oriented.height);
  const sx = oriented.width / L;
  const sy = oriented.height / L;
  return {
    /** normalized oriented → iso */
    toIso: mul(scale(sx, sy), translate(-0.5, -0.5)),
    /** iso → normalized oriented */
    fromIso: mul(translate(0.5, 0.5), scale(1 / sx, 1 / sy)),
    sx,
    sy,
  };
}

function isoCorners(oriented: Size): Quad {
  const { sx, sy } = isoFrame(oriented);
  return [
    [-sx / 2, -sy / 2],
    [sx / 2, -sy / 2],
    [sx / 2, sy / 2],
    [-sx / 2, sy / 2],
  ];
}

const NORMALIZED_CORNERS: Quad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

function straightenMatrix(degrees: number): Mat3 {
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

function keystoneMatrix(px: number, py: number): Mat3 {
  // w = 1 - cx·u + cy·v: w < 1 magnifies, so +x grows the right, +y the top.
  return [1, 0, 0, 0, 1, 0, -PERSPECTIVE_STRENGTH * px, PERSPECTIVE_STRENGTH * py, 1];
}

function cornersMatrix(g: GeometryParams, oriented: Size): Mat3 {
  if (!g.corners) return IDENTITY;
  const { toIso } = isoFrame(oriented);
  const dst = g.corners.map((p) => apply(toIso, p)) as Quad;
  return homography(isoCorners(oriented), dst);
}

/** Oriented iso → canvas iso (perspective corners, keystone, straighten). */
export function warpMatrix(g: GeometryParams, oriented: Size): Mat3 {
  return mulAll(
    straightenMatrix(g.straighten),
    keystoneMatrix(g.perspectiveX, g.perspectiveY),
    cornersMatrix(g, oriented),
  );
}

/** Normalized oriented → normalized canvas (same frame, after the warp). */
export function warpNormalized(g: GeometryParams, oriented: Size): Mat3 {
  const { toIso, fromIso } = isoFrame(oriented);
  return mulAll(fromIso, warpMatrix(g, oriented), toIso);
}

/** Where the image's corners end up, in normalized oriented coords (TL TR BR BL). */
export function imagePolygon(g: GeometryParams, source: Size): Quad {
  const oriented = orientedSize(source, g);
  const m = warpNormalized(g, oriented);
  return NORMALIZED_CORNERS.map((p) => apply(m, p)) as Quad;
}

export function polygonBounds(polygon: readonly Vec2[]): NormalizedRect {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// ── Crop fitting (in oriented px, so ratios are real) ──────────────────

function toPx(p: Vec2, s: Size): Vec2 {
  return [p[0] * s.width, p[1] * s.height];
}

function pointInConvex(p: Vec2, poly: readonly Vec2[], eps = 1e-6): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) <= eps) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function rectCornersPx(cx: number, cy: number, w: number, h: number): Vec2[] {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

/** True when `rect` (normalized oriented) lies inside the warped image. */
export function rectInsidePolygon(rect: NormalizedRect, polygon: Quad, oriented: Size): boolean {
  const poly = polygon.map((p) => toPx(p, oriented));
  const [x, y] = toPx([rect.x, rect.y], oriented);
  const [w, h] = [rect.width * oriented.width, rect.height * oriented.height];
  return rectCornersPx(x + w / 2, y + h / 2, w, h).every((c) => pointInConvex(c, poly, 1e-3));
}

/**
 * Largest version of `rect` (same center when possible, same ratio) that
 * fits inside `polygon`. This is "limit to image": the user's crop is kept
 * as intent and shrunk just enough for what's rendered.
 */
export function fitRectInPolygon(rect: NormalizedRect, polygon: Quad, oriented: Size): NormalizedRect {
  const poly = polygon.map((p) => toPx(p, oriented));
  let cx = (rect.x + rect.width / 2) * oriented.width;
  let cy = (rect.y + rect.height / 2) * oriented.height;
  const w = rect.width * oriented.width;
  const h = rect.height * oriented.height;

  if (!pointInConvex([cx, cy], poly)) {
    // Slide the center toward the polygon's centroid until it's inside.
    const gx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const gy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (pointInConvex([cx + (gx - cx) * mid, cy + (gy - cy) * mid], poly)) hi = mid;
      else lo = mid;
    }
    const t = Math.min(1, hi + 0.02);
    cx += (gx - cx) * t;
    cy += (gy - cy) * t;
  }

  const fits = (s: number) =>
    rectCornersPx(cx, cy, w * s, h * s).every((c) => pointInConvex(c, poly, 1e-3));
  let s = 1;
  if (!fits(1)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    s = lo;
  }
  return {
    x: (cx - (w * s) / 2) / oriented.width,
    y: (cy - (h * s) / 2) / oriented.height,
    width: (w * s) / oriented.width,
    height: (h * s) / oriented.height,
  };
}

/** Largest rect of `ratio` (w/h in px) centered on `center` inside the polygon. */
export function largestRectWithRatio(
  ratio: number,
  polygon: Quad,
  oriented: Size,
  center?: Vec2,
): NormalizedRect {
  const bounds = polygonBounds(polygon);
  const c = center ?? [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  const bw = bounds.width * oriented.width;
  const bh = bounds.height * oriented.height;
  // Start from the ratio-shaped rect that covers the bounds, then fit.
  const w = Math.max(bw, bh * ratio);
  const h = w / ratio;
  return fitRectInPolygon(
    {
      x: c[0] - w / 2 / oriented.width,
      y: c[1] - h / 2 / oriented.height,
      width: w / oriented.width,
      height: h / oriented.height,
    },
    polygon,
    oriented,
  );
}

/** The crop that is actually rendered (normalized oriented). */
export function effectiveCrop(g: GeometryParams, source: Size): NormalizedRect {
  const oriented = orientedSize(source, g);
  const polygon = imagePolygon(g, source);
  const base = g.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  if (!hasWarp(g) && !g.crop) return base;
  return fitRectInPolygon(base, polygon, oriented);
}

// ── Rendering ──────────────────────────────────────────────────────────

/**
 * Matrix mapping output uv (0..1 over `outputRect`, y down) to source uv.
 * `outputRect` is in normalized oriented coords: the effective crop for the
 * result, or the polygon bounds to show the whole warped image.
 */
export function composeMatrix(g: GeometryParams, source: Size, outputRect: NormalizedRect): Mat3 {
  const oriented = orientedSize(source, g);
  const [a, b, c, d] = transpose2(orientationLinear(g)); // inverse of an orthogonal matrix
  return mulAll(
    translate(0.5, 0.5),
    linear([a, b, c, d]),
    translate(-0.5, -0.5),
    invert(warpNormalized(g, oriented)),
    translate(outputRect.x, outputRect.y),
    scale(outputRect.width, outputRect.height),
  );
}

/** Pixel size of `outputRect` at the resolution of `source`. */
export function outputPixelSize(
  g: GeometryParams,
  source: Size,
  outputRect: NormalizedRect,
): Size {
  const oriented = orientedSize(source, g);
  return {
    width: Math.max(1, Math.round(outputRect.width * oriented.width)),
    height: Math.max(1, Math.round(outputRect.height * oriented.height)),
  };
}

/** Where a source uv lands, in normalized oriented canvas coords. */
export function sourceToCanvas(g: GeometryParams, source: Size, uv: Vec2): Vec2 {
  const oriented = orientedSize(source, g);
  const o = apply2(orientationLinear(g), [uv[0] - 0.5, uv[1] - 0.5]);
  return apply(warpNormalized(g, oriented), [o[0] + 0.5, o[1] + 0.5]);
}

// ── Display-side operations (what the user sees turns as a whole) ─────

function transformGeometry(g: GeometryParams, G: Lin2): GeometryParams {
  const det = det2(G);
  const orientation = decomposeOrientation(mul2(G, orientationLinear(g)));
  // Keystone lives in the warp's bottom row k = (-cx, cy); conjugating by G
  // gives k' = G·k.
  const k = apply2(G, [-g.perspectiveX, g.perspectiveY]);
  const onCentered = (p: Vec2): Vec2 => {
    const q = apply2(G, [p[0] - 0.5, p[1] - 0.5]);
    return [q[0] + 0.5, q[1] + 0.5];
  };
  let corners: Quad | null = null;
  if (g.corners) {
    const next: Vec2[] = [];
    g.corners.forEach((dst, i) => {
      const moved = onCentered(NORMALIZED_CORNERS[i]);
      const index = NORMALIZED_CORNERS.findIndex(
        (c) => Math.abs(c[0] - moved[0]) < 1e-9 && Math.abs(c[1] - moved[1]) < 1e-9,
      );
      next[index] = onCentered(dst);
    });
    corners = next as Quad;
  }
  let crop: NormalizedRect | null = null;
  if (g.crop) {
    const pts = rectCornersPx(
      g.crop.x + g.crop.width / 2,
      g.crop.y + g.crop.height / 2,
      g.crop.width,
      g.crop.height,
    ).map(onCentered);
    crop = polygonBounds(pts);
  }
  const swaps = G[0] === 0;
  return {
    ...orientation,
    straighten: det * g.straighten || 0,
    perspectiveX: -k[0] || 0,
    perspectiveY: k[1] || 0,
    corners,
    crop,
    aspectRatio: g.aspectRatio && swaps ? 1 / g.aspectRatio : g.aspectRatio,
  };
}

/** Quarter turn of the whole picture. */
export function rotateGeometry(g: GeometryParams, direction: 1 | -1): GeometryParams {
  return transformGeometry(g, direction === 1 ? ROT_CW : transpose2(ROT_CW));
}

/** Mirror what the user sees. */
export function flipGeometry(g: GeometryParams, axis: "horizontal" | "vertical"): GeometryParams {
  return transformGeometry(g, axis === "horizontal" ? FLIP_H : FLIP_V);
}

/**
 * Move one corner of the warped image to `target` (normalized oriented
 * canvas coords). Solves for the advanced `corners` quad under the current
 * keystone and straighten.
 */
export function setCornerTarget(
  g: GeometryParams,
  source: Size,
  index: 0 | 1 | 2 | 3,
  target: Vec2,
): GeometryParams {
  const oriented = orientedSize(source, g);
  const { toIso, fromIso } = isoFrame(oriented);
  const outer = mul(straightenMatrix(g.straighten), keystoneMatrix(g.perspectiveX, g.perspectiveY));
  const corners = (g.corners ?? NORMALIZED_CORNERS.map((p) => [...p])) as Quad;
  const next = corners.map((p) => [...p]) as Quad;
  next[index] = apply(mulAll(fromIso, invert(outer), toIso), target);
  return { ...g, corners: next };
}

/** Largest crop of `ratio` (px w/h) around the current crop's center. */
export function cropForAspectRatio(
  g: GeometryParams,
  source: Size,
  ratio: number | null,
): GeometryParams {
  if (!ratio) return { ...g, aspectRatio: null };
  const oriented = orientedSize(source, g);
  const current = effectiveCrop(g, source);
  const center: Vec2 = [current.x + current.width / 2, current.y + current.height / 2];
  const crop = largestRectWithRatio(ratio, imagePolygon(g, source), oriented, center);
  return { ...g, aspectRatio: ratio, crop };
}
