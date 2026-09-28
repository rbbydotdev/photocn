import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/** What a consumer's copy looks like after `shadcn add`. */
export function toConsumerImports(source: string) {
  return source
    .replaceAll("@/registry/image-editor/", "@/components/image-editor/")
    .replace(/^"use client";\n\n/, '"use client";\n\n');
}

export async function readExampleSource(name: string) {
  const file = path.join(process.cwd(), "src/examples", `${name}.tsx`);
  return toConsumerImports(await readFile(file, "utf8")).trim();
}
