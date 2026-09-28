import { DocsSidebar } from "@/components/site/docs-sidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-10 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="hidden md:block">
        <div className="sticky top-24">
          <DocsSidebar />
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
