import Link from "next/link";

import { githubUrl, sponsorUrl, xUrl } from "@/lib/site";

import { GitHubIcon, XIcon } from "./icons";
import { Logo } from "./logo";

const columns = [
  {
    title: "Product",
    links: [
      { title: "Documentation", href: "/docs" },
      { title: "Components", href: "/docs/canvas" },
      { title: "Blocks", href: "/blocks" },
      { title: "llms.txt", href: "/llms.txt" },
    ],
  },
  {
    title: "Community",
    links: [
      { title: "GitHub", href: githubUrl },
      { title: "Sponsor", href: sponsorUrl },
      { title: "X", href: xUrl },
    ],
  },
  {
    title: "Resources",
    links: [
      { title: "shadcn/ui", href: "https://ui.shadcn.com" },
      { title: "Tailwind CSS", href: "https://tailwindcss.com" },
      { title: "mini-photo-editor", href: "https://github.com/xdadda/mini-photo-editor" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t bg-muted/30 pb-[env(safe-area-inset-bottom)] md:mt-40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-5">
        <div className="flex flex-col gap-4 md:col-span-2">
          <Link className="flex items-center gap-2 text-lg font-semibold tracking-tight" href="/">
            <Logo /> photocn
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">
            Free &amp; open-source photo editor components for React.
          </p>
          <div className="flex gap-3 text-muted-foreground">
            <a aria-label="GitHub" className="hover:text-foreground" href={githubUrl} rel="noreferrer" target="_blank">
              <GitHubIcon className="size-5" />
            </a>
            <a aria-label="X" className="hover:text-foreground" href={xUrl} rel="noreferrer" target="_blank">
              <XIcon className="size-5" />
            </a>
          </div>
        </div>
        {columns.map((column) => (
          <div className="flex flex-col gap-3 text-sm" key={column.title}>
            <h3 className="font-medium">{column.title}</h3>
            {column.links.map((link) => {
              const external = link.href.startsWith("http") || link.href.endsWith(".txt");
              return external ? (
                <a
                  className="text-muted-foreground hover:text-foreground"
                  href={link.href}
                  key={link.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.title}
                </a>
              ) : (
                <Link className="text-muted-foreground hover:text-foreground" href={link.href} key={link.href}>
                  {link.title}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-7xl border-t px-4 py-6 text-xs text-muted-foreground sm:px-6">
        © 2026 photocn. MIT licensed.
      </div>
    </footer>
  );
}
