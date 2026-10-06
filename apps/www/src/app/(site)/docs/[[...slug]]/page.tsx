import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXContent } from "@content-collections/mdx/react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { ComponentPreview } from "@/components/site/component-preview";
import { CopyPage } from "@/components/site/copy-page";
import { DocsToc } from "@/components/site/docs-toc";
import { InstallCommand } from "@/components/site/install-command";
import { Button } from "@/components/ui/button";
import { docs, getDoc, neighbors } from "@/lib/docs";
import { siteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return docs.map((doc) => ({ slug: doc.slug ? doc.slug.split("/") : [] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = getDoc((await params).slug?.join("/") ?? "");
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.description,
    openGraph: {
      title: `${doc.title} - photocn`,
      description: doc.description,
      images: [{ url: `/og/docs/${doc.slug || "index"}.png`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", images: [`/og/docs/${doc.slug || "index"}.png`] },
    alternates: {
      canonical: doc.url,
      types: { "text/markdown": `${doc.url}.md` },
    },
  };
}

const components = {
  ComponentPreview,
  InstallCommand,
  // Wide tables scroll inside their own box instead of the page.
  table: (props: React.ComponentProps<"table">) => (
    <div className="docs-table">
      <table {...props} />
    </div>
  ),
};

export default async function DocPage({ params }: Props) {
  const doc = getDoc((await params).slug?.join("/") ?? "");
  if (!doc) notFound();
  const { prev, next } = neighbors(doc.slug);
  return (
    <div className="flex gap-10">
      <article className="min-w-0 flex-1 pb-24">
        <header className="mb-8 flex flex-col gap-3 border-b pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">{doc.title}</h1>
            <CopyPage markdown={doc.markdown} url={`${siteUrl}${doc.url}`} />
          </div>
          <p className="text-lg text-muted-foreground text-pretty">{doc.description}</p>
        </header>
        <div className="docs-prose">
          <MDXContent code={doc.mdx} components={components} />
        </div>
        <nav aria-label="Pagination" className="mt-16 flex justify-between gap-4 border-t pt-6">
          {prev ? (
            <Button asChild variant="ghost">
              <Link href={prev.url}>
                <ChevronLeftIcon data-icon="inline-start" /> {prev.title}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button asChild variant="ghost">
              <Link href={next.url}>
                {next.title} <ChevronRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          ) : null}
        </nav>
      </article>
      <aside className="hidden w-48 shrink-0 xl:block">
        <div className="sticky top-24">
          <DocsToc items={doc.toc} />
        </div>
      </aside>
    </div>
  );
}
