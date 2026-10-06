import { Button } from "@/components/ui/button";
import { githubRepo, githubUrl } from "@/lib/site";

import { GitHubIcon } from "./icons";

async function getStars(): Promise<number | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${githubRepo}`, {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return ((await response.json()) as { stargazers_count?: number }).stargazers_count ?? null;
  } catch {
    return null;
  }
}

function format(count: number) {
  return count >= 1000 ? `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(count);
}

/** GitHub link with the star count, fetched when the site is built. */
export async function GitHubStars() {
  const stars = await getStars();
  return (
    <Button asChild className="gap-1.5 px-2" size="sm" variant="ghost">
      <a aria-label="photocn on GitHub" href={githubUrl} rel="noreferrer" target="_blank">
        <GitHubIcon className="size-4" />
        {stars !== null ? <span className="tabular-nums text-muted-foreground">{format(stars)}</span> : null}
      </a>
    </Button>
  );
}
