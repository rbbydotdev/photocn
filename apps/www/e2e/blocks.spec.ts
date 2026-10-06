import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { imageSize } from "image-size";
import { PNG } from "pngjs";

// Every block, used the way a person would, with checks on real outputs:
// rendered pixels, exported image sizes, callbacks, undo state.

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});
test.afterEach(() => {
  expect(errors, "no runtime errors").toEqual([]);
});

/** A rendered photo screenshots large; a blank or failed canvas tiny. */
async function expectRendered(canvas: Locator) {
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => (await canvas.screenshot()).byteLength, { timeout: 30_000 })
    .toBeGreaterThan(20_000);
}

/** Mean absolute per-channel difference between two same-size screenshots (0..255). */
function meanDiff(a: Buffer, b: Buffer) {
  const x = PNG.sync.read(a);
  const y = PNG.sync.read(b);
  if (x.width !== y.width || x.height !== y.height) return 255;
  let sum = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    sum += Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]);
  }
  return sum / ((x.data.length / 4) * 3);
}

async function downloadedSize(page: Page, trigger: () => Promise<unknown>) {
  const [download] = await Promise.all([page.waitForEvent("download"), trigger()]);
  const buffer = await readFile((await download.path())!);
  return { ...imageSize(buffer), name: download.suggestedFilename() };
}

const stageCanvas = (scope: Page | Locator) => scope.locator("[data-slot=image-editor-stage] canvas").first();

test("editor: renders, edits, ⌘K menu, full-resolution export", async ({ page }) => {
  await page.goto("/view/editor");
  const editor = page.locator("[data-slot=image-editor]");
  await expect(editor).toHaveAttribute("data-layout", "desktop");
  await expectRendered(stageCanvas(page));

  await editor.locator("[data-slot=editor-toolbar]").getByRole("button", { name: "Filters" }).click();
  await editor.getByRole("button", { name: "juno" }).click();
  await expect(editor.getByRole("button", { name: "juno" })).toHaveAttribute("aria-pressed", "true");
  await expect(editor.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.locator("[data-slot=image-editor-stage]").click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Search commands...")).toBeVisible();
  await page.keyboard.press("Escape");

  await editor.getByRole("button", { name: "Export" }).click();
  const size = await downloadedSize(page, () => page.getByRole("button", { name: "Download" }).click());
  expect(size).toMatchObject({ width: 2400, height: 1600, type: "png" });
});

test("editor: menus, selects and tooltips (Base UI)", async ({ page }) => {
  await page.goto("/view/editor");
  const editor = page.locator("[data-slot=image-editor]");
  await expectRendered(stageCanvas(page));
  const toolbar = editor.locator("[data-slot=editor-toolbar]");

  // Toggle group: the active tool is pressed.
  await toolbar.getByRole("button", { name: "Crop" }).click();
  await expect(toolbar.getByRole("button", { name: "Crop" })).toHaveAttribute("aria-pressed", "true");

  // Select shows the option label, not the raw value.
  const ratio = editor.getByRole("combobox").first();
  await expect(ratio).toHaveText(/Freeform/);
  await ratio.click();
  await page.getByRole("option", { name: "16:9" }).click();
  await expect(ratio).toHaveText(/16:9/);

  // Tooltip on an icon button: move onto it, then let the pointer settle.
  const rotate = (await editor.getByRole("button", { name: "Rotate left" }).boundingBox())!;
  await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2, { steps: 6 });
  await page.mouse.move(rotate.x + rotate.width / 2 + 1, rotate.y + rotate.height / 2, { steps: 2 });
  await expect(page.locator("[data-slot=tooltip-content]")).toHaveText("Rotate left");

  // Context menu items run their action.
  await toolbar.getByRole("button", { name: "Curves" }).click();
  const curve = editor.getByRole("img", { name: /curve editor/ });
  const points = await curve.locator("circle").count();
  const box = (await curve.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4, { button: "right" });
  await page.getByRole("menuitem", { name: "Add point here" }).click();
  await expect.poll(() => curve.locator("circle").count()).toBeGreaterThan(points);
});

