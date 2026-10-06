import { DocsSidebar } from "@/components/site/docs-sidebar";
import { docsNav } from "@/lib/docs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl gap-10 px-4 pt-8 sm:px-6 md:pt-10">
      <aside className="hidden w-52 shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-10">
          <DocsSidebar nav={docsNav} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
