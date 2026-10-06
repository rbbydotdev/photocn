import { highlight } from "@/lib/highlight";
import { readExampleSource } from "@/lib/source";

import { PreviewCard } from "./preview-card";

export async function ComponentPreview({ name }: { name: string }) {
  const source = await readExampleSource(name);
  const html = await highlight(source, "tsx");
  return (
    <PreviewCard code={<div dangerouslySetInnerHTML={{ __html: html }} />} name={name} source={source} />
  );
}
