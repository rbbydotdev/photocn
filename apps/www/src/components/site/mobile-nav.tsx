"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { docsNav as DocsNav } from "@/lib/docs";
import { mainNav } from "@/lib/site";
import { cn } from "@/lib/utils";

import { Logo } from "./logo";

export function MobileNav({ className, docsNav }: { className?: string; docsNav: typeof DocsNav }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const link = (href: string, title: string) => (
    <Link
      className={cn(
        "rounded-md px-2 py-2 text-lg text-muted-foreground transition-colors hover:text-foreground",
        pathname === href && "font-medium text-foreground",
      )}
      href={href}
      key={href}
      onClick={() => setOpen(false)}
    >
      {title}
    </Link>
  );
  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={<Button aria-label="Open menu" className={cn("size-10", className)} size="icon" variant="ghost" />}
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent className="w-[85vw] max-w-sm gap-0 overflow-y-auto rounded-r-xl p-0" side="left">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Logo /> photocn
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-6 p-4">
          <div className="flex flex-col">
            <h4 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Pages</h4>
            {link("/", "Home")}
            {mainNav.map((item) => link(item.href, item.title))}
          </div>
          {docsNav.map((section) => (
            <div className="flex flex-col" key={section.title}>
              <h4 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{section.title}</h4>
              {section.items.map((item) => link(item.href, item.title))}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
