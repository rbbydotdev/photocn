"use client";

import { useState, type ReactNode } from "react";
import { CheckIcon, MaximizeIcon, TerminalIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BlockPreview({
  name,
  title,
  description,
  height,
  mobile,
  code,
}: {
  name: string;
  title: string;
  description: string;
  height: number;
  mobile?: boolean;
  code: ReactNode;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const command = `pnpm dlx shadcn@latest add @photocn/${name}`;
  return (
    <section className="flex scroll-mt-20 flex-col gap-3" id={name}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            <a className="hover:underline" href={`#${name}`}>
              {title}
            </a>
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5 text-sm" role="tablist">
            {(["preview", "code"] as const).map((value) => (
              <button
                aria-selected={tab === value}
                className={cn(
                  "rounded-md px-3 py-1 capitalize text-muted-foreground",
                  tab === value && "bg-background text-foreground shadow-sm",
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
          <Button
            aria-label={`Copy: ${command}`}
            className="font-mono text-xs"
            onClick={async () => {
              await navigator.clipboard.writeText(command);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            size="sm"
            variant="outline"
          >
            {copied ? <CheckIcon data-icon="inline-start" /> : <TerminalIcon data-icon="inline-start" />}
            <span className="hidden md:inline">{command}</span>
            <span className="md:hidden">{copied ? "Copied" : "Copy"}</span>
          </Button>
          <a
            aria-label="Open in a new tab"
            className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
            href={`/view/${name}`}
            rel="noreferrer"
            target="_blank"
          >
            <MaximizeIcon />
          </a>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-muted/20">
        {tab === "preview" ? (
          <iframe
            className={cn("block w-full bg-background", mobile && "mx-auto max-w-[400px] border-x")}
            loading="lazy"
            src={`/view/${name}`}
            style={{ height }}
            title={title}
          />
        ) : (
          <div className="max-h-[640px] overflow-auto text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-4">
            {code}
          </div>
        )}
      </div>
    </section>
  );
}
