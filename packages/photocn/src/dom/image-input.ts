export type BrowserImageInput = string | HTMLImageElement | ArrayBuffer | Blob | File;

export interface BrowserImageFileInfo {
  name: string;
  size: number;
  type?: string;
  lastModified?: number;
}

export interface BrowserImageInputResult {
  arrayBuffer: ArrayBuffer;
  blob: Blob;
  image: HTMLImageElement;
  fileInfo: BrowserImageFileInfo;
}

export interface SelectImageFileOptions {
  accept?: string;
  document?: Document;
}

export interface DecodeImageInputOptions {
  name?: string;
  type?: string;
}

const DEFAULT_IMAGE_NAME = "image";

export function selectImageFile(options: SelectImageFileOptions = {}): Promise<File | undefined> {
  const ownerDocument = options.document ?? document;
  const input = ownerDocument.createElement("input");

  input.setAttribute("hidden", "");
  input.type = "file";
  input.value = "";
  input.accept = options.accept ?? "image/*";

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      input.remove();
    };

    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      resolve(file);
    };

    input.oncancel = () => {
      cleanup();
      resolve(undefined);
    };

    try {
      // Safari does not reliably open detached file inputs.
      ownerDocument.body.appendChild(input);
      input.click();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function readImageFile(
  file: File | Blob,
  options: DecodeImageInputOptions = {},
): Promise<BrowserImageInputResult> {
  return decodeImageInput(file, options);
}

export async function decodeImageInput(
  input: BrowserImageInput,
  options: DecodeImageInputOptions = {},
): Promise<BrowserImageInputResult> {
  if (typeof input === "string") {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const image = await decodeBlobToImage(blob);

    return {
      arrayBuffer,
      blob,
      image,
      fileInfo: {
        name: options.name ?? nameFromUrl(input) ?? DEFAULT_IMAGE_NAME,
        size: arrayBuffer.byteLength,
        type: blob.type || options.type,
      },
    };
  }

  if (input instanceof HTMLImageElement) {
    const src = input.currentSrc || input.src;
    if (!src) {
      throw new Error("HTMLImageElement input must have a src or currentSrc.");
    }

    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    if (!input.complete) {
      await input.decode();
    }

    return {
      arrayBuffer,
      blob,
      image: input,
      fileInfo: {
        name: options.name ?? (input.id || nameFromUrl(src) || DEFAULT_IMAGE_NAME),
        size: arrayBuffer.byteLength,
        type: blob.type || options.type,
      },
    };
  }

  if (input instanceof ArrayBuffer) {
    const blob = new Blob([input], options.type ? { type: options.type } : undefined);
    const image = await decodeBlobToImage(blob);

    return {
      arrayBuffer: input,
      blob,
      image,
      fileInfo: {
        name: options.name ?? DEFAULT_IMAGE_NAME,
        size: input.byteLength,
        type: blob.type || options.type,
      },
    };
  }

  if (input instanceof Blob) {
    const arrayBuffer = await input.arrayBuffer();
    const image = await decodeBlobToImage(input);
    const fileInfo: BrowserImageFileInfo = {
      name: options.name ?? fileName(input) ?? DEFAULT_IMAGE_NAME,
      size: input.size,
      type: input.type || options.type,
    };
    const lastModified = fileLastModified(input);

    if (lastModified !== undefined) {
      fileInfo.lastModified = lastModified;
    }

    return {
      arrayBuffer,
      blob: input,
      image,
      fileInfo,
    };
  }

  throw new TypeError("Unsupported browser image input.");
}

async function decodeBlobToImage(blob: Blob): Promise<HTMLImageElement> {
  const image = new Image();
  const objectUrl = URL.createObjectURL(blob);

  try {
    image.src = objectUrl;
    await image.decode();
    return image;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function fileName(blob: Blob): string | undefined {
  return blob instanceof File ? blob.name : undefined;
}

function fileLastModified(blob: Blob): number | undefined {
  return blob instanceof File ? blob.lastModified : undefined;
}

function nameFromUrl(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.href);
    const name = url.pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : undefined;
  } catch {
    const name = value.split(/[?#]/, 1)[0]?.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : undefined;
  }
}
