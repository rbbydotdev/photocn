import Link from "next/link";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-32 text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Nothing to edit here</h1>
        <p className="text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <div className="flex gap-3">
          <Link className={buttonVariants()} href="/">
            Go home
          </Link>
          <Link className={buttonVariants({ variant: "outline" })} href="/docs">
            Read docs
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
