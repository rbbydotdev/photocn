declare module "../gl" {
  export function minigl(
    canvas: HTMLCanvasElement,
    image: CanvasImageSource | ImageData,
    colorspace?: "srgb" | "display-p3",
  ): unknown;
}
