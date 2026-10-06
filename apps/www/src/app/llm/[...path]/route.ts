import { notFound } from "next/navigation";

import { docs } from "@/lib/docs";
import { registryItemMarkdown, registryItems } from "@/lib/llm";

export const dynamic = "force-static";
export const dynamicParams = false;

/**
 * Markdown twins, written as files so the static host serves them directly:
 *   /llm/docs.md, /llm/docs/<page>.md  — docs pages (/docs/<page>.md maps here)
 *   /llm/<item>.md                     — registry items (/llm/<item> maps here)
 */
export function generateStaticParams() {
  return [
    ...docs.map((doc) => ({ path: doc.slug ? ["docs", ...doc.slug.split("/").slice(0, -1), `${doc.slug.split("/").at(-1)}.md`] : ["docs.md"] })),
    ...registryItems.map((item) => ({ path: [`${item.name}.md`] })),
  ];
}

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const joined = parts.join("/").replace(/\.md$/, "");
  const doc = joined === "docs" ? docs.find((d) => d.slug === "") : docs.find((d) => `docs/${d.slug}` === joined);
  const body = doc
    ? doc.markdown
    : (() => {
        const item = registryItems.find((i) => i.name === joined);
        return item ? registryItemMarkdown(item) : null;
      })();
  if (!body) notFound();
  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
