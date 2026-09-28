"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Examples are client-only (WebGL + workers) and lazy so each page only
// loads the editors it shows.
export const examples: Record<string, ComponentType> = {
  "full-editor": dynamic(() => import("./full-editor"), { ssr: false }),
  "compose-your-own": dynamic(() => import("./compose-your-own"), { ssr: false }),
  "filter-strip": dynamic(() => import("./filter-strip"), { ssr: false }),
  headless: dynamic(() => import("./headless"), { ssr: false }),
  "custom-tools": dynamic(() => import("./custom-tools"), { ssr: false }),
  controlled: dynamic(() => import("./controlled"), { ssr: false }),
};

export type ExampleName = keyof typeof examples;
