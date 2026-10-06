/**
 * photocn.dev edge worker. Everything is static (Next export → Workers static
 * assets); this only runs for /docs* to serve the markdown twin of a page to
 * agents that ask for it with `Accept: text/markdown` (see docs/plan.md).
 */
interface Env {
  ASSETS: { fetch(request: Request | string): Promise<Response> };
}

const MARKDOWN = /\btext\/markdown\b/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const wantsMarkdown =
      MARKDOWN.test(request.headers.get("accept") ?? "") && !url.pathname.endsWith(".md");

    if (wantsMarkdown) {
      const path = url.pathname.replace(/\/$/, "") || "/docs";
      const markdown = await env.ASSETS.fetch(new URL(`${path}.md`, url).toString());
      if (markdown.ok) {
        return new Response(markdown.body, {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
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
