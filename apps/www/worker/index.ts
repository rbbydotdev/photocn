/**
 * photocn.dev edge worker. Everything is static (Next export → Workers static
 * assets). This only runs for docs and /llm paths, to serve the markdown
 * twins that agents ask for:
 *   /docs/<page>.md, or /docs/<page> with `Accept: text/markdown` → /llm/docs/<page>.md
 *   /llm/<item>                                                    → /llm/<item>.md
 */
interface Env {
  ASSETS: { fetch(request: Request | string): Promise<Response> };
}

const MARKDOWN = /\btext\/markdown\b/i;

function markdownPath(url: URL, request: Request): string | null {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/docs.md" || path.startsWith("/docs/") && path.endsWith(".md")) {
    return `/llm${path}`;
  }
  if ((path === "/docs" || path.startsWith("/docs/")) && MARKDOWN.test(request.headers.get("accept") ?? "")) {
    return `/llm${path}.md`;
  }
  if (path.startsWith("/llm/") && !path.endsWith(".md")) return `${path}.md`;
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const target = markdownPath(url, request);
    if (target) {
      const markdown = await env.ASSETS.fetch(new URL(target, url).toString());
      if (markdown.ok) {
        return new Response(markdown.body, {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=300",
            vary: "Accept",
          },
        });
      }
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.append("vary", "Accept");
    return new Response(response.body, { status: response.status, headers });
  },
};
