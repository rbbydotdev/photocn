export type HistogramColorChannel = "red" | "green" | "blue";

export interface RgbHistogram {
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
  max: Record<HistogramColorChannel, number>;
  pixels: number;
}

export interface CalculateRgbHistogramOptions {
  minValue?: number;
  maxValue?: number;
  alphaThreshold?: number;
  /**
   * Sample every Nth pixel instead of all of them. The result is statistically
   * indistinguishable from the full pass for any reasonable image (the
   * histogram is a 256-bucket aggregate, and 4K → ~8M pixels even at stride=8
   * still gives ~1M samples per channel). Default 1 (no downsampling).
   *
   * Practical guidance:
   *   - 4K+ image during interactive drag: stride 4–8 → 16–64× faster
   *   - Final paint or static image: stride 1
   */
  stride?: number;
}

export interface DrawRgbHistogramOptions {
  red?: string;
  green?: string;
  blue?: string;
  compositeOperation?: GlobalCompositeOperation;
  alpha?: number;
  clear?: boolean;
  /**
   * Smooth the drawn curve (display only; the data stays exact). Edits that
   * stretch tones leave some of the 256 levels empty, which draws as a comb
   * of spikes. Lightroom and Photos smooth this too. Default `true`.
   */
  smooth?: boolean;
}

export type HistogramPixelSource =
  | ImageData
  | Uint8Array
  | Uint8ClampedArray
  | ArrayLike<number>;

export type HistogramRenderingContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export interface CreateHistogramRendererOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  context?: HistogramRenderingContext;
  colorspace?: PredefinedColorSpace;
  thumbnailWidth?: number;
  histogram?: CalculateRgbHistogramOptions;
  draw?: DrawRgbHistogramOptions;
}

export interface HistogramRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly context: HistogramRenderingContext;
  draw(pixels: HistogramPixelSource): RgbHistogram;
  drawImage(image: CanvasImageSource): RgbHistogram;
  clear(): void;
}

const DEFAULT_MIN_VALUE = 3;
const DEFAULT_MAX_VALUE = 252;
const DEFAULT_THUMBNAIL_WIDTH = 350;

export function createRgbHistogram(): RgbHistogram {
  return {
    red: new Uint32Array(256),
    green: new Uint32Array(256),
    blue: new Uint32Array(256),
    max: {
      red: 0,
      green: 0,
      blue: 0,
    },
    pixels: 0,
  };
}

export function calculateRgbHistogram(
  source: HistogramPixelSource,
  options: CalculateRgbHistogramOptions = {},
  target: RgbHistogram = createRgbHistogram(),
): RgbHistogram {
  const pixels = "data" in source ? source.data : source;
  const minValue = options.minValue ?? DEFAULT_MIN_VALUE;
  const maxValue = options.maxValue ?? DEFAULT_MAX_VALUE;
  const alphaThreshold = options.alphaThreshold;
  const stride = Math.max(1, Math.floor(options.stride ?? 1));
  // 4 bytes per pixel × stride. e.g. stride=8 → step 32, every 8th pixel.
  const step = 4 * stride;

  target.red.fill(0);
  target.green.fill(0);
  target.blue.fill(0);
  target.max.red = 0;
  target.max.green = 0;
  target.max.blue = 0;
  target.pixels = 0;

  for (let i = 0; i + 2 < pixels.length; i += step) {
    if (alphaThreshold !== undefined && (pixels[i + 3] ?? 255) < alphaThreshold) {
      continue;
    }

    target.pixels += 1;
    addSample(target.red, "red", pixels[i] ?? 0, minValue, maxValue, target.max);
    addSample(target.green, "green", pixels[i + 1] ?? 0, minValue, maxValue, target.max);
    addSample(target.blue, "blue", pixels[i + 2] ?? 0, minValue, maxValue, target.max);
  }

  return target;
}

export function drawRgbHistogram(
  context: HistogramRenderingContext,
  histogram: RgbHistogram,
  options: DrawRgbHistogramOptions = {},
): void {
  const { width, height } = context.canvas;
  const previousComposite = context.globalCompositeOperation;
  const previousAlpha = context.globalAlpha;

  if (options.clear ?? true) {
    context.clearRect(0, 0, width, height);
  }

  context.globalCompositeOperation = options.compositeOperation ?? "lighter";
  context.globalAlpha = options.alpha ?? 1;
  const smooth = options.smooth ?? true;
  drawChannel(context, options.red ?? "#c13119", histogram.red, histogram.max.red, smooth);
  drawChannel(context, options.green ?? "#0c9427", histogram.green, histogram.max.green, smooth);
  drawChannel(context, options.blue ?? "#1e73be", histogram.blue, histogram.max.blue, smooth);
  context.globalCompositeOperation = previousComposite;
  context.globalAlpha = previousAlpha;
}

