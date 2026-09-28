import { readExampleSource } from "@/lib/source";

import { CodeBlock } from "./code-block";
import { PreviewTabs } from "./preview-tabs";

export async function ComponentPreview({ name }: { name: string }) {
  const source = await readExampleSource(name);
  return <PreviewTabs code={<CodeBlock code={source} />} name={name} />;
}
