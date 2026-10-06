import Link from "next/link";

import { Separator } from "@/components/ui/separator";
import { blocks } from "@/lib/blocks";
import { docsNav } from "@/lib/docs";
import { mainNav } from "@/lib/site";

import { GitHubStars } from "./github-stars";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { Search } from "./search";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  const searchGroups = [
    ...docsNav.map((section) => ({
      title: section.title,
      items: section.items.filter((item) => !item.external),
    })),
    { title: "Blocks", items: blocks.map((block) => ({ title: block.title, href: `/blocks#${block.name}` })) },
  ];
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <MobileNav className="-ml-2 lg:hidden" docsNav={docsNav} />
        <Link className="flex items-center gap-2 text-lg font-semibold tracking-tight" href="/">
          <Logo />
          photocn
        </Link>
        <Separator className="mx-2 hidden h-5 lg:block" orientation="vertical" />
        <nav className="hidden items-center gap-1 lg:flex">
          {mainNav.map((item) => (
            <Link
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              href={item.href}
              key={item.href}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Search className="mr-1 hidden md:inline-flex" groups={searchGroups} />
          <GitHubStars />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
