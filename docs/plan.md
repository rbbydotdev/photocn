# photocn: next-level plan

Reference: [mapcn](https://github.com/AnmolSaini16/mapcn) / [mapcn.dev](https://www.mapcn.dev). Domain: **photocn.dev** (Cloudflare). GitHub/X: **rbbydotdev**.

## Findings that shape the plan

- **Responsive: no.** At 390px the editor keeps its desktop two-column layout: the canvas is tiny, only 5 of 8 tools fit, the adjustment tabs overlap, the site header has no mobile menu, and the docs nav is hidden with no way to open it.
- **mapcn's shape:**
  - home is hero + a bento of *live* examples + footer only;
  - docs pages show the preview on top, with collapsed code and "View Code" below;
  - an 8-item blocks page (iframe previews, a copy-install button, open-in-new-tab);
  - `/llms.txt` + `/llm/<item>`, and a static `banner.png` used as the OG image;
  - footer columns Product / Community (with GitHub Sponsors) / Resources;
  - README: centered title, one-liner, links, banner, emoji features, license.
- **Agent docs:** agents look for `llms.txt` (llmstxt.org), `.md` copies of pages (shadcn, Vercel) and content negotiation on `Accept: text/markdown` (Vercel, Next.js docs). Each page should also offer "Copy page / Open in ChatGPT or Claude".
- **Takumi 2.14** (`takumi-js`): JSX + Tailwind (`tw`) → PNG/WebP/GIF. Its `ImageResponse` is a drop-in for `next/og`. Native on Node, WASM elsewhere.
- **Prior art:** [xdadda/mini-photo-editor](https://github.com/xdadda/mini-photo-editor) is MIT (© 2025 xdadda). Our WebGL code is a modified fork of it, which in turn credits glfx.js (MIT, Evan Wallace). **We have no LICENSE file yet.**
- **Tooling on this machine:** wrangler is signed in (account `rbbydotdev`: workers/pages write, zone read), `gh` is signed in as `rbbydotdev`, and ffmpeg is installed. No dashboard needed.

## Phase 0: Foundation (ship pipeline first)

1. **License:** add `LICENSE` (MIT, © 2026 rbbydotdev) and `THIRD_PARTY_NOTICES.md` (mini-photo-editor and glfx.js MIT texts). Add per-file headers in `packages/photocn/src/gl/*`.
2. **Repo:**
   - push to `github.com/rbbydotdev/photocn` (public);
   - add `.github/FUNDING.yml` (`github: [rbbydotdev]`) and `AGENTS.md` (stack, structure, conventions);
   - add CI: typecheck + tests + build.
3. **Hosting on photocn.dev:**
   - Next `output: "export"` → Cloudflare Workers static assets, plus a ~20-line Worker that serves `/docs/x.md` when the request has `Accept: text/markdown`;
   - custom domain via `wrangler.jsonc` `routes: [{ pattern: "photocn.dev", custom_domain: true }]`;
   - `pnpm deploy` = build + `wrangler deploy`;
   - registry URL becomes `https://photocn.dev/r/{name}.json`.
   - (Alternative: `@opennextjs/cloudflare` for full Next on Workers. Not needed, since everything is static.)

## Phase 1: Mobile editor (the biggest product gap)

The layout keys off the editor's own width (`@container`), not the viewport, so it also works when embedded narrow on desktop.

- **Below ~640px:**
  - canvas full width on top;
  - a bottom tool bar (scrollable icons, 44px targets);
  - the active panel in a shadcn **Drawer** (vaul) with snap points: peek = the main slider, full = the whole panel;
  - toolbar actions collapse into a ⋯ DropdownMenu;
  - Export uses shadcn's responsive-dialog pattern (Dialog on desktop, Drawer on mobile).
- **Touch:**
  - pinch to zoom inside the crop frame;
  - larger crop and corner handles, safe-area insets;
  - no hover-only controls;
  - hold-to-compare still works.
- **Site:** a hamburger Sheet nav (like mapcn), docs nav in that Sheet, and the ToC hidden below xl.
- **Verify:** Playwright at iPhone/Pixel sizes, plus a real iOS Safari check (WebGL2 and OffscreenCanvas need iOS 17+).

## Phase 2: Branding, copy, site redesign

**Name:** `photocn` everywhere (lowercase, like mapcn).

**Copy:** short, technical, no jargon.

- **Proposed:**
  - H1: **"Photo editing, made simple"**
  - Sub: "Ready-to-use, customizable photo editor components for React. Built on WebGL. Styled with Tailwind."
  - CTAs: **Get Started** · **View Components**, then a small ghost button: **Copy prompt for your agent**.
  - Footer blurb: "Free & open-source photo editor components for React."
- **Removed:** the "GPU photo editing for shadcn/ui" badge, "A photo editor you own…", Lego, megapixels, "off the main thread" on the home page.

**Home:** hero → a bento of *live* examples (lazy-mounted when they scroll into view; each holds a WebGL context and a worker):

| Tile | Shows |
|---|---|
| Full editor (wide) | everything |
| Filters (phone) | preset strip |
| Before / after | compare slider |
| Straighten | crop frame + dial |
| Curves | curve + histogram |
| Avatar | 1:1 crop dialog |
| Looks | one recipe applied to 4 photos (wide) |

**Header:** logo · Docs · Components · Blocks · ⌘K search · GitHub stars (`rbbydotdev/photocn`) · theme toggle. On mobile, a Sheet.

**Footer:**
- brand column with GitHub (`github.com/rbbydotdev/photocn`) and X (`x.com/rbbydotdev`);
- **Product:** Docs, Components, Blocks;
- **Community:** GitHub, Sponsor (`github.com/sponsors/rbbydotdev`);
- **Resources:** shadcn/ui, Tailwind CSS, mini-photo-editor (prior art);
- "© 2026 photocn. MIT licensed."

**Docs** (mapcn layout):
- left sidebar;
- one page per component (Canvas, Toolbar, Adjustments, Filters, Curves, Crop, Blur, Blend, Metadata, Export, Recipes, Command menu, plus API reference);
- each example: preview on top, code collapsed with "View Code" and copy;
- prop tables, "On this page" ToC, prev/next, a custom 404.

**Content:** migrate the docs to MDX via **content-collections**. This gives one source for both the HTML page and the `.md` copy.

## Phase 3: Blocks (`@photocn/*`)

`registry:block` items depend on the core pieces (`@photocn/image-editor-*`). Shown on `/blocks`: iframe preview from `/view/[name]`, Preview/Code tabs, a copy `npx shadcn add @photocn/<block>` button, open in a new tab.

| Block | What |
|---|---|
| `editor` | the full editor (today's `<ImageEditor/>`) |
| `editor-minimal` | canvas + adjust + export |
| `editor-mobile` | bottom toolbar + drawer panels |
| `avatar-cropper` | dialog: pick → 1:1 crop → upload |
| `upload-editor` | drop zone → edit → `onSave` upload |
| `filter-picker` | phone-style preset strip |
| `before-after` | draggable compare slider |
| `batch-looks` | apply one recipe to many photos |

Then submit `@photocn` to shadcn's registry directory, so `npx shadcn add @photocn/editor` works with no `components.json` edits.

## Phase 4: Agent-friendly

- `/llms.txt` (llmstxt.org format: components, blocks, install, a usage snippet) and `/llms-full.txt`.
- `/docs/<page>.md` for every page, `Accept: text/markdown` negotiation (in the Worker), and `<link rel="alternate" type="text/markdown">`.
- `/llm/<registry-item>` markdown per item, generated from `registry.json` (mapcn pattern).
- On every docs page, a split button: **Copy page** · View as Markdown · Open in ChatGPT · Open in Claude.
- **Copy prompt for your agent** on the home page:
  > Read https://photocn.dev/llms.txt, then add photocn to this project: run `npx shadcn@latest add @photocn/editor` … Preserve the existing shadcn/ui setup. Don't rewrite the registry files unless the command fails; if it fails, read https://photocn.dev/r/editor.json and install what it lists.
- Docs page for the shadcn MCP server (`npx shadcn@latest mcp init`), and `AGENTS.md` in the repo.

## Phase 5: Images that stay in sync

- **One `<Banner/>` JSX component, rendered by Takumi**, with the logo, tagline and a screenshot of the bento:
  - `app/opengraph-image.tsx` (static at build time) for the site;
  - a per-docs-page OG image (title + description on the same template);
  - `scripts/banner.tsx` → `public/banner.png` for the README.
- **`pnpm assets`:**
  - Playwright screenshots of the live bento / editor (light + dark);
  - recordings of slider drags, filter switching and crop straighten → ffmpeg → `.gif` (README) and `.webm`/`.mp4` (site, lighter);
  - then Takumi renders the banner and OG images from the fresh screenshots.

  Re-run it whenever the branding, copy or UI changes.
- **Demo photos:** keep curated, free-licensed photos (currently Unsplash via picsum) with a `CREDITS.md`, or swap in your own.

## Phase 6: README + launch

- **README in the mapcn shape:**
  - centered **photocn** title and one-liner;
  - links (Get Started · Installation · Components · Blocks);
  - banner.png, then demo GIFs;
  - ✨ features (emoji bullets);
  - install, usage (full / composed / headless);
  - **Prior art** (credit xdadda/mini-photo-editor and glfx.js);
  - Contributing, License (MIT).
- **Launch:** `npm publish photocn`, deploy, shadcn directory PR.

## Decisions needed

1. Hero copy: go with "Photo editing, made simple" (above), or alternatives?
2. OK to create **public** `github.com/rbbydotdev/photocn` and push now?
3. Is GitHub Sponsors enabled for rbbydotdev (for the footer and FUNDING.yml)?
4. Hosting: static export + a small Worker (recommended) vs OpenNext?
5. Demo photos: keep the Unsplash/picsum set with credits, or use your own?
