// @ts-nocheck — soft-fork upstream, was strict:false in xphoto
import { minigl } from "../gl";

export type MiniGlColorSpace = "srgb" | "display-p3";
export type MiniGlImage = CanvasImageSource | ImageData;

export interface MiniGlRenderer {
  width: number;
  height: number;
  img: MiniGlImage;
  img_cropped?: CanvasImageSource;
  gl: {
    canvas: {
      width: number;
      height: number;
    };
  };
  loadImage(image?: MiniGlImage): void;
  resetCrop(): void;
  captureImage(type?: string, quality?: number | false): HTMLImageElement;
  readPixels(): Uint8Array;
  filterMatrix(params: unknown): void;
  filterPerspective(
    before: Array<[number, number]>,
    after: Array<[number, number]>,
    horizontal: boolean,
    vertical: boolean,
  ): void;
  crop(crop: { left: number; top: number; width: number; height: number }): void;
  filterBlend(blendmap: CanvasImageSource, blendmix: number): void;
  filterAdjustments(params: Record<string, unknown>): void;
  filterBloom(strength: number): void;
  filterNoise(strength: number): void;
  filterHighlightsShadows(highlights: number, shadows: number): void;
  filterCurves(curvepoints: unknown): void;
  filterInsta(opt: unknown, mix: number): void;
  filterBlurBokeh(params: unknown): void;
  filterBlurGaussian(params: unknown): void;
  paintCanvas(): void;
  destroy?: () => void;
}

export interface CreateMiniGlEditorOptions {
  canvas: HTMLCanvasElement;
  image: MiniGlImage;
  colorspace?: MiniGlColorSpace;
}

export interface MiniGlEditor {
  readonly renderer: MiniGlRenderer;
  dispose(): void;
  destroy(): void;
  reset(
    canvas: HTMLCanvasElement,
    image: MiniGlImage,
    colorspace?: MiniGlColorSpace,
  ): MiniGlRenderer;
}

const DEFAULT_COLORSPACE: MiniGlColorSpace = "srgb";

export function createMiniGlEditor(options: CreateMiniGlEditorOptions): MiniGlEditor {
  return new BrowserMiniGlEditor(options);
}

export class BrowserMiniGlEditor implements MiniGlEditor {
  #renderer: MiniGlRenderer;
  #destroyed = false;

  constructor(options: CreateMiniGlEditorOptions) {
    this.#renderer = createMiniGlRenderer(options);
  }

  get renderer(): MiniGlRenderer {
    return this.#renderer;
  }

  destroy(): void {
    if (this.#destroyed) return;

    this.#renderer.destroy?.();
    this.#destroyed = true;
  }

  dispose(): void {
    this.destroy();
  }

  reset(
    canvas: HTMLCanvasElement,
    image: MiniGlImage,
    colorspace: MiniGlColorSpace = DEFAULT_COLORSPACE,
  ): MiniGlRenderer {
    this.destroy();
    this.#renderer = createMiniGlRenderer({ canvas, image, colorspace });
    this.#destroyed = false;
    return this.#renderer;
  }
}

function createMiniGlRenderer({
  canvas,
  image,
  colorspace = DEFAULT_COLORSPACE,
}: CreateMiniGlEditorOptions): MiniGlRenderer {
  const renderer = minigl(canvas, image, colorspace) as unknown as MiniGlRenderer | undefined;

  if (!renderer) {
    throw new Error("Failed to create mini-gl renderer.");
  }

  return renderer;
}
