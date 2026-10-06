"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BookmarkPlusIcon,
  EllipsisIcon,
  FolderOpenIcon,
  ImagePlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { downloadRecipe, parseRecipe } from "photocn";
import { useImageEditor, type ImageEditorToolId } from "photocn/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { ImageEditorCanvas } from "./canvas";
import { ImageEditorExportDialog } from "./export-dialog";
import { useMediaQuery, MOBILE_QUERY } from "./layout";
import { ImageEditorToolPanel } from "./tool-panel";
import {
  ImageEditorCompareButton,
  ImageEditorRedoButton,
  ImageEditorUndoButton,
  type EditorToolbarTool,
} from "./toolbar";

export interface ImageEditorCompactLayoutProps {
  tools: readonly EditorToolbarTool[];
  panels?: Partial<Record<ImageEditorToolId, ReactNode>>;
  showOpenButton?: boolean;
  showRecipes?: boolean;
  toolbarExtra?: ReactNode;
  onSave?: Parameters<typeof ImageEditorExportDialog>[0]["onSave"];
  /**
   * Where the active tool's panel goes: a bottom drawer (phones) or inline
   * under the canvas (a narrow editor on a big screen). Default: by viewport.
   */
  panelMode?: "drawer" | "inline";
  className?: string;
}

/** Sheet heights as a fraction of the viewport: peek and expanded. */
const SNAP_POINTS = [0.42, 0.9] as const;

/**
 * The phone layout: canvas first, a thumb-reachable tool bar at the bottom,
 * and the active tool's controls in a drawer that leaves the photo visible.
 */
export function ImageEditorCompactLayout({
  tools,
  panels,
  showOpenButton = true,
  showRecipes = true,
  toolbarExtra,
  onSave,
  panelMode,
  className,
}: ImageEditorCompactLayoutProps) {
  const editor = useImageEditor();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const mode = panelMode ?? (isMobile ? "drawer" : "inline");
  const [panelOpen, setPanelOpen] = useState(false);
  const [snap, setSnap] = useState<number>(SNAP_POINTS[0]);
  const activeTool = tools.find((tool) => tool.value === editor.tool);

  const selectTool = (value: string) => {
    if (value === editor.tool) {
      setPanelOpen((open) => !open);
      return;
    }
    editor.setTool(value);
    setPanelOpen(true);
    setSnap(SNAP_POINTS[0]);
  };

  // Keep the photo above the drawer: pad the canvas by the drawer's peek height.
  // The canvas sits above the bottom tool bar (~3.25rem), so this leaves
  // ~1.5rem between the photo and the sheet: room for the 44px crop handles.
  const drawerInset =
    mode === "drawer" && panelOpen ? `calc(${SNAP_POINTS[0] * 100}dvh - 1.75rem)` : undefined;

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col bg-background", className)}
      data-panel-mode={mode}
      data-slot="image-editor-compact"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2 pt-[env(safe-area-inset-top)]">
        <ImageEditorUndoButton className="size-11" />
        <ImageEditorRedoButton className="size-11" />
        <div className="ml-auto flex items-center gap-1">
          <ImageEditorCompareButton className="size-11" showLabel={false} variant="ghost" />
          {toolbarExtra}
          <ImageEditorExportDialog onSave={onSave} />
          <CompactMenu showOpenButton={showOpenButton} showRecipes={showRecipes} />
        </div>
      </header>

      <div
        className="min-h-0 flex-1 transition-[padding] duration-200"
        style={{ paddingBottom: drawerInset }}
      >
        <ImageEditorCanvas className="p-2" padding={12} showOpenButton={showOpenButton} />
      </div>

      {mode === "inline" && panelOpen ? (
        <div className="max-h-[45%] min-h-0 shrink-0 overflow-y-auto border-t" data-slot="image-editor-inline-panel">
          <ImageEditorToolPanel panels={panels} />
        </div>
      ) : null}

      <CompactToolBar activeTool={editor.tool} disabled={!editor.hasImage || editor.disabled} onSelect={selectTool} tools={tools} />

      {mode === "drawer" ? (
        <PanelSheet
          label={activeTool?.label ?? "Tool"}
          onOpenChange={setPanelOpen}
          onSnapChange={setSnap}
          open={panelOpen}
          snap={snap}
        >
          <div className="flex items-center gap-1 border-b px-2 pb-1">
            <CompactToolBar
              activeTool={editor.tool}
              className="flex-1 border-0 pb-0"
              disabled={editor.disabled}
              onSelect={(value) => editor.setTool(value)}
              tools={tools}
            />
            <Button
              aria-label="Close panel"
              className="size-11 shrink-0"
              onClick={() => setPanelOpen(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            <ImageEditorToolPanel panels={panels} />
          </div>
        </PanelSheet>
      ) : null}
    </div>
  );
}

/** Horizontally scrollable tool picker with 44px targets. */
export function CompactToolBar({
  tools,
  activeTool,
  disabled,
  onSelect,
  className,
}: {
  tools: readonly EditorToolbarTool[];
  activeTool: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Editor tools"
      className={cn(
        "flex shrink-0 gap-1 overflow-x-auto border-t px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] [scrollbar-width:none]",
        className,
      )}
      data-slot="image-editor-compact-tools"
    >
      {tools.map((tool) => {
        const Icon = tool.icon;
        const active = tool.value === activeTool;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "flex min-h-11 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              active && "bg-primary text-primary-foreground",
            )}
            disabled={disabled || tool.disabled}
            key={tool.value}
            onClick={() => onSelect(tool.value)}
            type="button"
          >
            <Icon aria-hidden="true" className="size-5" />
            {tool.label}
          </button>
        );
      })}
    </nav>
  );
}

