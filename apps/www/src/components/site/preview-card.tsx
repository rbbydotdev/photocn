"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon, MonitorIcon, SmartphoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { examples } from "@/examples";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

export type PreviewView = "desktop" | "phone";

const views = [
  { value: "desktop", label: "Desktop", icon: MonitorIcon },
  { value: "phone", label: "Phone", icon: SmartphoneIcon },
] as const;

/**
 * Live example on top, its source underneath (collapsed until asked).
 * "Phone" renders the same example in a 390px frame: the editor picks its
 * layout from its own width, so this is the real phone layout.
 */
export function PreviewCard({
  name,
  code,
  source,
  defaultView = "desktop",
}: {
  name: string;
  code: ReactNode;
  source: string;
  defaultView?: PreviewView;
}) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<PreviewView>(defaultView);
  const Example = examples[name];
  return (
    <figure className="not-prose overflow-hidden rounded-xl border bg-card" data-slot="component-preview">
      <div className="hidden justify-end border-b px-3 py-2 sm:flex" role="group" aria-label="Preview size">
        <div className="flex rounded-lg bg-muted p-0.5">
          {views.map(({ value, label, icon: Icon }) => (
            <button
              aria-pressed={view === value}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground",
                view === value && "bg-background text-foreground shadow-sm",
              )}
              key={value}
              onClick={() => setView(value)}
              type="button"
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === "phone" ? (
        <div className="bg-muted/30 p-4 sm:p-6">
          <div
            className="mx-auto flex max-h-[760px] w-full max-w-[390px] flex-col overflow-hidden rounded-[2.25rem] border-[10px] border-zinc-900 bg-background shadow-xl dark:border-zinc-700"
            data-slot="phone-frame"
          >
            <div className="min-h-0 flex-1 overflow-y-auto">{Example ? <Example key="phone" /> : null}</div>
          </div>
        </div>
      ) : (
        <div className="p-3 sm:p-4">{Example ? <Example key="desktop" /> : null}</div>
      )}
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
