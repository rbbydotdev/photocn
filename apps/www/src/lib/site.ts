/** Public URL the registry is served from (also used in install commands). */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://photocn.dev"
).replace(/\/$/, "");

export const githubUrl = "https://github.com/rbbydotdev/photocn";

export const registryItemUrl = (name: string) => `${siteUrl}/r/${name}.json`;

export const docsNav = [
  {
    title: "Getting started",
    items: [
      { title: "Introduction", href: "/docs" },
      { title: "Installation", href: "/docs/installation" },
    ],
  },
  {
    title: "Guides",
    items: [
      { title: "The full editor", href: "/docs/editor" },
      { title: "Compose your own", href: "/docs/composition" },
      { title: "Headless", href: "/docs/headless" },
      { title: "Saving edits", href: "/docs/saving" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Components", href: "/docs/components" },
      { title: "useImageEditor", href: "/docs/api" },
    ],
  },
] as const;
