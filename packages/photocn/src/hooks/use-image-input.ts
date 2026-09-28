import { useCallback, useEffect, useRef, useState } from "react";

import {
  decodeImageInput,
  selectImageFile,
  type BrowserImageInput,
  type BrowserImageInputResult,
  type DecodeImageInputOptions,
  type SelectImageFileOptions,
} from "../dom";

import { useLatestRef } from "./use-latest-ref";

export type ImageInputStatus = "idle" | "loading" | "loaded" | "error";

export interface UseImageInputOptions {
  input?: BrowserImageInput | null;
  decodeOptions?: DecodeImageInputOptions;
  autoDecode?: boolean;
  onLoad?: (result: BrowserImageInputResult) => void;
  onError?: (error: unknown) => void;
}

export interface UseImageInputResult {
  result: BrowserImageInputResult | null;
  image: HTMLImageElement | null;
  arrayBuffer: ArrayBuffer | null;
  blob: Blob | null;
  fileInfo: BrowserImageInputResult["fileInfo"] | null;
  status: ImageInputStatus;
  error: unknown;
  isLoading: boolean;
  decode: (
    input: BrowserImageInput,
    options?: DecodeImageInputOptions,
  ) => Promise<BrowserImageInputResult>;
  select: (
    options?: SelectImageFileOptions & DecodeImageInputOptions,
  ) => Promise<BrowserImageInputResult | undefined>;
  reset: () => void;
}

export function useImageInput({
  input,
  decodeOptions,
  autoDecode = input !== undefined,
  onLoad,
  onError,
}: UseImageInputOptions = {}): UseImageInputResult {
  const requestIdRef = useRef(0);
  const onLoadRef = useLatestRef(onLoad);
  const onErrorRef = useLatestRef(onError);
  const [result, setResult] = useState<BrowserImageInputResult | null>(null);
  const [status, setStatus] = useState<ImageInputStatus>("idle");
  const [error, setError] = useState<unknown>(null);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setResult(null);
    setStatus("idle");
    setError(null);
  }, []);

  const decode = useCallback(
    async (
      nextInput: BrowserImageInput,
      nextOptions: DecodeImageInputOptions = {
        name: decodeOptions?.name,
        type: decodeOptions?.type,
      },
    ) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setStatus("loading");
      setError(null);

      try {
        const nextResult = await decodeImageInput(nextInput, nextOptions);

        if (requestIdRef.current === requestId) {
          setResult(nextResult);
          setStatus("loaded");
          onLoadRef.current?.(nextResult);
        }

        return nextResult;
      } catch (nextError) {
        if (requestIdRef.current === requestId) {
          setError(nextError);
          setStatus("error");
          onErrorRef.current?.(nextError);
        }

        throw nextError;
      }
    },
    [decodeOptions?.name, decodeOptions?.type],
  );

  const select = useCallback(
    async (options: SelectImageFileOptions & DecodeImageInputOptions = {}) => {
      const file = await selectImageFile(options);
      return file ? decode(file, options) : undefined;
    },
    [decode],
  );

  useEffect(() => {
    if (!autoDecode) return;

    if (input === null) {
      reset();
      return;
    }

    if (input !== undefined) {
      void decode(input);
    }
  }, [autoDecode, decode, input, reset]);

  return {
    result,
    image: result?.image ?? null,
    arrayBuffer: result?.arrayBuffer ?? null,
    blob: result?.blob ?? null,
    fileInfo: result?.fileInfo ?? null,
    status,
    error,
    isLoading: status === "loading",
    decode,
    select,
    reset,
  };
}
