import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static: deployed as Cloudflare Workers static assets (see wrangler.jsonc).
  output: "export",
  images: { unoptimized: true },
  agentRules: false,
  turbopack: { root: path.join(__dirname, "../..") },
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
