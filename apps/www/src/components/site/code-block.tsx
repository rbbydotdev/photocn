import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

export async function CodeBlock({
  code,
  lang = "tsx",
  title,
  className,
}: {
  code: string;
  lang?: "tsx" | "bash" | "json";
  title?: string;
  className?: string;
}) {
  const html = await highlight(code.trim(), lang);
  return (
    <figure className={cn("group relative overflow-hidden rounded-xl border bg-muted/30", className)}>
      {title ? (
        <figcaption className="border-b px-4 py-2 font-mono text-xs text-muted-foreground">
          {title}
        </figcaption>
      ) : null}
      <CopyButton className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" value={code.trim()} />
      <div
        className="max-h-[520px] overflow-auto p-4 text-[13px] leading-relaxed [&_pre]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}
