import { highlight } from "@/lib/highlight";
import { readExampleSource } from "@/lib/source";

import { PreviewCard, type PreviewView } from "./preview-card";

export async function ComponentPreview({ name, view }: { name: string; view?: PreviewView }) {
  const source = await readExampleSource(name);
  const html = await highlight(source, "tsx");
  return (
    <PreviewCard
      code={<div dangerouslySetInnerHTML={{ __html: html }} />}
      defaultView={view}
      name={name}
      source={source}
    />
  );
}
