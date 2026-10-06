// Refreshes every product image from the real UI, then re-renders the
// banner and OG images (scripts/og.tsx). Run after UI changes:
//
//   pnpm --filter www assets          (builds the site first if needed)
//
// Writes public/assets/:
//   editor-dark.jpg, editor-light.jpg   desktop editor (README, banner, OG)
//   bento.jpg                           home page examples (README)
//   mobile.jpg                          phone layout
//   adjust.{gif,mp4}, filters.{gif,mp4}, crop.{gif,mp4}   recorded demos
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, devices } from "@playwright/test";

const www = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(www, "public/assets");
const PORT = 8798;
const BASE = process.env.ASSETS_URL ?? `http://localhost:${PORT}`;
mkdirSync(out, { recursive: true });

const sh = (cmd) => execSync(cmd, { cwd: www, stdio: "inherit" });

let server;
if (!process.env.ASSETS_URL) {
  if (!existsSync(path.join(www, "out/index.html"))) sh("pnpm build");
  server = spawn("pnpm", ["exec", "wrangler", "dev", "--port", String(PORT), "--local"], { cwd: www, stdio: "ignore" });
  process.on("exit", () => server.kill("SIGTERM"));
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

/** Wait until every photo preview on the page has rendered. */
async function settle(page, ms = 1500) {
  for (let i = 0; i < 40; i++) {
    const sizes = [];
    for (const canvas of await page.locator("canvas").all()) {
      try {
        // Canvases can be swapped mid-check (lazy tiles, re-keyed canvases).
        const box = await canvas.boundingBox({ timeout: 1000 });
        if (box && box.width > 150 && box.height > 120) {
          sizes.push((await canvas.screenshot({ timeout: 2000 })).byteLength);
        }
      } catch {
        sizes.push(0);
      }
    }
    if (sizes.length && sizes.every((size) => size > 15_000)) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(ms);
}

async function still(name, url, { scheme = "dark", viewport = { width: 1440, height: 900 }, device, act, clip } = {}) {
  const context = await browser.newContext({
    ...(device ?? {}),
    ...(device ? {} : { viewport }),
    colorScheme: scheme,
    deviceScaleFactor: device ? 2 : 1,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${url}`, { waitUntil: "load" });
  await settle(page);
  if (act) await act(page);
  await settle(page, 1200);
  const target = clip ? page.locator(clip).first() : page;
  // JPEG keeps the repo and README light (photos don't compress as PNG).
  await target.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 86 });
  await context.close();
  console.log(`assets: ${name}.jpg`);
}

/** Record an interaction, then encode a README GIF and a site MP4. */
async function clip(name, url, act, { viewport = { width: 1280, height: 800 } } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "photocn-rec-"));
  const context = await browser.newContext({
    viewport,
    colorScheme: "dark",
    recordVideo: { dir, size: viewport },
  });
  const page = await context.newPage();
  const opened = Date.now();
  await page.goto(`${BASE}${url}`, { waitUntil: "load" });
  await settle(page, 600);
  const start = (Date.now() - opened) / 1000;
  recording = true;
  await act(page).finally(() => (recording = false));
  await page.waitForTimeout(800);
  const length = (Date.now() - opened) / 1000 - start;
  await context.close();
  const video = path.join(dir, readdirSync(dir).find((file) => file.endsWith(".webm")));
  const trim = `-ss ${start.toFixed(2)} -t ${length.toFixed(2)} -i "${video}"`;
  // Software WebGL in CI renders slowly; play long clips back at most 16s.
  const speed = length > 16 ? `setpts=PTS*${(16 / length).toFixed(3)},` : "";
  const gif = path.join(out, `${name}.gif`);
  const mp4 = path.join(out, `${name}.mp4`);
  execSync(
    `ffmpeg -y -loglevel error ${trim} -vf "${speed}fps=10,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${gif}"`,
  );
  execSync(
    `ffmpeg -y -loglevel error ${trim} -vf "${speed}scale=1280:-2" -c:v libx264 -pix_fmt yuv420p -crf 26 -movflags +faststart -an "${mp4}"`,
  );
  rmSync(dir, { recursive: true, force: true });
  console.log(`assets: ${name}.gif, ${name}.mp4 (${length.toFixed(1)}s)`);
}

/** A big caption pill so each step of a demo is obvious. */
async function caption(page, text) {
  await page.evaluate((value) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      el.style.cssText =
        "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;" +
        "padding:10px 18px;border-radius:999px;background:rgba(9,9,10,.86);color:#f5f5f4;" +
        "font:600 22px/1.2 Geist,ui-sans-serif,system-ui;letter-spacing:-.01em;" +
        "border:1.5px solid #d4ff00;box-shadow:0 8px 30px rgba(0,0,0,.45);pointer-events:none;";
      document.body.append(el);
    }
    el.textContent = value;
  }, text);
  await page.waitForTimeout(350);
}

/** Drag a slider (thumb locator) to a position, 0..1 along its track. */
async function slideTo(page, thumb, fraction, steps = 28) {
  const track = thumb.locator("xpath=ancestor::*[@data-slot='slider'][1]");
  const t = await track.boundingBox();
  const h = await thumb.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width * fraction, h.y + h.height / 2, { steps });
  await page.mouse.up();
  await waitForPaint(page);
}

/**
 * Wait until the photo stops changing (software WebGL renders slowly), then
 * hold. Screenshots glitch the screen recording, so clips use a fixed wait.
 */
let recording = false;
async function waitForPaint(page, hold = 700) {
  if (recording) return page.waitForTimeout(hold + 1300);
  const stage = page.locator("[data-slot=image-editor-stage]").first();
  let previous = null;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(250);
    const shot = await stage.screenshot({ animations: "disabled" }).catch(() => null);
    if (shot && previous && shot.equals(previous)) break;
    previous = shot;
  }
  await page.waitForTimeout(hold);
}

const editor = (page) => page.locator("[data-slot=image-editor]").first();
const slider = (page, label) =>
  editor(page).locator("[data-slot=adjustment-slider]").filter({ hasText: label }).locator("[role=slider]");

try {
  // Stills.
  for (const scheme of ["dark", "light"]) {
    await still(`editor-${scheme}`, "/view/editor", {
      scheme,
      act: async (page) => {
        await editor(page).locator("[data-slot=editor-toolbar]").getByRole("button", { name: "Filters" }).click();
        await editor(page).getByRole("button", { name: "crema" }).click();
        await editor(page).locator("[data-slot=editor-toolbar]").getByRole("button", { name: "Curves" }).click();
      },
    });
  }
  await still("bento", "/", {
    scheme: "dark",
    act: async (page) => {
      for (let y = 0; y < 2400; y += 400) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(400);
      }
      await settle(page, 2500);
      // The sticky site header would overlap the captured grid.
      await page.addStyleTag({ content: "header { display: none !important; }" });
    },
    clip: "main > div.grid",
  });
  await still("mobile", "/view/editor-mobile", {
    scheme: "dark",
    device: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } },
    act: async (page) => {
      await page.locator("[data-slot=image-editor-compact-tools] button", { hasText: "Filters" }).first().tap();
      await page.waitForTimeout(800);
      await page.locator("[data-slot=image-editor-drawer]").getByRole("button", { name: "juno" }).tap();
    },
  });

  // Recorded demos: few, big, labeled changes so it's obvious what happens.
  await clip("adjust", "/view/editor", async (page) => {
    await caption(page, "Exposure +100");
    await slideTo(page, slider(page, "Exposure"), 1);
    await caption(page, "Exposure −100");
    await slideTo(page, slider(page, "Exposure"), 0);
    await slideTo(page, slider(page, "Exposure"), 0.5, 12);
    await editor(page).getByRole("tab", { name: "Color" }).click();
    await caption(page, "Saturation −100: black & white");
    await slideTo(page, slider(page, "Saturation"), 0);
    await slideTo(page, slider(page, "Saturation"), 0.5, 12);
    await caption(page, "Temperature: cool");
    await slideTo(page, slider(page, "Temperature"), 0);
    await editor(page).getByRole("tab", { name: "Effects" }).click();
    await caption(page, "Vignette +100");
    await slideTo(page, slider(page, "Vignette"), 1);
    await caption(page, "Hold to see the original");
    await editor(page).getByRole("button", { name: "Original" }).hover();
    await page.mouse.down();
    await waitForPaint(page, 1200);
    await page.mouse.up();
    await caption(page, "Release: your edit");
    await waitForPaint(page, 1000);
  });
  await clip(
    "filters",
    "/view/filter-picker",
    async (page) => {
      for (const look of ["moon", "juno", "kodak", "lark", "vintage"]) {
        await page.getByRole("button", { name: look }).click();
        await caption(page, `Filter: ${look}`);
        await waitForPaint(page, 900);
      }
      const strength = page.locator("[data-slot=slider] [role=slider]").first();
      await caption(page, "Strength 0%");
      await slideTo(page, strength, 0, 24);
      await caption(page, "Strength 100%");
      await slideTo(page, strength, 1, 24);
    },
    { viewport: { width: 520, height: 760 } },
  );
  await clip("crop", "/view/editor", async (page) => {
    await editor(page).locator("[data-slot=editor-toolbar]").getByRole("button", { name: "Crop" }).click();
    await page.waitForTimeout(700);
    const straighten = editor(page).locator("[data-slot=crop-panel] [role=slider]").first();
    await caption(page, "Straighten +25°");
    await slideTo(page, straighten, 0.778, 20);
    await caption(page, "Straighten −25°");
    await slideTo(page, straighten, 0.222, 20);
    await slideTo(page, straighten, 0.5, 10);
    await caption(page, "Rotate 90°");
    await editor(page).getByRole("button", { name: "Rotate right" }).click();
    await waitForPaint(page);
    await caption(page, "Square crop");
    await editor(page).getByRole("combobox").click();
    await page.getByRole("option", { name: "Square" }).click();
    await waitForPaint(page);
    await caption(page, "16:9");
    await editor(page).getByRole("combobox").click();
    await page.getByRole("option", { name: "16:9" }).click();
    await waitForPaint(page);
    await caption(page, "Flip");
    await editor(page).getByRole("button", { name: "Flip horizontal" }).click();
    await waitForPaint(page);
  });
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}

// Banner + OG images from the fresh screenshots.
sh("pnpm og");
