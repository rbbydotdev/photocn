import { llmsIndex } from "@/lib/llm";

export const dynamic = "force-static";

export function GET() {
  return new Response(llmsIndex(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
