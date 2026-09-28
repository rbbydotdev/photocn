import type { RendererOp } from "./protocol";

/**
 * Per-op resolution-scaling rule. The bridge applies these when the worker
 * is rendering at proxy resolution, so a "10px blur" at full-res becomes a
 * "2.5px blur" against a 4x-downsampled proxy and the visual result matches.
 *
 * - **scale-linear**: spatial-pixel param scales by `s = proxy/full`. Blur
 *   radii are the canonical case. Each param key maps to a scale function.
 * - **skip-on-proxy**: drop the op entirely at proxy res. Noise/grain is the
 *   canonical case — random per-pixel noise on a downsampled buffer creates
 *   visually larger grain that doesn't match the full-res output. The full
 *   pass during idle re-render adds it back.
 * - **identity**: leave alone. Curves, color grades, exposure, white balance,
 *   filters/LUTs — all pixel-value operations that look the same at any res.
 *
 * Anything not listed is treated as identity. Conservative default — adding
 * a wrong scaling is worse than no scaling.
 */
type Rule =
  | { kind: "identity" }
  | { kind: "skip-on-proxy" }
  | {
      kind: "scale-linear";
      /** Object-arg property keys to scale (for ops that take an options object). */
      keys?: string[];
      /** Positional indices to scale (for ops that take primitive number args). */
      argIndices?: number[];
    };

const RULES: Record<string, Rule> = {
  // Blur passes take their kernel size from these strength fields. Scaling
  // them keeps the visual blur radius constant across resolutions.
  filterBlurGaussian: { kind: "scale-linear", keys: ["gaussianstrength"] },
  filterBlurBokeh: { kind: "scale-linear", keys: ["bokehstrength"] },
  // Bloom's shader uses `BlurSize = 3.0 * filterStrength` as a texel-space
  // kernel size. Same texel count at smaller proxy = larger image-space
  // kernel, so the proxy looks blurrier than the full at the same param.
  // Scale linearly with the resolution ratio to match.
  filterBloom: { kind: "scale-linear", argIndices: [0] },
  // Random per-pixel noise: skip on proxy, add only at full-res commit.
  filterNoise: { kind: "skip-on-proxy" },
  // Notes on intentional identity:
  //   filterAdjustments.vignette → fragment shader runs in normalized -1..1
  //     texCoord space, no resolution dependence.
  //   filterAdjustments.clarity → uses a fixed 3×3 convolution kernel.
  //     Genuinely res-dependent (3 px on a proxy ≈ 12 px in original space)
  //     but no clean linear scale exists for a fixed-size kernel. Visible
  //     asymmetry between proxy and full at high clarity values is accepted
  //     as a known proxy-mode trade.
};

export interface ScaleOpsOptions {
  /** When false, skip-on-proxy rules are demoted to identity (op stays). */
  skipOnProxy?: boolean;
}

/**
 * Returns a new ops array with proxy-mode adjustments applied.
 * `scale === 1` returns the input untouched (no allocation).
 *
 * Args containing primitive numbers stay primitive. Args that are option
 * objects get a shallow clone with the relevant keys multiplied; we never
 * mutate the caller's object. Non-listed ops are passed through.
 */
export function scaleOpsForResolution(
  ops: RendererOp[],
  scale: number,
  options: ScaleOpsOptions = {},
): RendererOp[] {
  if (scale === 1) return ops;
  const skipOnProxy = options.skipOnProxy ?? true;
  const out: RendererOp[] = [];
  for (const op of ops) {
    const rule = RULES[op.name] ?? { kind: "identity" };
    if (rule.kind === "skip-on-proxy") {
      if (skipOnProxy) continue;
      out.push(op);
      continue;
    }
    if (rule.kind === "identity") {
      out.push(op);
      continue;
    }
    out.push({ name: op.name, args: scaleArgs(op.args, rule, scale) });
  }
  return out;
}

function scaleArgs(
  args: unknown[],
  rule: { keys?: string[]; argIndices?: number[] },
  scale: number,
): unknown[] {
  const keys = rule.keys ?? [];
  const indices = new Set(rule.argIndices ?? []);
  return args.map((arg, index) => {
    if (typeof arg === "number") {
      return indices.has(index) ? arg * scale : arg;
    }
    if (keys.length > 0 && arg && typeof arg === "object") {
      const obj = arg as Record<string, unknown>;
      const next: Record<string, unknown> = { ...obj };
      for (const key of keys) {
        const value = obj[key];
        if (typeof value === "number") next[key] = value * scale;
      }
      return next;
    }
    return arg;
  });
}
