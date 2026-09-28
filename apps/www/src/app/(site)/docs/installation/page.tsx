import { CodeBlock } from "@/components/site/code-block";
import { InstallCommand } from "@/components/site/install-command";
import { DocsPage, P, Section } from "@/components/site/prose";
import { registryItemUrl, siteUrl } from "@/lib/site";

export const metadata = { title: "Installation" };

export default function InstallationPage() {
  return (
    <DocsPage description="Add photocn to any React project that uses shadcn/ui." title="Installation">
      <Section title="1. Set up shadcn/ui">
        <P>
          The components use the Radix flavor of shadcn/ui (<code>asChild</code>, Radix slider and
          select APIs). New projects default to Base UI, so pick Radix when you initialize:
        </P>
        <CodeBlock code="pnpm dlx shadcn@latest init -b radix" lang="bash" />
      </Section>
      <Section title="2. Add the editor">
        <P>
          This installs the <code>photocn</code> engine from npm, the shadcn primitives the editor uses,
          and the editor components into <code>components/image-editor/</code>.
        </P>
        <InstallCommand items={registryItemUrl("image-editor")} />
        <P>
          To use a short name like <code>@photocn/image-editor</code>, add the registry to your{" "}
          <code>components.json</code>:
        </P>
        <CodeBlock
          code={JSON.stringify({ registries: { "@photocn": `${siteUrl}/r/{name}.json` } }, null, 2)}
          lang="json"
          title="components.json"
        />
      </Section>
      <Section title="3. Use it">
        <CodeBlock
          code={`import { ImageEditor } from "@/components/image-editor/image-editor";

export default function Page() {
  return <ImageEditor className="h-dvh" src="/photo.jpg" />;
}`}
          title="app/page.tsx"
        />
        <P>
          The editor is a client component. <code>src</code> accepts a URL, <code>File</code>,{" "}
          <code>Blob</code>, <code>ArrayBuffer</code> or an <code>{"<img>"}</code>. Remote URLs must allow
          CORS.
        </P>
      </Section>
      <Section title="Only need some pieces?">
        <P>Every piece is its own item. Install just the ones you use:</P>
        <InstallCommand
          items={["image-editor-canvas", "image-editor-filters", "image-editor-export"].map(registryItemUrl)}
        />
      </Section>
      <Section title="Content-Security-Policy">
        <P>
          The render worker is inlined and started from a <code>blob:</code> URL, so it needs no
          bundler setup. If your CSP forbids <code>worker-src blob:</code>, spawn the worker file
          yourself:
        </P>
        <CodeBlock
          code={`<ImageEditor
  src={src}
  spawnWorker={() =>
    new Worker(new URL("photocn/worker/entry", import.meta.url), { type: "module" })
  }
/>`}
        />
      </Section>
    </DocsPage>
  );
}
