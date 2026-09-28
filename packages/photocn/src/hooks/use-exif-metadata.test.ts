import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The browser package barrel pulls in mini-exif/mini-gl which require browser
// runtime support that happy-dom does not provide. Mock the surface the hook
// touches; tests drive behaviour through these mocks.
vi.mock("../dom", () => ({
  createExifHandle: vi.fn(),
  readExifMetadata: vi.fn(),
}));

import {
  createExifHandle,
  readExifMetadata,
  type BrowserExifHandle,
  type ExifMetadata,
} from "../dom";

import { useExifMetadata } from "./use-exif-metadata";

const createExifHandleMock = vi.mocked(createExifHandle);
const readExifMetadataMock = vi.mocked(readExifMetadata);

function makeHandle(buffer = new ArrayBuffer(8)): BrowserExifHandle {
  return { arrayBuffer: buffer } as BrowserExifHandle;
}

function makeMetadata(
  overrides: Partial<ExifMetadata> = {},
): ExifMetadata {
  return {
    format: "JPG",
    tiff: { Make: { value: "Canon" } },
    ...overrides,
  };
}

beforeEach(() => {
  createExifHandleMock.mockReset();
  readExifMetadataMock.mockReset();
});

describe("useExifMetadata", () => {
  describe("initial state", () => {
    it("starts idle with no metadata, no handle, no error, isLoading=false", () => {
      const { result } = renderHook(() => useExifMetadata());

      expect(result.current.status).toBe("idle");
      expect(result.current.metadata).toBeUndefined();
      expect(result.current.handle).toBeUndefined();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(typeof result.current.read).toBe("function");
      expect(typeof result.current.reset).toBe("function");
    });

    it("does not call the parser when no source is supplied", () => {
      renderHook(() => useExifMetadata());
      expect(createExifHandleMock).not.toHaveBeenCalled();
      expect(readExifMetadataMock).not.toHaveBeenCalled();
    });
  });

  describe("read (manual)", () => {
    it("creates a handle from an ArrayBuffer source and surfaces the metadata", async () => {
      const buffer = new ArrayBuffer(16);
      const handle = makeHandle(buffer);
      const metadata = makeMetadata();
      createExifHandleMock.mockReturnValueOnce(handle);
      readExifMetadataMock.mockReturnValueOnce(metadata);

      const onRead = vi.fn();
      const { result } = renderHook(() => useExifMetadata({ onRead }));

      let returned: ExifMetadata | undefined;
      await act(async () => {
        returned = await result.current.read(buffer);
      });

      expect(createExifHandleMock).toHaveBeenCalledWith(
        buffer,
        expect.any(Object),
      );
      expect(readExifMetadataMock).toHaveBeenCalledWith(handle);
      expect(returned).toBe(metadata);
      expect(result.current.status).toBe("loaded");
      expect(result.current.metadata).toBe(metadata);
      expect(result.current.handle).toBe(handle);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(onRead).toHaveBeenCalledWith(metadata, handle);
    });

    it("forwards a passed-in BrowserExifHandle without re-creating it", async () => {
      const handle = makeHandle();
      const metadata = makeMetadata();
      readExifMetadataMock.mockReturnValueOnce(metadata);

      const { result } = renderHook(() => useExifMetadata());

      await act(async () => {
        await result.current.read(handle);
      });

      expect(createExifHandleMock).not.toHaveBeenCalled();
      expect(readExifMetadataMock).toHaveBeenCalledWith(handle);
      expect(result.current.handle).toBe(handle);
      expect(result.current.metadata).toBe(metadata);
    });

    it("propagates the quicktime option through to createExifHandle", async () => {
      const buffer = new ArrayBuffer(8);
      const handle = makeHandle(buffer);
      createExifHandleMock.mockReturnValueOnce(handle);
      readExifMetadataMock.mockReturnValueOnce(makeMetadata());

      const { result } = renderHook(() => useExifMetadata({ quicktime: true }));

      await act(async () => {
        await result.current.read(buffer);
      });

      expect(createExifHandleMock).toHaveBeenCalledWith(buffer, {
        quicktime: true,
      });
    });

    it("per-call options override hook defaults", async () => {
      const buffer = new ArrayBuffer(8);
      const handle = makeHandle(buffer);
      createExifHandleMock.mockReturnValue(handle);
      readExifMetadataMock.mockReturnValue(makeMetadata());

      const { result } = renderHook(() => useExifMetadata({ quicktime: false }));

      await act(async () => {
        await result.current.read(buffer, { quicktime: true });
      });

      expect(createExifHandleMock).toHaveBeenLastCalledWith(buffer, {
        quicktime: true,
      });
    });

    it("flips isLoading true during the read and back to false on settle", async () => {
      const buffer = new ArrayBuffer(8);
      const handle = makeHandle(buffer);
      createExifHandleMock.mockReturnValueOnce(handle);
      readExifMetadataMock.mockReturnValueOnce(makeMetadata());

      const { result } = renderHook(() => useExifMetadata());

      const beforeLoading = result.current.isLoading;
      expect(beforeLoading).toBe(false);

      await act(async () => {
        const promise = result.current.read(buffer);
        // Status flips to loading synchronously inside the same act batch.
        await promise;
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.status).toBe("loaded");
    });
  });

  describe("error path", () => {
    it("sets status to 'error' and surfaces the thrown value, isLoading=false", async () => {
      const failure = new Error("parse failed");
      readExifMetadataMock.mockImplementationOnce(() => {
        throw failure;
      });
      createExifHandleMock.mockReturnValueOnce(makeHandle());

      const onError = vi.fn();
      const { result } = renderHook(() => useExifMetadata({ onError }));

      let caught: unknown;
      await act(async () => {
        try {
          await result.current.read(new ArrayBuffer(4));
        } catch (error) {
          caught = error;
        }
      });

      expect(caught).toBe(failure);
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe(failure);
      expect(result.current.isLoading).toBe(false);
      expect(onError).toHaveBeenCalledWith(failure);
    });

    it("a successful read after an error clears the error state", async () => {
      const failure = new Error("first fail");
      readExifMetadataMock.mockImplementationOnce(() => {
        throw failure;
      });
      createExifHandleMock.mockReturnValueOnce(makeHandle());

      const { result } = renderHook(() => useExifMetadata());

      await act(async () => {
        try {
          await result.current.read(new ArrayBuffer(4));
        } catch {
          // swallow — asserted below
        }
      });
      expect(result.current.status).toBe("error");

      const handle = makeHandle();
      const metadata = makeMetadata();
      createExifHandleMock.mockReturnValueOnce(handle);
      readExifMetadataMock.mockReturnValueOnce(metadata);

      await act(async () => {
        await result.current.read(new ArrayBuffer(8));
      });

      expect(result.current.status).toBe("loaded");
      expect(result.current.error).toBeNull();
      expect(result.current.metadata).toBe(metadata);
    });
  });

  describe("multiple sequential reads", () => {
    it("reflects only the latest result and does not leak loading state", async () => {
      const firstHandle = makeHandle(new ArrayBuffer(4));
      const secondHandle = makeHandle(new ArrayBuffer(8));
      const firstMeta = makeMetadata({ format: "JPG" });
      const secondMeta = makeMetadata({ format: "PNG" });

      createExifHandleMock
        .mockReturnValueOnce(firstHandle)
        .mockReturnValueOnce(secondHandle);
      readExifMetadataMock
        .mockReturnValueOnce(firstMeta)
        .mockReturnValueOnce(secondMeta);

      const { result } = renderHook(() => useExifMetadata());

      await act(async () => {
        await result.current.read(new ArrayBuffer(4));
      });
      expect(result.current.metadata).toBe(firstMeta);
      expect(result.current.handle).toBe(firstHandle);
      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        await result.current.read(new ArrayBuffer(8));
      });
      expect(result.current.metadata).toBe(secondMeta);
      expect(result.current.handle).toBe(secondHandle);
      expect(result.current.isLoading).toBe(false);
      expect(readExifMetadataMock).toHaveBeenCalledTimes(2);
    });

    it("a stale in-flight read is dropped when superseded by a newer one", async () => {
      // First read: control completion via a deferred promise on read invocation.
      const firstHandle = makeHandle(new ArrayBuffer(4));
      const secondHandle = makeHandle(new ArrayBuffer(8));
      const firstMeta = makeMetadata({ format: "JPG" });
      const secondMeta = makeMetadata({ format: "PNG" });

      createExifHandleMock
        .mockReturnValueOnce(firstHandle)
        .mockReturnValueOnce(secondHandle);

      // The hook calls readExifMetadata synchronously — to simulate a slow read,
      // gate the first call via a Promise the test can release later.
      let releaseFirst: (value: ExifMetadata) => void = () => {};
      const firstReadGate = new Promise<ExifMetadata>((resolve) => {
        releaseFirst = resolve;
      });
      readExifMetadataMock.mockImplementationOnce(
        () => firstReadGate as unknown as ExifMetadata,
      );
      readExifMetadataMock.mockReturnValueOnce(secondMeta);

      const { result } = renderHook(() => useExifMetadata());

      // Kick off the slow first read but don't await it yet.
      let firstPromise: Promise<ExifMetadata | undefined> | undefined;
      act(() => {
        firstPromise = result.current.read(new ArrayBuffer(4));
      });

      // Start (and complete) the second read while the first is still pending.
      await act(async () => {
        await result.current.read(new ArrayBuffer(8));
      });
      expect(result.current.metadata).toBe(secondMeta);

      // Release the first read; its result must NOT clobber the second.
      await act(async () => {
        releaseFirst(firstMeta);
        await firstPromise;
      });

      expect(result.current.metadata).toBe(secondMeta);
      expect(result.current.handle).toBe(secondHandle);
      expect(result.current.status).toBe("loaded");
    });
  });

  describe("autoRead via source prop", () => {
    it("auto-reads when a source prop is provided", async () => {
      const handle = makeHandle();
      const metadata = makeMetadata();
      createExifHandleMock.mockReturnValueOnce(handle);
      readExifMetadataMock.mockReturnValueOnce(metadata);

      const buffer = new ArrayBuffer(8);
      const { result } = renderHook(() => useExifMetadata({ source: buffer }));

      await waitFor(() => {
        expect(result.current.status).toBe("loaded");
      });
      expect(createExifHandleMock).toHaveBeenCalledWith(
        buffer,
        expect.any(Object),
      );
      expect(result.current.metadata).toBe(metadata);
    });

    it("setting source to null resets the hook", async () => {
      const handle = makeHandle();
      const metadata = makeMetadata();
      createExifHandleMock.mockReturnValueOnce(handle);
      readExifMetadataMock.mockReturnValueOnce(metadata);

      const buffer = new ArrayBuffer(8);
      const { result, rerender } = renderHook(
        ({ source }: { source: ArrayBuffer | null }) =>
          useExifMetadata({ source }),
        { initialProps: { source: buffer as ArrayBuffer | null } },
      );

      await waitFor(() => {
        expect(result.current.status).toBe("loaded");
      });

      rerender({ source: null });

      expect(result.current.status).toBe("idle");
      expect(result.current.metadata).toBeUndefined();
      expect(result.current.handle).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it("autoRead=false suppresses the automatic parse even when source is set", async () => {
      const buffer = new ArrayBuffer(8);
      renderHook(() => useExifMetadata({ source: buffer, autoRead: false }));

      // Yield twice to flush any deferred effects.
      await Promise.resolve();
      await Promise.resolve();

      expect(createExifHandleMock).not.toHaveBeenCalled();
      expect(readExifMetadataMock).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("clears metadata, handle, status, and error", async () => {
      const handle = makeHandle();
      const metadata = makeMetadata();
      createExifHandleMock.mockReturnValueOnce(handle);
      readExifMetadataMock.mockReturnValueOnce(metadata);

      const { result } = renderHook(() => useExifMetadata());

      await act(async () => {
        await result.current.read(new ArrayBuffer(8));
      });
      expect(result.current.status).toBe("loaded");
      expect(result.current.metadata).toBe(metadata);

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.metadata).toBeUndefined();
      expect(result.current.handle).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it("reset() during an in-flight read drops its result on the floor", async () => {
      let releaseRead: (value: ExifMetadata) => void = () => {};
      const gate = new Promise<ExifMetadata>((resolve) => {
        releaseRead = resolve;
      });
      createExifHandleMock.mockReturnValueOnce(makeHandle());
      readExifMetadataMock.mockImplementationOnce(
        () => gate as unknown as ExifMetadata,
      );

      const { result } = renderHook(() => useExifMetadata());

      let pending: Promise<ExifMetadata | undefined> | undefined;
      act(() => {
        pending = result.current.read(new ArrayBuffer(4));
      });

      act(() => {
        result.current.reset();
      });
      expect(result.current.status).toBe("idle");

      await act(async () => {
        releaseRead(makeMetadata());
        await pending;
      });

      // Reset incremented the requestId so the resolved read must not commit state.
      expect(result.current.status).toBe("idle");
      expect(result.current.metadata).toBeUndefined();
    });
  });
});
