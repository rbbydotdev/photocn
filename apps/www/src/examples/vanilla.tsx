"use client";

import { useEffect, useRef } from "react";
import { createPhoto } from "photocn/photo";

// Plain DOM: no React state, no components. Works the same in Vue, Svelte,
// a web component or a <script type="module">.
async function mountPhotoEditor(root: HTMLElement, signal: AbortSignal) {
  root.innerHTML = `
    <canvas class="aspect-[3/2] w-full rounded-lg bg-muted object-contain"></canvas>
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <label class="flex items-center gap-2">Exposure <input name="exposure" type="range" min="-1" max="1" step="0.01" value="0" /></label>
      <label class="flex items-center gap-2">Saturation <input name="saturation" type="range" min="-1" max="1" step="0.01" value="0" /></label>
      <button data-filter="juno" class="rounded-md border px-2.5 py-1">Juno</button>
      <button data-filter="moon" class="rounded-md border px-2.5 py-1">Moon</button>
      <button data-action="rotate" class="rounded-md border px-2.5 py-1">Rotate</button>
      <button data-action="undo" class="rounded-md border px-2.5 py-1">Undo</button>
      <button data-action="export" class="rounded-md border bg-primary px-2.5 py-1 text-primary-foreground">Export</button>
      <output class="text-muted-foreground"></output>
    </div>`;

  const canvas = root.querySelector("canvas")!;
  const inputs = root.querySelectorAll<HTMLInputElement>("input[type=range]");
  const output = root.querySelector("output")!;

  const photo = await createPhoto("/samples/street.jpg");
  if (signal.aborted) return photo.dispose();
  signal.addEventListener("abort", () => photo.dispose());
  photo.attach(canvas);

  inputs.forEach((input) =>
    input.addEventListener("input", () => photo.adjust({ [input.name]: Number(input.value) }), { signal }),
  );
  root.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    if (button.dataset.filter) photo.filter(button.dataset.filter);
    if (button.dataset.action === "rotate") photo.rotate(1);
    if (button.dataset.action === "undo") photo.undo();
    if (button.dataset.action === "export") {
      const { blob, width, height } = await photo.export({ format: "jpeg", width: 1200 });
      output.textContent = `${width}×${height}, ${Math.round(blob.size / 1024)} KB`;
    }
  }, { signal });
  // Keep the controls in sync after undo.
  photo.subscribe(() => {
    inputs[0]!.value = String(photo.params.lights.exposure);
    inputs[1]!.value = String(photo.params.colors.saturation);
  });
}

// Only this wrapper is React, to show the demo on this page.
export default function VanillaExample() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void mountPhotoEditor(ref.current!, controller.signal);
    return () => controller.abort();
  }, []);
  return <div className="flex flex-col gap-3" ref={ref} />;
}
