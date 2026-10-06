/** Public URL the registry is served from (also used in install commands). */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://photocn.dev"
).replace(/\/$/, "");

export const githubUrl = "https://github.com/rbbydotdev/photocn";

export const registryItemUrl = (name: string) => `${siteUrl}/r/${name}.json`;

export const mainNav = [
  { title: "Docs", href: "/docs" },
  { title: "Components", href: "/docs/canvas" },
  { title: "Blocks", href: "/blocks" },
] as const;

export const xUrl = "https://x.com/rbbydotdev";
export const sponsorUrl = "https://github.com/sponsors/rbbydotdev";
export const githubRepo = "rbbydotdev/photocn";

