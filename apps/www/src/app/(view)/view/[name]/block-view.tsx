"use client";

import { blockDemos } from "@/registry/blocks/demos";

export function BlockView({ name }: { name: string }) {
  const Demo = blockDemos[name];
  return Demo ? <Demo /> : null;
}