test("editor-minimal: tabs switch panels, crop view, export", async ({ page }) => {
  await page.goto("/view/editor-minimal");
  await expectRendered(stageCanvas(page));
  await expect(page.locator("[data-slot=adjustment-panel]")).toBeVisible();

  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.locator("[data-slot=filters-panel]")).toBeVisible();

  await page.getByRole("button", { name: "Crop" }).first().click();
  await expect(page.locator("[data-slot=crop-panel]")).toBeVisible();
  await expect(page.locator("[data-slot=image-editor-crop-overlay]")).toBeVisible();
  await page.getByRole("button", { name: "Rotate right" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.getByRole("button", { name: "Export" }).click();
  const size = await downloadedSize(page, () => page.getByRole("button", { name: "Download" }).click());
  expect(size).toMatchObject({ width: 1600, height: 2400 }); // rotated 2400×1600
});

test("editor-mobile: compact layout, sheet panels, export drawer @mobile", async ({ page }) => {
  await page.goto("/view/editor-mobile");
  const editor = page.locator("[data-slot=image-editor]");
  await expect(editor).toHaveAttribute("data-layout", "compact");
  await expectRendered(stageCanvas(page));

  await page.locator("[data-slot=image-editor-compact-tools] button", { hasText: "Filters" }).first().tap();
  const sheet = page.locator("[data-slot=image-editor-drawer]");
  await expect(sheet).toHaveAttribute("data-open", "true");
  await sheet.getByRole("button", { name: "lark" }).tap();
  await expect(sheet.getByRole("button", { name: "lark" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Close panel" }).tap();
  await expect(sheet).not.toHaveAttribute("data-open", "true");

  // ⋯ menu items run their action (Base UI menus use onClick).
  await expect(editor.getByRole("button", { name: "Undo" })).toBeEnabled();
  await editor.getByRole("button", { name: "More" }).tap();
  await page.getByRole("menuitem", { name: /Reset all/ }).tap();
  await expect(editor.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.locator("[data-slot=image-editor-compact-tools] button", { hasText: "Filters" }).first().tap();
  await expect(sheet.getByRole("button", { name: "lark" })).toHaveAttribute("aria-pressed", "false");
  await sheet.getByRole("button", { name: "Close panel" }).tap();

  await editor.getByRole("button", { name: "Export" }).tap();
  const drawer = page.locator("[data-slot=image-editor-export-dialog]");
  await expect(drawer).toHaveAttribute("data-swipe-direction", "down");
  const size = await downloadedSize(page, () => drawer.getByRole("button", { name: "Download" }).tap());
  expect(size).toMatchObject({ width: 1600, height: 2400 });
});

test("editor-mobile: the photo stays touchable while a panel is open @mobile", async ({ page }) => {
  await page.goto("/view/editor-mobile");
  await expectRendered(stageCanvas(page));
  await page.locator("[data-slot=image-editor-compact-tools] button", { hasText: "Crop" }).first().tap();
  const handle = page.locator('button[aria-label="Resize from bottom right"]');
  await expect(handle).toBeVisible();
  // Wait for the sheet to finish opening and the photo to re-fit above it.
  await expect(page.locator("[data-slot=image-editor-drawer]")).toHaveAttribute("data-open", "true");
  let last = "";
  await expect
    .poll(async () => {
      const b = await handle.boundingBox();
      const now = JSON.stringify(b);
      const stable = now === last;
      last = now;
      return stable;
    }, { intervals: [300] })
    .toBe(true);
  expect((await handle.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  // A real one-finger drag on the handle (CDP touch events → pointer events).
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  // Software WebGL can still be re-fitting the photo; re-read the handle and
  // repeat the gesture until it lands.
  await expect(async () => {
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await touch("touchStart", x, y);
    for (let i = 1; i <= 8; i++) await touch("touchMove", x - i * 12, y - i * 6);
    await touch("touchEnd", 0, 0);
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
});

test("avatar-cropper: square crop saves a 512×512 avatar", async ({ page }) => {
  await page.goto("/view/avatar-cropper");
  await page.getByRole("button", { name: "Upload photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog).toBeVisible();
  await expectRendered(dialog.locator("canvas"));
  await expect(dialog.locator("[data-slot=image-editor-crop-overlay]")).toBeVisible();
  // The frame is locked to a square.
  const frame = (await dialog.locator("[data-slot=image-editor-crop-overlay] [role=group]").boundingBox())!;
  expect(Math.abs(frame.width - frame.height)).toBeLessThan(2);

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const avatar = page.getByRole("img", { name: "Avatar" });
  await expect(avatar).toBeVisible();
  const natural = await avatar.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(natural).toEqual([512, 512]);
  await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();
});

test("upload-editor: drop zone → edit → upload callback", async ({ page }) => {
  await page.goto("/view/upload-editor");
  await page.locator('input[type="file"]').setInputFiles("public/samples/dog.jpg");
  const editor = page.locator("[data-slot=image-editor]");
  await expect(editor).toBeVisible();
  await expectRendered(stageCanvas(page));
  await editor.locator("[data-slot=editor-toolbar]").getByRole("button", { name: "Filters" }).click();
  await editor.getByRole("button", { name: "crema" }).click();

  await editor.getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export image" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  // Saving renders the full-resolution image first (slow under software WebGL).
  await expect(page.locator("label").filter({ hasText: "Uploaded" })).toContainText("Uploaded dog.png", {
    timeout: 120_000,
  });
  await expect(editor).toBeHidden();
});

test("filter-picker: pick a look, strength 0 is the original", async ({ page }) => {
  await page.goto("/view/filter-picker");
  const canvas = stageCanvas(page);
  await expectRendered(canvas);
  const original = await canvas.screenshot();

  await page.getByRole("button", { name: "juno" }).click();
  await expect(page.getByRole("button", { name: "juno" })).toHaveAttribute("aria-pressed", "true");
  const strength = page.getByRole("slider", { name: "Filter strength" });
  await expect(strength).toBeVisible();
  await expect.poll(async () => meanDiff(await canvas.screenshot(), original)).toBeGreaterThan(5);

  await strength.focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => meanDiff(await canvas.screenshot(), original), { timeout: 15_000 }).toBeLessThan(1);
});

test("before-after: dragging moves the split", async ({ page }) => {
  await page.goto("/view/before-after");
  const after = page.getByRole("img", { name: "Before" }).locator("..");
  await expectRendered(page.locator("canvas[aria-label=After]"));
  const clipped = page.locator("canvas[aria-label=After]").locator("..");
  await expect(clipped).toHaveAttribute("style", /inset\(0px 0px 0px 50%\)/);

  const box = (await after.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(clipped).toHaveAttribute("style", /inset\(0px 0px 0px (19|20|21)(\.\d+)?%\)/);
});

test("batch-looks: one look on every photo, per-photo download", async ({ page }) => {
  await page.goto("/view/batch-looks");
  const canvases = page.locator("canvas");
  await expect(canvases).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expectRendered(canvases.nth(i));
  const before = await canvases.nth(1).screenshot();

  await page.getByRole("button", { name: "lark", exact: true }).click();
  await expect.poll(async () => meanDiff(await canvases.nth(1).screenshot(), before)).toBeGreaterThan(3);

  const tile = canvases.nth(0).locator("../..");
  await tile.hover();
  const size = await downloadedSize(page, () => tile.getByRole("button", { name: "Download" }).click());
  expect(size).toMatchObject({ width: 2400, height: 1600, type: "jpg" });
});
