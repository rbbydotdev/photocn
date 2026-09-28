export type EditorColorSpace = "srgb" | "display-p3";

export interface SourceFileInfo {
  name?: string;
  size: number;
  type?: string;
  lastModified?: number;
}

export interface ImageDimensions {
  width?: number | string;
  height?: number | string;
}

export interface NormalizedFileInfo extends SourceFileInfo {
  hsize: string;
  width: number | string;
  height: number | string;
}

export interface RawImageMetadata {
  xml?: string;
  icc?: {
    ColorProfile?: unknown;
  };
  [key: string]: unknown;
}

export interface ColorSpaceMetadata {
  icc?: { ColorProfile?: unknown } | Record<string, unknown> | null;
}

export type NormalizedImageMetadata<TImage = unknown> = RawImageMetadata & {
  file: NormalizedFileInfo;
  img: TImage;
  colorspace: EditorColorSpace;
};

export interface CreateImageMetadataOptions<TImage = unknown> {
  metadata?: RawImageMetadata | null;
  fileInfo: SourceFileInfo;
  image: TImage;
  imageSize?: ImageDimensions;
}

export function formatFileSize(fileSizeInBytes: number): string {
  let unitIndex = -1;
  const byteUnits = [" kB", " MB", " GB", " TB", "PB", "EB", "ZB", "YB"];
  let size = fileSizeInBytes;

  do {
    size /= 1024;
    unitIndex++;
  } while (size > 1024);

  return `${Math.max(size, 0.1).toFixed(1)}${byteUnits[unitIndex]}`;
}

export function normalizeMetadataXml(xml: string | undefined): string | undefined {
  if (!xml) return xml;

  const xmlStart = xml.indexOf("<");
  const body = xmlStart >= 0 ? xml.slice(xmlStart) : xml;

  return body.replace(/ +(?= )/g, "").replace(/\r\n|\n|\r/gm, "");
}

export function detectColorSpace(
  metadata: ColorSpaceMetadata | null | undefined,
): EditorColorSpace {
  const profile = metadata?.icc?.ColorProfile;
  const profiles = Array.isArray(profile) ? profile : [profile];

  return profiles.some(
    (value) => typeof value === "string" && /\bp3\b/i.test(value),
  )
    ? "display-p3"
    : "srgb";
}

export function createImageMetadata<TImage = unknown>({
  metadata,
  fileInfo,
  image,
  imageSize,
}: CreateImageMetadataOptions<TImage>): NormalizedImageMetadata<TImage> {
  const normalized: RawImageMetadata = { ...(metadata ?? {}) };

  normalized.xml = normalizeMetadataXml(normalized.xml);

  return {
    ...normalized,
    file: {
      ...fileInfo,
      hsize: formatFileSize(fileInfo.size),
      width: imageSize?.width ?? "-",
      height: imageSize?.height ?? "-",
    },
    img: image,
    colorspace: detectColorSpace(normalized),
  };
}
