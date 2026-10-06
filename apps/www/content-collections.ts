import { readFile } from "node:fs/promises";
import path from "node:path";

import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX } from "@content-collections/mdx";
import rehypeShiki from "@shikijs/rehype";
import GithubSlugger from "github-slugger";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { z } from "zod";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://photocn.dev").replace(/\/$/, "");

/** Docs are written once in MDX; agents get the same page as plain markdown. */
async function toMarkdown(title: string, description: string, body: string) {
  let out = body;
  // <ComponentPreview name="x" /> → the example's source (what a user would copy).
  for (const match of body.matchAll(/<ComponentPreview\s+name="([^"]+)"[^>]*\/>/g)) {
    const file = path.join(process.cwd(), "src/examples", `${match[1]}.tsx`);
    const source = (await readFile(file, "utf8"))
      .replaceAll("@/registry/image-editor/", "@/components/image-editor/")
      .trim();
    out = out.replace(match[0], "```tsx\n" + source + "\n```");
  }
  // <InstallCommand item="x" /> → the CLI command.
  out = out.replace(
    /<InstallCommand\s+items?="([^"]+)"[^>]*\/>/g,
    (_, items: string) =>
      "```bash\nnpx shadcn@latest add " +
      items
        .split(/\s+/)
        .map((item) => `@photocn/${item}`)
        .join(" ") +
      "\n```",
  );
  // Videos → a link to the clip.
  out = out.replace(/<video[^>]*src="([^"]+)"[^>]*\/>/g, (_, src: string) => `[Video](${src})`);
  // Any other component tags are presentation only.
  out = out.replace(/^<\/?[A-Z][^>]*>\s*$/gm, "");
  return `# ${title}\n\n> ${description}\n\n${out.trim()}\n`.replaceAll("](/", `](${SITE}/`);
}

function tableOfContents(body: string) {
  const slugger = new GithubSlugger();
  const toc: { depth: number; title: string; id: string }[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    const heading = !inFence && /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      const title = heading[2].replace(/`/g, "").trim();
      toc.push({ depth: heading[1].length, title, id: slugger.slug(title) });
    }
  }
  return toc;
}

const docs = defineCollection({
  name: "docs",
  directory: "content/docs",
  include: "**/*.mdx",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    section: z.enum(["Basics", "Guides", "Components"]),
    order: z.number(),
    /** Registry item this page documents (Components). */
    item: z.string().optional(),
    content: z.string(),
  }),
  transform: async (doc, context) => {
    const slug = doc._meta.path === "index" ? "" : doc._meta.path;
    const mdx = await compileMDX(context, doc, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        rehypeSlug,
        [rehypeShiki, { themes: { light: "github-light", dark: "github-dark" }, defaultColor: false }],
      ],
    });
    return {
      ...doc,
      slug,
      url: slug ? `/docs/${slug}` : "/docs",
      mdx,
      markdown: await toMarkdown(doc.title, doc.description, doc.content),
      toc: tableOfContents(doc.content),
    };
  },
});

export default defineConfig({ collections: [docs] });
