"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { examples } from "@/examples";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

/** Live example on top, its source underneath (collapsed until asked). */
export function PreviewCard({ name, code, source }: { name: string; code: ReactNode; source: string }) {
  const [expanded, setExpanded] = useState(false);
  const Example = examples[name];
  return (
    <figure className="not-prose overflow-hidden rounded-xl border bg-card" data-slot="component-preview">
      <div className="p-3 sm:p-4">{Example ? <Example /> : null}</div>
      <div className="relative border-t bg-muted/30">
        <CopyButton className="absolute top-2 right-2 z-10" value={source} />
        <div
          className={cn(
            "overflow-hidden text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-4",
            expanded ? "max-h-[480px] overflow-auto" : "max-h-32",
          )}
        >
          {code}
        </div>
        {expanded ? null : (
          <div className="absolute inset-x-0 bottom-0 flex h-24 items-end justify-center bg-gradient-to-t from-card via-card/80 to-transparent pb-3">
            <Button onClick={() => setExpanded(true)} size="sm" type="button" variant="outline">
              View Code <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </div>
        )}
      </div>
    </figure>
  );
}
