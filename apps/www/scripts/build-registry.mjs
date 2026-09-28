// Generates registry.json from ITEMS below, deriving every item's
// `dependencies` / `registryDependencies` from the files' real imports, then
// runs `shadcn build` into public/r.
//
//   REGISTRY_URL=https://your-domain.com node scripts/build-registry.mjs
//
// PHOTOCN_SPEC overrides the npm spec of the engine (e.g. a local tarball
// `photocn@file:/abs/photocn-0.1.0.tgz`) to test installs before publishing.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REGISTRY_URL = (process.env.REGISTRY_URL ?? "http://localhost:3000").replace(/\/$/, "");
const DIR = "src/registry/image-editor";
const photocnVersion = JSON.parse(
  readFileSync(path.join(root, "../../packages/photocn/package.json"), "utf8"),
).version;

/** name → { title, description, files, type? } */
const ITEMS = [
  ["image-editor", "Image Editor", "The complete photo editor: toolbar, canvas, tool switcher, histogram and every panel. Drop it in and go.", ["image-editor.tsx"], "registry:block"],
  ["image-editor-layout", "Layout", "Resizable canvas + sidebar shell with an optional top toolbar.", ["layout.tsx"]],
  ["image-editor-canvas", "Canvas", "The image stage: crop frame and perspective corners in the crop tool; zoom, blur focus, drag-and-drop and hold-to-compare everywhere else.", ["canvas.tsx", "crop-overlay.tsx", "blur-center-overlay.tsx"]],
  ["image-editor-toolbar", "Toolbar", "Tool switcher plus undo, redo, open, reset and compare buttons.", ["toolbar.tsx"]],
  ["image-editor-histogram", "Histogram", "Live RGB histogram of the rendered image.", ["histogram.tsx"]],
  ["image-editor-tool-panel", "Tool Panel", "Renders the panel for the active tool; swap or add panels per tool.", ["tool-panel.tsx"]],
  ["image-editor-panel-header", "Panel Header", "Shared title + reset header used by the panels.", ["panel-header.tsx"]],
  ["image-editor-adjustments", "Adjustments", "Light, color and effect sliders.", ["adjustments-panel.tsx"]],
  ["image-editor-filters", "Filters", "LUT and color-matrix presets with a strength slider.", ["filters-panel.tsx"]],
  ["image-editor-curves", "Curves", "RGB and per-channel tone curves over a live histogram.", ["curves-panel.tsx"]],
  ["image-editor-blur", "Blur", "Bokeh and gaussian lens blur with a draggable focus point.", ["blur-panel.tsx"]],
  ["image-editor-crop", "Crop", "Quarter turns, flips, aspect ratios, straighten and perspective. Non-destructive: reopen and widen the crop any time.", ["crop-panel.tsx", "icon-skew.tsx"]],
  ["image-editor-blend", "Blend", "Blend a second image into the photo.", ["blend-panel.tsx"]],
  ["image-editor-metadata", "Metadata", "File info and EXIF of the open image.", ["metadata-panel.tsx"]],
  ["image-editor-export", "Export Dialog", "Format, quality and output size; downloads or saves the result.", ["export-dialog.tsx"]],
  ["image-editor-recipes", "Recipes", "Save a look as JSON and re-apply it to any photo.", ["recipes.tsx"]],
  ["image-editor-command-menu", "Command Menu", "Cmd+K palette for tools, history and filters.", ["command-menu.tsx"]],
  ["image-editor-devtools", "Devtools", "Floating render stats for tuning the worker renderer.", ["devtools.tsx"]],
];

const fileOwner = new Map();
for (const [name, , , files] of ITEMS) for (const file of files) fileOwner.set(file, name);

const importRe = /(?:import|export)[^'"]*?from\s+["']([^"']+)["']/g;
const itemUrl = (name) => `${REGISTRY_URL}/r/${name}.json`;

const items = ITEMS.map(([name, title, description, files, type = "registry:component"]) => {
  const dependencies = new Set();
  const registryDependencies = new Set();
  for (const file of files) {
    const source = readFileSync(path.join(root, DIR, file), "utf8");
    for (const [, spec] of source.matchAll(importRe)) {
      if (spec.startsWith("@/components/ui/")) {
        registryDependencies.add(spec.slice("@/components/ui/".length));
      } else if (spec.startsWith("./")) {
        const owner = fileOwner.get(`${spec.slice(2)}.tsx`);
        if (!owner) throw new Error(`${file}: no registry item owns ${spec}`);
        if (owner !== name) registryDependencies.add(itemUrl(owner));
      } else if (spec === "@/lib/utils" || spec === "react") {
        // provided by every shadcn project
      } else if (spec.startsWith("photocn")) {
        dependencies.add(process.env.PHOTOCN_SPEC ?? `photocn@^${photocnVersion}`);
      } else if (!spec.startsWith("@/")) {
        dependencies.add(spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/"));
      } else {
        throw new Error(`${file}: unsupported import ${spec}`);
      }
    }
  }
  return {
    name,
    type,
    title,
    description,
    dependencies: [...dependencies].sort(),
    registryDependencies: [...registryDependencies].sort(),
    files: files.map((file) => ({
      path: `${DIR}/${file}`,
      type: "registry:component",
      target: `components/image-editor/${file}`,
    })),
    categories: ["image-editor"],
  };
});

const registry = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: "photocn",
  homepage: REGISTRY_URL,
  items,
};

writeFileSync(path.join(root, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`registry.json: ${items.length} items → ${REGISTRY_URL}/r/{name}.json`);
if (!process.argv.includes("--no-build")) {
  execSync("pnpm exec shadcn build -o ./public/r", { cwd: root, stdio: "inherit" });
}
