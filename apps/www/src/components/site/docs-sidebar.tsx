"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { docsNav } from "@/lib/site";
import { cn } from "@/lib/utils";

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-6 text-sm">
      {docsNav.map((section) => (
        <div className="flex flex-col gap-1" key={section.title}>
          <h4 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{section.title}</h4>
          {section.items.map((item) => (
            <Link
              className={cn(
                "rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                pathname === item.href && "bg-muted font-medium text-foreground",
              )}
              href={item.href}
              key={item.href}
            >
              {item.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
