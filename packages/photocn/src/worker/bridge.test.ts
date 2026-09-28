import { describe, expect, it } from "vitest";

import { createWorkerEditor } from "./bridge";
import type { WorkerRequest, WorkerResponse } from "./protocol";

class FakeWorker implements Pick<Worker, "addEventListener" | "removeEventListener" | "postMessage" | "terminate"> {
  messages: WorkerRequest[] = [];
  private listeners = new Set<(event: MessageEvent<WorkerResponse>) => void>();

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void,
  ): void {
    this.listeners.delete(listener);
  }

  postMessage(message: WorkerRequest): void {
    this.messages.push(message);
    if (message.type !== "init") return;

    const response: WorkerResponse = {
      type: "ok",
      reqId: message.reqId,
      size: { width: message.image.width, height: message.image.height },
    };
    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener({ data: response } as MessageEvent<WorkerResponse>);
      }
    });
  }

  terminate(): void {}
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    transferControlToOffscreen: () => OffscreenCanvas;
  };
  canvas.transferControlToOffscreen = () => ({}) as OffscreenCanvas;
  return canvas;
}

function createImage(width = 12, height = 8): ImageBitmap {
  return { width, height } as ImageBitmap;
}

describe("createWorkerEditor", () => {
  it("passes the requested display-p3 color space to worker init", async () => {
    const worker = new FakeWorker();

    await createWorkerEditor({
      worker: worker as unknown as Worker,
      canvas: createCanvas(),
      image: createImage(),
      colorspace: "display-p3",
    });

    expect(worker.messages.find((message) => message.type === "init")).toEqual(
      expect.objectContaining({
        type: "init",
        colorspace: "display-p3",
      }),
    );
  });
});
