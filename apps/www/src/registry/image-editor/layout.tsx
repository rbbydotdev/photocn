"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

export interface ImageEditorLayoutProps {
  children?: ReactNode;
  sidebar?: ReactNode;
  toolbar?: ReactNode;
  resizableSidebar?: boolean;
  sidebarDefaultSize?: number | string;
  sidebarMinSize?: number | string;
  sidebarMaxSize?: number | string;
  canvasMinSize?: number | string;
  className?: string;
  contentClassName?: string;
  canvasClassName?: string;
  sidebarClassName?: string;
  toolbarClassName?: string;
}

export function ImageEditorLayout({
  children,
  sidebar,
  toolbar,
  resizableSidebar = true,
  sidebarDefaultSize = "22rem",
  sidebarMinSize = "18rem",
  sidebarMaxSize = "34rem",
  canvasMinSize = "24rem",
  className,
  contentClassName,
  canvasClassName,
  sidebarClassName,
  toolbarClassName,
}: ImageEditorLayoutProps) {
  const main = (
    <main
      className={cn(
        "h-full min-h-0 overflow-hidden bg-muted/30 p-3 md:p-4",
        canvasClassName,
      )}
      data-slot="editor-canvas"
    >
      {children}
    </main>
  );
  const sidebarPanel = sidebar ? (
    <aside
      className={cn(
        "h-full min-h-0 border-t bg-background md:border-l md:border-t-0",
        sidebarClassName,
      )}
      data-slot="editor-sidebar"
    >
      <div className="@container/sidebar h-full overflow-x-hidden overflow-y-auto">
        {sidebar}
      </div>
    </aside>
  ) : null;

  return (
    <div
      className={cn(
        "grid min-h-0 w-full bg-background text-foreground",
        toolbar ? "grid-rows-[auto_1fr]" : "grid-rows-[1fr]",
        className,
      )}
      data-slot="image-editor-layout"
    >
      {toolbar ? (
        <div
          className={cn(
            "flex min-h-12 items-center gap-2 border-b px-3",
            toolbarClassName,
          )}
          data-slot="editor-toolbar"
        >
          {toolbar}
        </div>
      ) : null}
      {sidebarPanel && resizableSidebar ? (
        <ResizablePanelGroup
          className={cn("min-h-0", contentClassName)}
          data-slot="editor-workspace"
          orientation="horizontal"
        >
          <ResizablePanel
            groupResizeBehavior="preserve-relative-size"
            minSize={canvasMinSize}
          >
            {main}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize={sidebarDefaultSize}
            groupResizeBehavior="preserve-pixel-size"
            maxSize={sidebarMaxSize}
            minSize={sidebarMinSize}
          >
            {sidebarPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div
          className={cn(
            "grid min-h-0 grid-cols-1 md:grid-cols-[1fr_20rem]",
            contentClassName,
          )}
          data-slot="editor-workspace"
        >
          {main}
          {sidebarPanel}
        </div>
      )}
    </div>
  );
}

/** Width of an element, tracked with a ResizeObserver (0 until measured). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** `window.matchMedia(query).matches`, kept in sync (false during SSR). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Phones and small tablets: panels go in a bottom drawer. */
export const MOBILE_QUERY = "(max-width: 767px)";
/** Below this editor width the compact (mobile) layout is used. */
export const COMPACT_WIDTH = 640;

