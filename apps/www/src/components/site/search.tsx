"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export type SearchGroup = { title: string; items: { title: string; href: string }[] };

/** ⌘K docs search over the sidebar pages and blocks. */
export function Search({ groups, className }: { groups: SearchGroup[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        // The editor's own ⌘K menu wins inside an editor.
        if ((event.target as Element | null)?.closest?.("[data-slot=image-editor]")) return;
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <>
      <button
        className={cn(
          "inline-flex h-8 w-48 items-center gap-2 rounded-md border bg-muted/40 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted",
          className,
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <SearchIcon className="size-4" />
        Search docs…
        <Kbd className="ml-auto">⌘K</Kbd>
      </button>
      <CommandDialog description="Search the docs" onOpenChange={setOpen} open={open} title="Search">
        <Command>
          <CommandInput placeholder="Search docs…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup heading={group.title} key={group.title}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.href}
                    onSelect={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                    value={`${group.title} ${item.title}`}
                  >
                    {item.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
