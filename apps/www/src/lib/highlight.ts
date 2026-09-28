import "server-only";

import { codeToHtml } from "shiki";

export function highlight(code: string, lang: "tsx" | "bash" | "json" = "tsx") {
  return codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
