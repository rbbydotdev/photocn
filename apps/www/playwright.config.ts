import { defineConfig, devices } from "@playwright/test";

// Runs against the real static build served by wrangler (same as production).
// `pnpm build` first (or let CI do it), then `pnpm test:e2e`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const launchOptions = {
  executablePath,
  // WebGL in headless Chrome without a GPU.
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
};

export default defineConfig({
  testDir: "./e2e",
  // Full-resolution exports under software WebGL can take a while.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:8787",
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, launchOptions },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile",
      // Chromium with an iPhone-sized touch viewport.
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 800 }, launchOptions },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: "pnpm exec wrangler dev --port 8787 --local",
    url: "http://localhost:8787",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
