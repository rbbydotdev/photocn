"use client";

import { useState, type ReactNode } from "react";

import { examples } from "@/examples";
import { cn } from "@/lib/utils";

export function PreviewTabs({ name, code }: { name: string; code: ReactNode }) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const Example = examples[name];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 border-b text-sm" role="tablist">
        {(["preview", "code"] as const).map((value) => (
          <button
            aria-selected={tab === value}
            className={cn(
              "-mb-px border-b-2 border-transparent px-1 pb-2 capitalize text-muted-foreground transition-colors hover:text-foreground",
              tab === value && "border-foreground text-foreground",
            )}
            key={value}
            onClick={() => setTab(value)}
            role="tab"
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
      {/* Keep the preview mounted so the editor state survives tab switches. */}
      <div hidden={tab !== "preview"}>{Example ? <Example /> : null}</div>
      <div hidden={tab !== "code"}>{code}</div>
    </div>
  );
}
