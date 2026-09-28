import miniExif from "../exif";

export type ExifFormat = "JPG" | "PNG" | "HEIC" | "AVIF" | "JXL" | "QT" | (string & {});
export type ExifArea = "tiff" | "exif" | "gps";
export type ExifPatchValue = number | string | readonly number[] | ArrayBuffer | Uint8Array;

export interface ExifTag {
  value?: unknown;
  hvalue?: unknown;
  [key: string]: unknown;
}

export type ExifTagGroup = Record<string, ExifTag>;

export interface ExifMetadata {
  format?: ExifFormat;
  tiff?: ExifTagGroup;
  exif?: ExifTagGroup;
  gps?: ExifTagGroup;
  icc?: Record<string, unknown>;
  xml?: string;
  [key: string]: unknown;
}

export interface CreateExifHandleOptions {
  quicktime?: boolean;
}

export interface BrowserExifHandle {
  readonly arrayBuffer: ArrayBuffer;
  readonly __browserExifHandle?: never;
}

export interface ExifPatch {
  area: ExifArea;
  field: string;
  value: ExifPatchValue;
  value2?: ExifPatchValue;
}

export type ExifSource = BrowserExifHandle | ArrayBuffer | null | undefined;

export interface CreateExifOutputOptions {
  originalExif?: ExifSource;
  patchOrientationToOne?: boolean;
  type?: string;
}

interface MiniExifHandle {
  load?: (arrayBuffer: ArrayBuffer) => void;
  remove?: () => ArrayBuffer;
  read?: () => ExifMetadata | null | undefined;
  extract?: () => ArrayBuffer | null | undefined;
  image?: () => ArrayBuffer;
  replace?: (exifBytes: ArrayBuffer) => ArrayBuffer | void;
  patch?: (patch: ExifPatch | ExifPatch[]) => void;
}

type MiniExifFactory = (arrayBuffer: ArrayBuffer, quicktime?: boolean) => MiniExifHandle | undefined;

const createMiniExif = miniExif as MiniExifFactory;
const nativeHandles = new WeakMap<BrowserExifHandle, MiniExifHandle>();

export function createExifHandle(
  arrayBuffer: ArrayBuffer,
  options: CreateExifHandleOptions = {},
): BrowserExifHandle | undefined {
  try {
    const native = createMiniExif(arrayBuffer, options.quicktime);
    if (!native) return undefined;

    const handle: BrowserExifHandle = { arrayBuffer };
    nativeHandles.set(handle, native);
    return handle;
  } catch {
    return undefined;
  }
}

export function readExifMetadata(handle: BrowserExifHandle | undefined): ExifMetadata | undefined {
  try {
    return getNativeHandle(handle)?.read?.() ?? undefined;
  } catch {
    return undefined;
  }
}

export function extractExifBytes(handle: BrowserExifHandle | undefined): ArrayBuffer | undefined {
  try {
    return getNativeHandle(handle)?.extract?.() ?? undefined;
  } catch {
    return undefined;
  }
}

export function replaceExifBytes(
  handle: BrowserExifHandle,
  exifBytes: ArrayBuffer,
  options: Pick<CreateExifOutputOptions, "patchOrientationToOne"> = {},
): ArrayBuffer {
  const native = getNativeHandle(handle);

  if (!native?.replace) {
    throw new Error("EXIF replacement is not supported for this image format.");
  }

  const replaced = native.replace(exifBytes);

  if (options.patchOrientationToOne && readExifMetadata(handle)?.tiff?.Orientation) {
    native.patch?.({ area: "tiff", field: "Orientation", value: 1 });
  }

  const image = native.image?.();
  if (image) return image;
  if (replaced instanceof ArrayBuffer) return replaced;
  return handle.arrayBuffer;
}

export function createExifOutputArrayBuffer(
  arrayBuffer: ArrayBuffer,
  options: CreateExifOutputOptions = {},
): ArrayBuffer {
  const originalExifBytes = resolveExifBytes(options.originalExif);

  if (!originalExifBytes) {
    return arrayBuffer;
  }

  const handle = createExifHandle(arrayBuffer);

  if (!handle) {
    throw new Error("Unable to parse output image for EXIF replacement.");
  }

  return replaceExifBytes(handle, originalExifBytes, options);
}

export function createExifOutputBlob(
  arrayBuffer: ArrayBuffer,
  options: CreateExifOutputOptions = {},
): Blob {
  return new Blob([createExifOutputArrayBuffer(arrayBuffer, options)], options.type ? { type: options.type } : undefined);
}

function resolveExifBytes(source: ExifSource): ArrayBuffer | undefined {
  if (!source) return undefined;
  if (source instanceof ArrayBuffer) return source;
  return extractExifBytes(source);
}

function getNativeHandle(handle: BrowserExifHandle | undefined): MiniExifHandle | undefined {
  return handle ? nativeHandles.get(handle) : undefined;
}
