"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function DocsToc({ items }: { items: { depth: number; title: string; id: string }[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);
  if (items.length === 0) return null;
  return (
    <nav aria-label="On this page" className="flex flex-col gap-2 text-sm">
      <p className="font-medium">On this page</p>
      {items.map((item) => (
        <a
          className={cn(
            "text-muted-foreground transition-colors hover:text-foreground",
            item.depth === 3 && "pl-3",
            active === item.id && "font-medium text-foreground",
          )}
          href={`#${item.id}`}
          key={item.id}
        >
          {item.title}
        </a>
      ))}
    </nav>
  );
}
