import Link from "next/link";

import { ComponentPreview } from "@/components/site/component-preview";
import { InstallCommand } from "@/components/site/install-command";
import { Button } from "@/components/ui/button";
import { registryItemUrl } from "@/lib/site";

const layers = [
  {
    title: "Drop in the whole editor",
    body: "One command gives you the full editor: canvas, curves, filters, crop, blur, blend, EXIF and export. It uses your theme and your primitives.",
    code: "<ImageEditor src={file} />",
  },
  {
    title: "Snap the pieces together",
    body: "Every panel, button and canvas is a separate component that reads the nearest provider. Arrange them however you like.",
    code: "<ImageEditorProvider>\n  <ImageEditorCanvas />\n  <ImageEditorFilters />\n</ImageEditorProvider>",
  },
  {
    title: "Go fully headless",
    body: "useImageEditor() exposes params, history, crop, filters and export. Build any UI you want on top of it.",
    code: "const editor = useImageEditor()\neditor.filters.select(\"juno\")",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-20 px-4 pt-16 pb-24 sm:px-6">
      <section className="flex flex-col items-start gap-6">
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          GPU photo editing for shadcn/ui
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          A photo editor you own, one component at a time.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
          photocn is a WebGL photo editor distributed the shadcn way. Install the complete
          editor with one command, or pick the pieces you need and compose them like Lego.
          Rendering runs off the main thread, so sliders stay smooth on 24-megapixel photos.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/docs/installation">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/docs/composition">Compose your own</Link>
          </Button>
        </div>
        <InstallCommand className="w-full max-w-2xl" items={registryItemUrl("image-editor")} />
      </section>

      <section className="flex flex-col gap-4">
        <ComponentPreview name="full-editor" />
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {layers.map((layer) => (
          <div className="flex flex-col gap-3 rounded-xl border p-5" key={layer.title}>
            <h2 className="font-semibold">{layer.title}</h2>
            <p className="text-sm text-muted-foreground text-pretty">{layer.body}</p>
            <pre className="mt-auto overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">{layer.code}</pre>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Build a different editor with the same parts</h2>
          <p className="text-muted-foreground text-pretty">
            This phone-style filter picker is the canvas component plus a dozen lines of your own
            JSX on top of <code className="font-mono text-foreground">useImageEditor()</code>.
          </p>
          <Button asChild className="self-start" variant="outline">
            <Link href="/docs/composition">See more compositions</Link>
          </Button>
        </div>
        <ComponentPreview name="filter-strip" />
      </section>
    </main>
  );
}
