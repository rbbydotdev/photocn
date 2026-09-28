import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // Tests never boot the real worker; stub the inlined source.
      name: "inline-worker-stub",
      enforce: "pre",
      resolveId(id) {
        return id.endsWith("?inline-worker") ? "\0inline-worker-stub" : null;
      },
      load(id) {
        return id === "\0inline-worker-stub" ? "export default '';" : null;
      },
    },
  ],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
