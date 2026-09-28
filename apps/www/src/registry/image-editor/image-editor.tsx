"use client";

import type { ReactNode } from "react";
import { AlertCircleIcon } from "lucide-react";
import {
  errorMessage,
  ImageEditorProvider,
  useImageEditor,
  useImageEditorState,
  type ImageEditorApi,
  type ImageEditorExportResult,
  type ImageEditorToolId,
  type UseImageEditorStateOptions,
} from "photocn/react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ImageEditorCanvas } from "./canvas";
import { ImageEditorExportDialog } from "./export-dialog";
import { ImageEditorHistogram } from "./histogram";
import { ImageEditorLayout } from "./layout";
import { ImageEditorRecipes } from "./recipes";
import { ImageEditorToolPanel } from "./tool-panel";
import {
  editorToolbarDefaultTools,
  ImageEditorCompareButton,
  ImageEditorOpenButton,
  ImageEditorRedoButton,
  ImageEditorResetButton,
  ImageEditorToolbar,
  ImageEditorUndoButton,
  type EditorToolbarTool,
} from "./toolbar";

export interface ImageEditorProps extends UseImageEditorStateOptions {
  /** Use state you created with `useImageEditorState()` instead of owning it. */
  editor?: ImageEditorApi;
  className?: string;
  /** Tools shown in the sidebar switcher. Default: every built-in tool. */
  tools?: readonly EditorToolbarTool[];
  /** Replace or add sidebar panels per tool id. */
  panels?: Partial<Record<ImageEditorToolId, ReactNode>>;
  /** Show the "Open" button and empty-state picker. Default `true`. */
  showOpenButton?: boolean;
  /** Show recipe save/load buttons. Default `true`. */
  showRecipes?: boolean;
  /** Show the histogram above the tool panel. Default `true`. */
  showHistogram?: boolean;
  /** Extra toolbar content, rendered before the Export button. */
  toolbarExtra?: ReactNode;
  /** Extra content under the active tool panel. */
  sidebarExtra?: ReactNode;
  /** Adds a "Save" button to the export dialog (e.g. upload the result). */
  onSave?: (result: ImageEditorExportResult) => void | Promise<void>;
  /** Rendered inside the provider — e.g. `<ImageEditorCommandMenu />`. */
  children?: ReactNode;
}

/**
 * The complete editor: toolbar, canvas, tool switcher, histogram and panels.
 * Every piece is also exported on its own — copy this file's layout and
 * rearrange them to build your own editor.
 */
export function ImageEditor({ editor, ...props }: ImageEditorProps) {
  if (editor) return <ImageEditorView editor={editor} {...props} />;
  return <OwnedImageEditor {...props} />;
}

function OwnedImageEditor(props: Omit<ImageEditorProps, "editor">) {
  const {
    className: _className,
    tools: _tools,
    panels: _panels,
    showOpenButton: _showOpenButton,
    showRecipes: _showRecipes,
    showHistogram: _showHistogram,
    toolbarExtra: _toolbarExtra,
    sidebarExtra: _sidebarExtra,
    onSave: _onSave,
    children: _children,
    ...options
  } = props;
  const editor = useImageEditorState(options);
  return <ImageEditorView editor={editor} {...props} />;
}

function ImageEditorView({
  editor,
  className,
  tools = editorToolbarDefaultTools,
  panels,
  showOpenButton = true,
  showRecipes = true,
  showHistogram = true,
  toolbarExtra,
  sidebarExtra,
  onSave,
  children,
}: ImageEditorProps & { editor: ImageEditorApi }) {
  return (
    <ImageEditorProvider editor={editor}>
      <TooltipProvider>
        <div
          className={cn("h-full min-h-[640px] w-full", className)}
          data-slot="image-editor"
          ref={editor.rootRef}
        >
          <ImageEditorLayout
            className="h-full"
            sidebar={
              <>
                <div className="border-b bg-background p-3">
                  <ImageEditorToolbar tools={tools} />
                </div>
                {showHistogram ? (
                  <ImageEditorHistogram className="border-b bg-muted/30 px-3 py-2" />
                ) : null}
                <ImageEditorToolPanel panels={panels} />
                {sidebarExtra}
              </>
            }
            sidebarDefaultSize="338px"
            toolbar={
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
                <ImageEditorUndoButton />
                <ImageEditorRedoButton />
                {showOpenButton ? <ImageEditorOpenButton /> : null}
                <ImageEditorStatusBadge />
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {showRecipes ? <ImageEditorRecipes /> : null}
                  <ImageEditorResetButton />
                  <ImageEditorCompareButton />
                  {toolbarExtra}
                  <ImageEditorExportDialog onSave={onSave} />
                </div>
              </div>
            }
          >
            <ImageEditorCanvas showOpenButton={showOpenButton} />
          </ImageEditorLayout>
          {children}
        </div>
      </TooltipProvider>
    </ImageEditorProvider>
  );
}

/** Loading / error indicator; renders nothing once the editor is ready. */
export function ImageEditorStatusBadge() {
  const editor = useImageEditor();
  if (editor.status === "error") {
    const message = errorMessage(editor.error);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="max-w-48" variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <span className="truncate">{message}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">{message}</TooltipContent>
      </Tooltip>
    );
  }
  if (editor.status === "loading") {
    return <Badge variant="outline">Loading</Badge>;
  }
  return null;
}
