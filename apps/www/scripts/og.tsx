// Renders every social / README image with Takumi from the committed
// screenshots (public/assets/*.jpg, refreshed by `pnpm assets`):
//   public/banner.png      README banner (1280×640 @2x)
//   public/og.png          site OpenGraph image (1200×630)
//   public/og/docs/*.png   one per docs page (title + description)
// Runs on every build, so titles and copy never go stale.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { render } from "takumi-js";

import { Banner, DocOg } from "../src/og/templates";

const root = path.join(import.meta.dirname, "..");
const pub = (...parts: string[]) => path.join(root, "public", ...parts);

async function dataUri(file: string) {
  const type = file.endsWith(".png") ? "png" : "jpeg";
  return `data:image/${type};base64,${(await readFile(file)).toString("base64")}`;
}

async function fonts() {
  const dir = path.join(root, "node_modules/geist/dist/fonts");
  const load = async (folder: string, file: string, name: string, weight: number) => ({
    name,
    weight,
    data: await readFile(path.join(dir, folder, file)),
  });
  return Promise.all([
    load("geist-sans", "Geist-Regular.ttf", "Geist", 400),
    load("geist-sans", "Geist-Medium.ttf", "Geist", 500),
    load("geist-sans", "Geist-Bold.ttf", "Geist", 700),
    load("geist-mono", "GeistMono-Regular.ttf", "Geist Mono", 400),
  ]);
}

async function main() {
  const screenshot = await dataUri(pub("assets", "editor-dark.jpg"));
  const fontList = await fonts();

  await writeFile(
    pub("banner.png"),
    // Laid out at 1280×640, rendered at 2× for sharp text on retina screens.
    await render(<Banner screenshot={screenshot} />, { width: 2560, height: 1280, devicePixelRatio: 2, format: "png", fonts: fontList }),
  );
  await writeFile(
    pub("og.png"),
    await render(<Banner height={630} screenshot={screenshot} width={1200} />, { width: 1200, height: 630, format: "png", fonts: fontList }),
  );

  // Docs pages: read the MDX frontmatter directly (no build step needed).
  await mkdir(pub("og", "docs"), { recursive: true });
  const dir = path.join(root, "content/docs");
  let count = 0;
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".mdx")) continue;
    const source = await readFile(path.join(dir, file), "utf8");
    const field = (name: string) => source.match(new RegExp(`^${name}:\\s*"(.*)"\\s*$`, "m"))?.[1] ?? "";
    const slug = file.replace(/\.mdx$/, "");
    const png = await render(
      <DocOg
        description={field("description")}
        item={field("item") || undefined}
        section={field("section")}
        title={field("title")}
      />,
      { width: 1200, height: 630, format: "png", fonts: fontList },
    );
    await writeFile(pub("og", "docs", `${slug}.png`), png);
    count++;
  }
  console.log(`og: banner.png, og.png and ${count} docs images`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
