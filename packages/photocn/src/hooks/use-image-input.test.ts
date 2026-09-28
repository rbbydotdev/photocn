import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../dom", () => ({
  decodeImageInput: vi.fn(),
  selectImageFile: vi.fn(),
}));

import {
  decodeImageInput,
  selectImageFile,
  type BrowserImageInputResult,
} from "../dom";

import { useImageInput } from "./use-image-input";

const decodeImageInputMock = vi.mocked(decodeImageInput);
const selectImageFileMock = vi.mocked(selectImageFile);

function makeStubResult(
  overrides: Partial<BrowserImageInputResult> = {},
): BrowserImageInputResult {
  const arrayBuffer = new ArrayBuffer(8);
  const blob = new Blob([arrayBuffer], { type: "image/png" });
  // happy-dom supports HTMLImageElement constructor sufficiently for this stub.
  const image = document.createElement("img");

  return {
    arrayBuffer,
    blob,
    image,
    fileInfo: { name: "stub.png", size: 8, type: "image/png" },
    ...overrides,
  };
}

function makeStubFile(name = "input.png", type = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

describe("useImageInput", () => {
  beforeEach(() => {
    decodeImageInputMock.mockReset();
    selectImageFileMock.mockReset();
  });

  describe("initial shape", () => {
    it("returns idle state and callable trigger functions", () => {
      const { result } = renderHook(() => useImageInput());

      expect(result.current.status).toBe("idle");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.result).toBeNull();
      expect(result.current.image).toBeNull();
      expect(result.current.arrayBuffer).toBeNull();
      expect(result.current.blob).toBeNull();
      expect(result.current.fileInfo).toBeNull();
      expect(typeof result.current.decode).toBe("function");
      expect(typeof result.current.select).toBe("function");
      expect(typeof result.current.reset).toBe("function");
    });
  });

  describe("decode", () => {
    it("calls the mocked decoder with the file and surfaces its result", async () => {
      const stub = makeStubResult();
      decodeImageInputMock.mockResolvedValueOnce(stub);

      const { result } = renderHook(() => useImageInput());
      const file = makeStubFile();

      let returned: BrowserImageInputResult | undefined;
      await act(async () => {
        returned = await result.current.decode(file);
      });

      expect(decodeImageInputMock).toHaveBeenCalledTimes(1);
      expect(decodeImageInputMock).toHaveBeenCalledWith(file, expect.any(Object));
      expect(returned).toBe(stub);
      expect(result.current.status).toBe("loaded");
      expect(result.current.result).toBe(stub);
      expect(result.current.image).toBe(stub.image);
      expect(result.current.arrayBuffer).toBe(stub.arrayBuffer);
      expect(result.current.blob).toBe(stub.blob);
      expect(result.current.fileInfo).toEqual(stub.fileInfo);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("invokes onLoad with the decoded result", async () => {
      const stub = makeStubResult();
      decodeImageInputMock.mockResolvedValueOnce(stub);
      const onLoad = vi.fn();

      const { result } = renderHook(() => useImageInput({ onLoad }));

      await act(async () => {
        await result.current.decode(makeStubFile());
      });

      expect(onLoad).toHaveBeenCalledTimes(1);
      expect(onLoad).toHaveBeenCalledWith(stub);
    });

    it("flips status to error and surfaces the rejection (loading=false)", async () => {
      const failure = new Error("decode failed");
      decodeImageInputMock.mockRejectedValueOnce(failure);
      const onError = vi.fn();

      const { result } = renderHook(() => useImageInput({ onError }));

      await act(async () => {
        await expect(result.current.decode(makeStubFile())).rejects.toBe(failure);
      });

      expect(result.current.status).toBe("error");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(failure);
      expect(result.current.result).toBeNull();
      expect(onError).toHaveBeenCalledWith(failure);
    });

    it("a successful second call resets a prior error", async () => {
      const failure = new Error("nope");
      const stub = makeStubResult();
      decodeImageInputMock.mockRejectedValueOnce(failure);
      decodeImageInputMock.mockResolvedValueOnce(stub);

      const { result } = renderHook(() => useImageInput());

      await act(async () => {
        await expect(result.current.decode(makeStubFile())).rejects.toBe(failure);
      });
      expect(result.current.status).toBe("error");

      await act(async () => {
        await result.current.decode(makeStubFile("second.png"));
      });

      expect(result.current.status).toBe("loaded");
      expect(result.current.error).toBeNull();
      expect(result.current.result).toBe(stub);
    });

    it("multiple sequential decodes overwrite the prior result", async () => {
      const first = makeStubResult({
        fileInfo: { name: "first.png", size: 8, type: "image/png" },
      });
      const second = makeStubResult({
        fileInfo: { name: "second.png", size: 8, type: "image/png" },
      });
      decodeImageInputMock.mockResolvedValueOnce(first);
      decodeImageInputMock.mockResolvedValueOnce(second);

      const { result } = renderHook(() => useImageInput());

      await act(async () => {
        await result.current.decode(makeStubFile("first.png"));
      });
      expect(result.current.fileInfo?.name).toBe("first.png");

      await act(async () => {
        await result.current.decode(makeStubFile("second.png"));
      });
      expect(result.current.fileInfo?.name).toBe("second.png");
      expect(decodeImageInputMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("select (file picker branch)", () => {
    it("decodes the selected file and returns its result", async () => {
      const stub = makeStubResult();
      const file = makeStubFile("picked.png");
      selectImageFileMock.mockResolvedValueOnce(file);
      decodeImageInputMock.mockResolvedValueOnce(stub);

      const { result } = renderHook(() => useImageInput());

      let returned: BrowserImageInputResult | undefined;
      await act(async () => {
        returned = await result.current.select({ accept: "image/png" });
      });

      expect(selectImageFileMock).toHaveBeenCalledWith({ accept: "image/png" });
      expect(decodeImageInputMock).toHaveBeenCalledWith(file, { accept: "image/png" });
      expect(returned).toBe(stub);
      expect(result.current.status).toBe("loaded");
    });

    it("returns undefined and stays idle when the picker is cancelled", async () => {
      selectImageFileMock.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useImageInput());

      let returned: BrowserImageInputResult | undefined = makeStubResult();
      await act(async () => {
        returned = await result.current.select();
      });

      expect(returned).toBeUndefined();
      expect(decodeImageInputMock).not.toHaveBeenCalled();
      expect(result.current.status).toBe("idle");
    });
  });

  describe("auto-decode via input prop", () => {
    it("auto-decodes when an input is provided", async () => {
      const stub = makeStubResult();
      decodeImageInputMock.mockResolvedValueOnce(stub);
      const file = makeStubFile();

      const { result } = renderHook(() => useImageInput({ input: file }));

      await waitFor(() => {
        expect(result.current.status).toBe("loaded");
      });
      expect(decodeImageInputMock).toHaveBeenCalledWith(file, expect.any(Object));
      expect(result.current.result).toBe(stub);
    });

    it("setting input to null resets the hook", async () => {
      const stub = makeStubResult();
      decodeImageInputMock.mockResolvedValueOnce(stub);
      const file = makeStubFile();

      const { result, rerender } = renderHook(
        ({ input }: { input: File | null }) => useImageInput({ input }),
        { initialProps: { input: file as File | null } },
      );

      await waitFor(() => {
        expect(result.current.status).toBe("loaded");
      });

      rerender({ input: null });

      expect(result.current.status).toBe("idle");
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears state back to idle/null after a successful decode", async () => {
      const stub = makeStubResult();
      decodeImageInputMock.mockResolvedValueOnce(stub);

      const { result } = renderHook(() => useImageInput());

      await act(async () => {
        await result.current.decode(makeStubFile());
      });
      expect(result.current.status).toBe("loaded");

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.image).toBeNull();
    });

    it("clears state back to idle after a failed decode", async () => {
      decodeImageInputMock.mockRejectedValueOnce(new Error("boom"));

      const { result } = renderHook(() => useImageInput());

      await act(async () => {
        await expect(result.current.decode(makeStubFile())).rejects.toThrow("boom");
      });
      expect(result.current.status).toBe("error");

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
    });
  });
});
