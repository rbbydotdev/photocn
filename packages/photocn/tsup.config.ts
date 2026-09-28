import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, type Plugin } from "esbuild";
import { defineConfig } from "tsup";

/**
 * `import src from "./editor.worker.ts?inline-worker"` → the worker bundled
 * into one classic script and inlined as a string. Consumers then spawn it
 * from a Blob URL, so no bundler needs to understand worker imports.
 */
const inlineWorker: Plugin = {
  name: "inline-worker",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /\?inline-worker$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.replace(/\?inline-worker$/, "")),
      namespace: "inline-worker",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "inline-worker" }, async (args) => {
      const result = await build({
        entryPoints: [args.path],
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        target: "es2022",
        minify: true,
        legalComments: "none",
      });
      const code = result.outputFiles[0]!.text;
      return { contents: `export default ${JSON.stringify(code)};`, loader: "js" };
    });
  },
};

const clientEntries = ["react/index.js", "hooks/index.js"];

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.ts",
    "hooks/index": "src/hooks/index.ts",
    "filters/index": "src/filters/index.ts",
    "dom/index": "src/dom/index.ts",
    "gl/index": "src/gl/index.ts",
    "exif/index": "src/exif/index.ts",
    "worker/index": "src/worker/index.ts",
    "editor.worker": "src/worker/editor.worker.ts",
  },
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: ["react", "react-dom"],
  loader: { ".png": "dataurl" },
  esbuildPlugins: [inlineWorker],
  async onSuccess() {
    // React entries must be client modules under the Next.js App Router.
    for (const entry of clientEntries) {
      const file = path.join("dist", entry);
      const code = await readFile(file, "utf8");
      if (!code.startsWith('"use client"')) {
        await writeFile(file, `"use client";\n${code}`);
      }
    }
  },
});
