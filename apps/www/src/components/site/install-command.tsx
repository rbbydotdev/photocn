"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

const runners = {
  pnpm: "pnpm dlx shadcn@latest add",
  npm: "npx shadcn@latest add",
  yarn: "yarn dlx shadcn@latest add",
  bun: "bunx --bun shadcn@latest add",
} as const;

export function InstallCommand({ items, className }: { items: string | string[]; className?: string }) {
  const [runner, setRunner] = useState<keyof typeof runners>("pnpm");
  const command = `${runners[runner]} ${([] as string[]).concat(items).join(" ")}`;
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-muted/30", className)}>
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        {(Object.keys(runners) as (keyof typeof runners)[]).map((key) => (
          <button
            aria-pressed={runner === key}
            className={cn(
              "rounded-md px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground",
              runner === key && "bg-background text-foreground shadow-xs",
            )}
            key={key}
            onClick={() => setRunner(key)}
            type="button"
          >
            {key}
          </button>
        ))}
        <CopyButton className="ml-auto" value={command} />
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px]">
        <code>{command}</code>
      </pre>
    </div>
  );
}
