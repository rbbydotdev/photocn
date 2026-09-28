import Link from "next/link";

import { Button } from "@/components/ui/button";
import { githubUrl } from "@/lib/site";

import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link className="flex items-center gap-2 font-semibold tracking-tight" href="/">
          <Logo />
          photocn
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link className="hover:text-foreground" href="/docs">
            Docs
          </Link>
          <Link className="hover:text-foreground" href="/docs/components">
            Components
          </Link>
          <Link className="hover:text-foreground" href="/docs/api">
            API
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild size="sm" variant="ghost">
            <a href={githubUrl} rel="noreferrer" target="_blank">
              GitHub
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