function CompactMenu({ showOpenButton, showRecipes }: { showOpenButton: boolean; showRecipes: boolean }) {
  const editor = useImageEditor();
  const recipeInput = useRef<HTMLInputElement | null>(null);
  const loadRecipe = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      await editor.recipes.apply(parseRecipe(await file.text()));
    } catch (error) {
      console.error("[photocn] Failed to load recipe", error);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label="More" className="size-11" size="icon" type="button" variant="ghost">
              <EllipsisIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-48">
          {showOpenButton ? (
            <DropdownMenuItem onClick={() => void editor.openFile()}>
              <ImagePlusIcon /> Open image
            </DropdownMenuItem>
          ) : null}
          {showRecipes ? (
            <>
              <DropdownMenuItem
                disabled={!editor.recipes.current}
                onClick={() => editor.recipes.current && downloadRecipe(editor.recipes.current, editor.filename)}
              >
                <BookmarkPlusIcon /> Save look
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => recipeInput.current?.click()}>
                <FolderOpenIcon /> Load look
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!editor.hasImage} onClick={editor.resetAll} variant="destructive">
            <RotateCcwIcon /> Reset all edits
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        accept="application/json"
        aria-hidden="true"
        className="hidden"
        onChange={loadRecipe}
        ref={recipeInput}
        tabIndex={-1}
        type="file"
      />
    </>
  );
}

/**
 * A non-modal bottom sheet styled like shadcn's Drawer. vaul's Drawer is
 * always modal (it blocks the page), but the photo must stay touchable while
 * a panel is open, e.g. to drag the crop frame. Drag the handle between the
 * two snap points; drag down to close.
 */
function PanelSheet({
  open,
  onOpenChange,
  snap,
  onSnapChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snap: number;
  onSnapChange: (snap: number) => void;
  label: string;
  children: ReactNode;
}) {
  const drag = useRef<{ pointerId: number; startY: number; startSnap: number } | null>(null);
  const [dragSnap, setDragSnap] = useState<number | null>(null);
  const height = dragSnap ?? snap;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startSnap: snap };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const next = d.startSnap - (event.clientY - d.startY) / window.innerHeight;
    setDragSnap(Math.min(0.96, Math.max(0.08, next)));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    const released = dragSnap ?? snap;
    setDragSnap(null);
    if (released < SNAP_POINTS[0] * 0.6) {
      onOpenChange(false);
      return;
    }
    const nearest = SNAP_POINTS.reduce((best, point) =>
      Math.abs(point - released) < Math.abs(best - released) ? point : best,
    );
    onSnapChange(nearest);
  };

  return (
    <section
      aria-hidden={!open}
      aria-label={`${label} controls`}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-xl border-t bg-popover text-sm text-popover-foreground shadow-lg",
        dragSnap === null && "transition-[height,transform] duration-300 ease-out",
        !open && "pointer-events-none translate-y-full",
      )}
      data-open={open || undefined}
      data-slot="image-editor-drawer"
      inert={!open}
      style={{ height: `${height * 100}dvh` }}
    >
      <div
        aria-label="Resize panel"
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="separator"
      >
        <span className="h-1.5 w-12 rounded-full bg-muted" />
      </div>
      {children}
    </section>
  );
}

