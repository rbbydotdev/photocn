// End-to-end install test: what a user does, in a brand-new app.
//
//   pnpm --filter www test:install
//
// 1. Packs the photocn engine and builds the registry against a local server.
// 2. Creates a fresh Next.js app, runs `shadcn init -b radix`, registers
//    @photocn, and `shadcn add`s every block.
// 3. Renders each block on its own page, then typechecks, builds, and loads
//    every page in a browser (WebGL canvas must render, no runtime errors).
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const www = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.join(www, "../..");
const PORT = 8799;
const APP_PORT = 3999;
const REGISTRY = `http://localhost:${PORT}`;
const keep = process.argv.includes("--keep");

const run = (cmd, cwd, env = {}) => {
  console.log(`\n$ ${cmd}  (${path.relative(repo, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
};

const blocks = [...readFileSync(path.join(www, "src/lib/blocks.ts"), "utf8").matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);
const work = mkdtempSync(path.join(tmpdir(), "photocn-install-"));
console.log(`Testing ${blocks.length} blocks in ${work}`);

const servers = [];
const stop = () => servers.forEach((server) => server.kill("SIGTERM"));
process.on("exit", stop);

try {
  // 1. Engine tarball + registry pointing at the local server.
  run("pnpm --filter photocn build", repo);
  run(`pnpm pack --pack-destination ${work}`, path.join(repo, "packages/photocn"));
  const { version } = JSON.parse(readFileSync(path.join(repo, "packages/photocn/package.json"), "utf8"));
  const tarball = path.join(work, `photocn-${version}.tgz`);
  run("pnpm build", www, { NEXT_PUBLIC_SITE_URL: REGISTRY, PHOTOCN_SPEC: `photocn@file:${tarball}` });
  const registry = spawn("pnpm", ["exec", "wrangler", "dev", "--port", String(PORT), "--local"], { cwd: www, stdio: "ignore" });
  servers.push(registry);
  await waitFor(`${REGISTRY}/r/registry.json`);

  // 2. A fresh app, set up the way the docs say.
  run(
    "pnpm create next-app@latest app --ts --tailwind --eslint --app --src-dir --import-alias '@/*' --use-pnpm --turbopack --no-git --yes",
    work,
  );
  const app = path.join(work, "app");
  rmSync(path.join(app, "pnpm-workspace.yaml"), { force: true });
  const pkg = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
  // Until photocn is on npm, any reinstall must resolve it to the tarball.
  pkg.pnpm = { overrides: { photocn: `file:${tarball}` }, onlyBuiltDependencies: ["sharp", "unrs-resolver", "@tailwindcss/oxide"] };
  writeFileSync(path.join(app, "package.json"), JSON.stringify(pkg, null, 2));
  run("pnpm install", app);
  run("pnpm dlx shadcn@latest init -b radix -p nova -y --no-monorepo", app);
  run(`pnpm dlx shadcn@latest registry add @photocn=${REGISTRY}/r/{name}.json`, app);
  run(`pnpm dlx shadcn@latest add -y ${blocks.map((b) => `@photocn/${b}`).join(" ")}`, app);

  // 3. One page per block, using its public props.
  mkdirSync(path.join(app, "public"), { recursive: true });
  for (const sample of ["dog.jpg", "street.jpg", "portrait.jpg"]) {
    writeFileSync(path.join(app, "public", sample), readFileSync(path.join(www, "public/samples", sample)));
  }
  const pages = {
    editor: `import { EditorBlock } from "@/components/blocks/editor";\nexport default function Page() { return <EditorBlock src="/dog.jpg" />; }`,
    "editor-minimal": `import { EditorMinimalBlock } from "@/components/blocks/editor-minimal";\nexport default function Page() { return <EditorMinimalBlock src="/street.jpg" />; }`,
    "editor-mobile": `import { EditorMobileBlock } from "@/components/blocks/editor-mobile";\nexport default function Page() { return <EditorMobileBlock src="/portrait.jpg" />; }`,
    "avatar-cropper": `import { AvatarCropper } from "@/components/blocks/avatar-cropper";\nexport default function Page() { return <AvatarCropper defaultSrc="/portrait.jpg" />; }`,
    "upload-editor": `import { UploadEditor } from "@/components/blocks/upload-editor";\nexport default function Page() { return <UploadEditor />; }`,
    "filter-picker": `import { FilterPicker } from "@/components/blocks/filter-picker";\nexport default function Page() { return <FilterPicker src="/dog.jpg" />; }`,
    "before-after": `import { BeforeAfter } from "@/components/blocks/before-after";\nexport default function Page() { return <BeforeAfter src="/street.jpg" />; }`,
    "batch-looks": `import { BatchLooks } from "@/components/blocks/batch-looks";\nexport default function Page() { return <BatchLooks photos={["/dog.jpg", "/street.jpg", "/portrait.jpg"]} />; }`,
  };
  for (const name of blocks) {
    if (!pages[name]) throw new Error(`No test page for block "${name}"`);
    const dir = path.join(app, "src/app", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "page.tsx"), `"use client";\n${pages[name]}\n`);
  }

  run("pnpm exec tsc --noEmit", app);
  run("pnpm exec next build", app);

  const server = spawn("pnpm", ["exec", "next", "start", "--port", String(APP_PORT)], { cwd: app, stdio: "ignore" });
  servers.push(server);
  await waitFor(`http://localhost:${APP_PORT}/editor`);
  await smoke(blocks.map((name) => `http://localhost:${APP_PORT}/${name}`));
  console.log(`\n✓ All ${blocks.length} blocks installed, typechecked, built and rendered in a fresh app.`);
} finally {
  stop();
  if (!keep) rmSync(work, { recursive: true, force: true });
  // The registry files are committed; put back the production (photocn.dev) build.
  run("node scripts/build-registry.mjs", www, { REGISTRY_URL: "", PHOTOCN_SPEC: "" });
}

async function waitFor(url, timeout = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function smoke(urls) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const failures = [];
  for (const url of urls) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    const canvases = await page.locator("canvas").count();
    // Blocks that start with a button (avatar, upload) have no canvas yet.
    const needsCanvas = !/avatar-cropper|upload-editor/.test(url);
    let rendered = !needsCanvas;
    // Wait (up to 30s) for every canvas to show the photo.
    for (let attempt = 0; needsCanvas && !rendered && attempt < 30; attempt++) {
      // Photo previews only (skip small canvases like the histogram strip).
      const previews = [];
      for (const canvas of await page.locator("canvas").all()) {
        const box = await canvas.boundingBox();
        if (box && box.width > 150 && box.height > 120) previews.push(canvas);
      }
      const sizes = await Promise.all(previews.map(async (canvas) => (await canvas.screenshot()).byteLength));
      rendered = sizes.length > 0 && sizes.every((size) => size > 15_000);
      if (!rendered) await page.waitForTimeout(1000);
    }
    const ok = errors.length === 0 && rendered;
    console.log(`${ok ? "✓" : "✗"} ${url}  canvases=${canvases} ${errors.join(" | ")}`);
    if (!ok) failures.push(url);
    await page.close();
  }
  await browser.close();
  if (failures.length) throw new Error(`Blocks failed to render: ${failures.join(", ")}`);
}
