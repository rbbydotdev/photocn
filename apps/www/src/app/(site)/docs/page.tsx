import Link from "next/link";

import { DocsPage, P, Section } from "@/components/site/prose";

export const metadata = { title: "Introduction" };

export default function IntroductionPage() {
  return (
    <DocsPage
      description="A WebGL photo editor for React, distributed as shadcn/ui components you own."
      title="Introduction"
    >
      <Section>
        <P>
          photocn has two parts. The <code>photocn</code> npm package is the engine: WebGL
          filters, a render worker, EXIF reading and writing, edit history, and a headless
          React controller. The registry holds the UI: shadcn-styled components that the
          shadcn CLI copies into your project. The engine gets updates from npm, and the UI
          stays yours to edit.
        </P>
      </Section>
      <Section title="Three ways to use it">
        <ul className="flex flex-col gap-3 text-muted-foreground">
          <li>
            <strong className="text-foreground">The full editor.</strong> <code className="font-mono text-sm">{"<ImageEditor />"}</code> is
            the complete app: toolbar, canvas, tool switcher, histogram and every panel.{" "}
            <Link className="underline underline-offset-4" href="/docs/editor">Guide →</Link>
          </li>
          <li>
            <strong className="text-foreground">Lego pieces.</strong> Each panel and control is its own registry item
            and reads the nearest <code className="font-mono text-sm">{"<ImageEditorProvider>"}</code>.{" "}
            <Link className="underline underline-offset-4" href="/docs/composition">Guide →</Link>
          </li>
          <li>
            <strong className="text-foreground">Headless.</strong> <code className="font-mono text-sm">useImageEditorState()</code> plus
            a canvas, and nothing else.{" "}
            <Link className="underline underline-offset-4" href="/docs/headless">Guide →</Link>
          </li>
        </ul>
      </Section>
      <Section title="What's inside">
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {[
            "Light, color and effect adjustments",
            "RGB and per-channel curves over a live histogram",
            "13 filter presets (3D LUTs and color matrices)",
            "Crop, aspect ratios, rotate, flip, perspective, resize",
            "Bokeh and gaussian lens blur with a focus point",
            "Blend a second image",
            "Undo/redo with slider drags merged into one step",
            "Hold to compare with the original",
            "Rendering in a Web Worker on an OffscreenCanvas",
            "Display-P3 aware; PNG, JPEG (with EXIF) and WebP export",
            "Recipes: save a look as JSON and re-apply it",
            "Cmd+K command menu",
          ].map((feature) => (
            <li className="rounded-lg border px-3 py-2" key={feature}>{feature}</li>
          ))}
        </ul>
      </Section>
    </DocsPage>
  );
}
