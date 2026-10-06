import { useCallback, useEffect, useRef, useState } from "react";

import {
  createExifHandle,
  readExifMetadata,
  type BrowserExifHandle,
  type CreateExifHandleOptions,
  type ExifMetadata,
  type ExifSource,
} from "../dom";

import { useLatestRef } from "./use-latest-ref";

export type ExifMetadataStatus = "idle" | "loading" | "loaded" | "error";

export interface UseExifMetadataOptions extends CreateExifHandleOptions {
  source?: ExifSource;
  autoRead?: boolean;
  onRead?: (metadata: ExifMetadata | undefined, handle: BrowserExifHandle | undefined) => void;
  onError?: (error: unknown) => void;
}

export interface UseExifMetadataResult {
  metadata: ExifMetadata | undefined;
  handle: BrowserExifHandle | undefined;
  status: ExifMetadataStatus;
  error: unknown;
  isLoading: boolean;
  /** The source the current `metadata`/`status` belong to (null before any read). */
  source: ExifSource | null;
  read: (
    source: ExifSource,
    options?: CreateExifHandleOptions,
  ) => Promise<ExifMetadata | undefined>;
  reset: () => void;
}

function isExifHandle(source: ExifSource): source is BrowserExifHandle {
  return Boolean(source && !(source instanceof ArrayBuffer) && "arrayBuffer" in source);
}

export function useExifMetadata({
  source,
  quicktime,
  autoRead = source !== undefined,
  onRead,
  onError,
}: UseExifMetadataOptions = {}): UseExifMetadataResult {
  const requestIdRef = useRef(0);
  const onReadRef = useLatestRef(onRead);
  const onErrorRef = useLatestRef(onError);
  const [metadata, setMetadata] = useState<ExifMetadata | undefined>();
  const [handle, setHandle] = useState<BrowserExifHandle | undefined>();
  const [status, setStatus] = useState<ExifMetadataStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const [readSource, setReadSource] = useState<ExifSource | null>(null);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setMetadata(undefined);
    setHandle(undefined);
    setStatus("idle");
    setError(null);
    setReadSource(null);
  }, []);

  const read = useCallback(
    async (
      nextSource: ExifSource,
      options: CreateExifHandleOptions = { quicktime },
    ) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setStatus("loading");
      setError(null);

      try {
        const nextHandle = isExifHandle(nextSource)
          ? nextSource
          : nextSource
            ? createExifHandle(nextSource, options)
            : undefined;
        const nextMetadata = readExifMetadata(nextHandle);

        if (requestIdRef.current === requestId) {
          setHandle(nextHandle);
          setMetadata(nextMetadata);
          setReadSource(nextSource);
          setStatus("loaded");
          onReadRef.current?.(nextMetadata, nextHandle);
        }

        return nextMetadata;
      } catch (nextError) {
        if (requestIdRef.current === requestId) {
          setError(nextError);
          setReadSource(nextSource);
          setStatus("error");
          onErrorRef.current?.(nextError);
        }

        throw nextError;
      }
    },
    [quicktime],
  );

  useEffect(() => {
    if (!autoRead) return;

    if (source === null) {
      reset();
      return;
    }

    if (source !== undefined) {
      void read(source);
    }
  }, [autoRead, read, reset, source]);

  return {
    metadata,
    handle,
    status,
    error,
    isLoading: status === "loading",
    source: readSource,
    read,
    reset,
  };
}
