import type { Metadata } from "next";

import { BlockPreview } from "@/components/site/block-preview";
import { blocks } from "@/lib/blocks";
import { highlight } from "@/lib/highlight";
import { readBlockSource } from "@/lib/source";

export const metadata: Metadata = {
  title: "Blocks",
  description: "Ready-made photo editors. Preview them, then add one with a single command.",
};

export default async function BlocksPage() {
  const sources = await Promise.all(
    blocks.map(async (block) => highlight(await readBlockSource(block.file), "tsx")),
  );
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-16 px-4 pt-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Blocks</h1>
        <p className="max-w-2xl text-muted-foreground">
          Ready-made photo editors. Preview them, then add one to your app with a single command.
        </p>
        <div className="mt-2 flex max-w-2xl flex-col gap-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <p>
            Until <code className="font-mono">@photocn</code> is listed in the shadcn registry directory, add it to your{" "}
            <code className="font-mono">components.json</code> once:
          </p>
          <pre className="overflow-x-auto rounded-md bg-background p-3 font-mono text-xs">{`{
  "registries": {
    "@photocn": "https://photocn.dev/r/{name}.json"
  }
}`}</pre>
          <p className="text-muted-foreground">
            Or run <code className="font-mono">pnpm dlx shadcn@latest registry add @photocn=https://photocn.dev/r/{"{name}"}.json</code>.
          </p>
        </div>
      </header>
      {blocks.map((block, index) => (
        <BlockPreview
          code={<div dangerouslySetInnerHTML={{ __html: sources[index] }} />}
          description={block.description}
          height={block.height}
          key={block.name}
          mobile={"mobile" in block && block.mobile}
          name={block.name}
          title={block.title}
        />
      ))}
    </main>
  );
}
