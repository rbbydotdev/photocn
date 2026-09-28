import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DocsPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <article className="flex min-w-0 flex-col gap-10 pb-24">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-lg text-muted-foreground text-pretty">{description}</p>
      </header>
      {children}
    </article>
  );
}

export function Section({ title, id, children, className }: { title?: string; id?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex scroll-mt-20 flex-col gap-4", className)} id={id}>
      {title ? <h2 className="text-xl font-semibold tracking-tight">{title}</h2> : null}
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-7 text-muted-foreground text-pretty [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground">{children}</p>;
}

export function PropsTable({ rows }: { rows: [name: string, type: string, description: string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Prop</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, type, description]) => (
            <tr className="border-b last:border-0 align-top" key={name}>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{name}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{type}</td>
              <td className="px-3 py-2 text-muted-foreground">{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
