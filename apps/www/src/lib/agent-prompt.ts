import { siteUrl } from "./site";

/** What "Copy prompt for your agent" puts on the clipboard. */
export const agentPrompt = `Read the photocn agent instructions at ${siteUrl}/llms.txt, then add photocn to this project.

1. Make sure shadcn/ui is set up with Base UI (npx shadcn@latest init -b base). The "style" in components.json must start with "base-".
2. Register photocn: npx shadcn@latest registry add @photocn=${siteUrl}/r/{name}.json
3. Install the editor: npx shadcn@latest add @photocn/image-editor
4. Add a page that renders <ImageEditor src="..." className="h-dvh" /> from "@/components/image-editor/image-editor" (it's a client component).

Keep the existing Tailwind CSS and shadcn/ui setup. Don't rewrite the installed registry files unless the command fails; if it fails, read ${siteUrl}/r/image-editor.json and install the dependencies it lists.`;
