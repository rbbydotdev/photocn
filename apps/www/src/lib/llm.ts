import "server-only";

import registry from "../../registry.json";

import { blocks } from "./blocks";
import { docs } from "./docs";
import { siteUrl } from "./site";

type RegistryItem = (typeof registry.items)[number];

const install = (name: string) => `npx shadcn@latest add @photocn/${name}`;

export const markdownUrl = (url: string) => `${siteUrl}${url}.md`;

/** /llms.txt — llmstxt.org format. */
export function llmsIndex() {
  const section = (title: string) => docs.filter((doc) => doc.section === title);
  const link = (doc: (typeof docs)[number]) => `- [${doc.title}](${markdownUrl(doc.url)}): ${doc.description}`;
  return `# photocn

> Photo editor components for React, installed with the shadcn CLI. Use the full editor, compose the pieces, or use the headless useImageEditor hook. WebGL rendering in a worker, non-destructive crop and transform, filters, curves, EXIF-preserving export.

Website: ${siteUrl}
Registry: ${siteUrl}/r/registry.json (items at ${siteUrl}/r/{name}.json)

## Install

\`\`\`bash
npx shadcn@latest init -b radix
npx shadcn@latest registry add @photocn=${siteUrl}/r/{name}.json
${install("image-editor")}
\`\`\`

\`\`\`tsx
import { ImageEditor } from "@/components/image-editor/image-editor";

export default function Page() {
  return <ImageEditor className="h-dvh" src="/photo.jpg" />;
}
\`\`\`

The editor is a client component. Files install into components/image-editor/; the engine is the \`photocn\` npm package (\`photocn/react\` for the hooks, \`photocn/photo\` for \`createPhoto()\` without React).

## Docs

${[...section("Basics"), ...section("Guides")].map(link).join("\n")}

## Components

${section("Components").map(link).join("\n")}

## Blocks

${blocks.map((block) => `- [${block.title}](${siteUrl}/llm/${block.name}): ${block.description} Install: \`${install(block.name)}\``).join("\n")}

## Optional

- [All docs in one file](${siteUrl}/llms-full.txt)
- [Registry index](${siteUrl}/r/registry.json)
- [Source on GitHub](https://github.com/rbbydotdev/photocn)
`;
}

/** /llms-full.txt — every docs page, in sidebar order. */
export function llmsFull() {
  return docs.map((doc) => doc.markdown).join("\n\n---\n\n");
}

/** /llm/<item> — one registry item. */
export function registryItemMarkdown(item: RegistryItem) {
  const doc = docs.find((d) => d.item === item.name);
  const lines = [
    `# ${item.title}`,
    "",
    `> ${item.description}`,
    "",
    `- Type: ${item.type}`,
    `- Registry JSON: ${siteUrl}/r/${item.name}.json`,
    doc ? `- Docs: ${markdownUrl(doc.url)}` : null,
    "",
    "## Install",
    "",
    "```bash",
    install(item.name),
    "```",
    "",
    "## Dependencies",
    "",
    ...(item.dependencies.length ? item.dependencies.map((d) => `- ${d}`) : ["- none"]),
    "",
    "## Registry dependencies",
    "",
    ...(item.registryDependencies.length
      ? item.registryDependencies.map((d) => `- ${d.replace(`${siteUrl}/r/`, "@photocn/").replace(/\.json$/, "")}`)
      : ["- none"]),
    "",
    "## Files",
    "",
    ...item.files.map((file) => `- ${file.target}`),
  ];
  return lines.filter((line) => line !== null).join("\n") + "\n";
}

export const registryItems = registry.items;
