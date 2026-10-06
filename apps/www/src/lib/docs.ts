import { allDocs } from "content-collections";

export type Doc = (typeof allDocs)[number];

export const docSections = ["Basics", "Guides", "Components"] as const;

export const docs: Doc[] = [...allDocs].sort((a, b) => a.order - b.order);

export function getDoc(slug: string): Doc | undefined {
  return docs.find((doc) => doc.slug === slug);
}

export interface NavItem {
  title: string;
  href: string;
  external?: boolean;
}

/** Sidebar / mobile menu, in reading order. */
export const docsNav: { title: string; items: NavItem[] }[] = docSections.map((section) => {
  const items: NavItem[] = docs
    .filter((doc) => doc.section === section)
    .map((doc) => ({ title: doc.title, href: doc.url }));
  if (section === "Basics") items.splice(2, 0, { title: "llms.txt", href: "/llms.txt", external: true });
  return { title: section, items };
});

/** Previous / next page in sidebar order. */
export function neighbors(slug: string) {
  const index = docs.findIndex((doc) => doc.slug === slug);
  return { prev: docs[index - 1], next: docs[index + 1] };
}
