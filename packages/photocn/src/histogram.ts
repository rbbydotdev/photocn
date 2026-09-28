export type HistogramChannel = "red" | "green" | "blue";

export interface RgbHistogram {
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
  max: Record<HistogramChannel, number>;
}

export interface CalculateRgbHistogramOptions {
  minValue?: number;
  maxValue?: number;
}

const histogramLength = 256;

export function createEmptyRgbHistogram(): RgbHistogram {
  return {
    red: new Uint32Array(histogramLength),
    green: new Uint32Array(histogramLength),
    blue: new Uint32Array(histogramLength),
    max: {
      red: 0,
      green: 0,
      blue: 0,
    },
  };
}

export function calculateRgbHistogram(
  pixels: ArrayLike<number>,
  options: CalculateRgbHistogramOptions = {},
): RgbHistogram {
  const minValue = options.minValue ?? 2;
  const maxValue = options.maxValue ?? 253;
  const histogram = createEmptyRgbHistogram();
  const channels = [histogram.red, histogram.green, histogram.blue] as const;
  const maxKeys = ["red", "green", "blue"] as const;

  for (let index = 0; index < pixels.length; index++) {
    const channel = index % 4;
    if (channel > 2) continue;

    const value = pixels[index];
    if (value <= minValue || value >= maxValue) continue;

    const count = ++channels[channel][value];
    const maxKey = maxKeys[channel];
    if (count > histogram.max[maxKey]) {
      histogram.max[maxKey] = count;
    }
  }

  return histogram;
}
