"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Examples are client-only (WebGL + workers) and lazy so each page only
// loads the editors it shows.
export const examples: Record<string, ComponentType> = {
  "adjustments-demo": dynamic(() => import("./adjustments-demo"), { ssr: false }),
  "blend-demo": dynamic(() => import("./blend-demo"), { ssr: false }),
  "blur-demo": dynamic(() => import("./blur-demo"), { ssr: false }),
  "canvas-demo": dynamic(() => import("./canvas-demo"), { ssr: false }),
  "command-menu-demo": dynamic(() => import("./command-menu-demo"), { ssr: false }),
  "compact-layout-demo": dynamic(() => import("./compact-layout-demo"), { ssr: false }),
  "compose-your-own": dynamic(() => import("./compose-your-own"), { ssr: false }),
  "controlled": dynamic(() => import("./controlled"), { ssr: false }),
  "crop-demo": dynamic(() => import("./crop-demo"), { ssr: false }),
  "curves-demo": dynamic(() => import("./curves-demo"), { ssr: false }),
  "custom-tools": dynamic(() => import("./custom-tools"), { ssr: false }),
  "export-demo": dynamic(() => import("./export-demo"), { ssr: false }),
  "filter-strip": dynamic(() => import("./filter-strip"), { ssr: false }),
  "filters-demo": dynamic(() => import("./filters-demo"), { ssr: false }),
  "full-editor": dynamic(() => import("./full-editor"), { ssr: false }),
  "headless": dynamic(() => import("./headless"), { ssr: false }),
  "histogram-demo": dynamic(() => import("./histogram-demo"), { ssr: false }),
  "layout-demo": dynamic(() => import("./layout-demo"), { ssr: false }),
  "metadata-demo": dynamic(() => import("./metadata-demo"), { ssr: false }),
  "recipes-demo": dynamic(() => import("./recipes-demo"), { ssr: false }),
  "toolbar-demo": dynamic(() => import("./toolbar-demo"), { ssr: false }),
  "vanilla": dynamic(() => import("./vanilla"), { ssr: false }),
};

export type ExampleName = keyof typeof examples;