export function createHistogramRenderer(
  options: CreateHistogramRendererOptions = {},
): HistogramRenderer {
  const context =
    options.context ?? getCanvasContext(options.canvas ?? createCanvas(256, 150), options.colorspace);
  const canvas = context.canvas;
  const histogram = createRgbHistogram();
  const thumbnailWidth = options.thumbnailWidth ?? DEFAULT_THUMBNAIL_WIDTH;
  const scratch = createCanvas(thumbnailWidth, thumbnailWidth);
  const scratchContext = getCanvasContext(scratch, options.colorspace, true);

  return {
    canvas,
    context,
    draw(pixels) {
      const result = calculateRgbHistogram(pixels, options.histogram, histogram);
      drawRgbHistogram(context, result, options.draw);
      return result;
    },
    drawImage(image) {
      const { width, height } = imageDimensions(image);
      const ratio = width > 0 && height > 0 ? width / height : 1;
      scratch.width = thumbnailWidth;
      scratch.height = Math.max(1, Math.round(thumbnailWidth / ratio));
      scratchContext.clearRect(0, 0, scratch.width, scratch.height);
      scratchContext.drawImage(image, 0, 0, width, height, 0, 0, scratch.width, scratch.height);

      return this.draw(
        scratchContext.getImageData(0, 0, scratch.width, scratch.height).data,
      );
    },
    clear() {
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    },
  };
}

function addSample(
  channel: Uint32Array,
  channelName: HistogramColorChannel,
  value: number,
  minValue: number,
  maxValue: number,
  max: Record<HistogramColorChannel, number>,
): void {
  if (value < minValue || value > maxValue) return;

  const count = channel[value] + 1;
  channel[value] = count;
  if (count > max[channelName]) {
    max[channelName] = count;
  }
}

/**
 * Fill interior zero-runs by linearly interpolating between their non-zero
 * neighbours. The worker downsamples (stride-8), so some intensity buckets land
 * empty even on a smooth image — drawn raw they drop the curve to the baseline,
 * showing as gaps/notches. Leading/trailing zeros are left alone (those
 * intensities genuinely have no pixels).
 */
function interpolateGaps(channel: Uint32Array): Float32Array {
  const n = channel.length;
  const out = new Float32Array(n);
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i += 1) {
    const v = channel[i] ?? 0;
    out[i] = v;
    if (v > 0) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return out;
  let i = first + 1;
  while (i < last) {
    if ((out[i] ?? 0) > 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < last && (channel[j] ?? 0) === 0) j += 1;
    const startVal = out[i - 1] ?? 0;
    const endVal = out[j] ?? 0;
    const span = j - (i - 1);
    for (let k = i; k < j; k += 1) {
      out[k] = startVal + ((endVal - startVal) * (k - (i - 1))) / span;
    }
    i = j;
  }
  return out;
}

/** 5-tap binomial blur [1 4 6 4 1] / 16 over the 256 levels (edges clamped). */
export function smoothBins(values: ArrayLike<number>): Float64Array {
  const out = new Float64Array(256);
  const at = (i: number) => values[Math.min(255, Math.max(0, i))] ?? 0;
  for (let i = 0; i < 256; i += 1) {
    out[i] = (at(i - 2) + 4 * at(i - 1) + 6 * at(i) + 4 * at(i + 1) + at(i + 2)) / 16;
  }
  return out;
}

function drawChannel(
  context: HistogramRenderingContext,
  color: string,
  channel: Uint32Array,
  rawMax: number,
  smooth = true,
): void {
  if (rawMax <= 0) return;

  const { width, height } = context.canvas;
  const filled = interpolateGaps(channel);
  const values = smooth ? smoothBins(filled) : filled;
  // Scale to the drawn peak so smoothing doesn't flatten the curve.
  let max = 0;
  for (let i = 0; i < 256; i += 1) max = Math.max(max, values[i] ?? 0);
  if (max <= 0) return;
  let x = 0;

  context.beginPath();
  context.moveTo(0, height);

  for (let i = 0; i < 256; i += 1) {
    const lineHeight = Math.round(((values[i] ?? 0) * height) / max);
    x = Math.round((i * width) / 255);
    context.lineTo(x, height - lineHeight);
  }

  context.lineTo(x, height);
  context.fillStyle = color;
  context.fill();
  context.closePath();
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document === "undefined") {
    throw new Error("A canvas or browser document is required to create a histogram renderer.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  colorspace: PredefinedColorSpace | undefined,
  willReadFrequently = false,
): HistogramRenderingContext {
  const settings: CanvasRenderingContext2DSettings & { colorSpace?: PredefinedColorSpace } = {
    willReadFrequently,
  };

  if (colorspace) {
    settings.colorSpace = colorspace;
  }

  const context = canvas.getContext("2d", settings) as HistogramRenderingContext | null;

  if (!context) {
    throw new Error("Failed to create a 2D canvas context for histogram rendering.");
  }

  return context;
}

function imageDimensions(image: CanvasImageSource): { width: number; height: number } {
  if (image instanceof HTMLVideoElement) {
    return { width: image.videoWidth, height: image.videoHeight };
  }

  if (typeof SVGImageElement !== "undefined" && image instanceof SVGImageElement) {
    return {
      width: image.width.baseVal.value,
      height: image.height.baseVal.value,
    };
  }

  if (typeof VideoFrame !== "undefined" && image instanceof VideoFrame) {
    return { width: image.displayWidth, height: image.displayHeight };
  }

  const sizedImage = image as {
    width: number;
    height: number;
  };

  return {
    width: sizedImage.width,
    height: sizedImage.height,
  };
}
