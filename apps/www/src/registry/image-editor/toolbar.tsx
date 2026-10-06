"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIcon,
  EyeIcon,
  ImagePlusIcon,
  RotateCcwIcon,
  CropIcon,
  DropletsIcon,
  InfoIcon,
  LayersIcon,
  Redo2Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Undo2Icon,
  WandSparklesIcon,
  ZoomInIcon,
  ZoomOutIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useImageEditor } from "photocn/react";

export type EditorToolbarToolId =
  | "adjust"
  | "compose"
  | "curves"
  | "effects"
  | "filters"
  | "blender"
  | "blur"
  | "metadata";

export interface EditorToolbarTool {
  value: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

export interface EditorToolbarAction {
  value: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  variant?: ComponentProps<typeof Button>["variant"];
}

export interface EditorToolbarProps {
  activeTool?: string;
  tools?: readonly EditorToolbarTool[];
  actions?: readonly EditorToolbarAction[];
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  onToolChange?: (tool: string) => void;
}

export const editorToolbarDefaultTools = [
  { value: "adjust", label: "Adjust", icon: SlidersHorizontalIcon },
  { value: "compose", label: "Crop", icon: CropIcon },
  { value: "curves", label: "Curves", icon: ActivityIcon },
  { value: "effects", label: "Effects", icon: SparklesIcon },
  { value: "filters", label: "Filters", icon: WandSparklesIcon },
  { value: "blender", label: "Blender", icon: LayersIcon },
  { value: "blur", label: "Blur", icon: DropletsIcon },
  { value: "metadata", label: "Metadata", icon: InfoIcon },
] as const satisfies readonly EditorToolbarTool[];

export const editorToolbarActionPresets = {
  undo: { value: "undo", label: "Undo", icon: Undo2Icon },
  redo: { value: "redo", label: "Redo", icon: Redo2Icon },
  zoomOut: { value: "zoom-out", label: "Zoom out", icon: ZoomOutIcon },
  zoomIn: { value: "zoom-in", label: "Zoom in", icon: ZoomInIcon },
} as const;

export function EditorToolbar({
  activeTool,
  tools = editorToolbarDefaultTools,
  actions = [],
  disabled = false,
  children,
  className,
  onToolChange,
}: EditorToolbarProps) {
  const handleToolChange = (value: string) => {
    if (value) {
      onToolChange?.(value);
    }
  };

  return (
    <TooltipProvider>
      <div
        aria-label="Editor tools"
        className={cn(
          "flex w-full min-w-0 flex-wrap items-center gap-2",
          className,
        )}
        data-slot="editor-toolbar"
        role="toolbar"
      >
        {tools.length > 0 ? (
          <ToggleGroup
            aria-label="Editor mode"
            className="w-full min-w-0 has-[>*:nth-child(6)]:justify-between"
            onValueChange={handleToolChange}
            size="sm"
            type="single"
            value={activeTool}
            variant="outline"
          >
            {tools.map((tool) => (
              <ToolbarToolItem
                disabled={disabled || tool.disabled}
                key={tool.value}
                tool={tool}
              />
            ))}
          </ToggleGroup>
        ) : null}

        {children ? (
          <div
            className="flex min-w-0 items-center gap-2"
            data-slot="editor-toolbar-extra"
          >
            {children}
          </div>
        ) : null}

        {actions.length > 0 ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {actions.map((action) => (
              <ToolbarActionButton
                action={{
                  ...action,
                  disabled: disabled || action.disabled,
                }}
                key={action.value}
              />
            ))}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function ToolbarToolItem({
  disabled,
  tool,
}: {
  disabled?: boolean;
  tool: EditorToolbarTool;
}) {
  const Icon = tool.icon;

  // No Tooltip wrapper here — TooltipTrigger asChild merges its own
  // `data-state="open|closed"` onto the ToggleGroupItem, clobbering
  // Radix Toggle's `data-state="on|off"`. That made every active-state
  // class (`data-[state=on]:...`) a no-op. Native `title` gives hover
  // hints; aria-label keeps screen-reader support.
  return (
    <ToggleGroupItem
      aria-label={tool.label}
      // Strong active state — primary fill so the selected tool reads
      // unambiguously as "you are here" instead of looking like a hover.
      // Keeps hover at bg-accent for affordance.
      className="min-w-0 flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground data-[state=on]:shadow-inner data-[state=on]:[&_svg]:scale-110"
      disabled={disabled}
      title={tool.label}
      value={tool.value}
    >
      <Icon aria-hidden="true" />
      <span className="sr-only">{tool.label}</span>
    </ToggleGroupItem>
  );
}

function ToolbarActionButton({ action }: { action: EditorToolbarAction }) {
  const Icon = action.icon;
  const button = (
    <Button
      aria-label={action.label}
      disabled={action.disabled}
      onClick={action.onSelect}
      size="icon-sm"
      type="button"
      variant={action.variant ?? "ghost"}
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      <span className="sr-only">{action.label}</span>
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {action.disabled ? <span className="inline-flex">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent side="bottom">{action.label}</TooltipContent>
    </Tooltip>
  );
}

export interface ImageEditorToolbarProps
  extends Omit<EditorToolbarProps, "activeTool" | "onToolChange"> {}

/**
 * Tool switcher (toggle group) bound to the editor's active tool. Pass
 * `tools` to show a subset or your own tools; pass `actions`/children for
 * extra buttons.
 */
export function ImageEditorToolbar({ disabled, ...props }: ImageEditorToolbarProps) {
  const editor = useImageEditor();
  return (
    <EditorToolbar
      activeTool={editor.tool}
      disabled={disabled || editor.disabled || editor.isLoading}
      onToolChange={editor.setTool}
      {...props}
    />
  );
}

type ActionButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  /** Show the text label next to the icon. Default `false` (icon + tooltip). */
  showLabel?: boolean;
};

function EditorActionButton({
  icon: Icon,
  label,
  showLabel,
  disabled,
  onClick,
  size,
  variant = "ghost",
  ...props
}: ActionButtonProps & {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  const button = (
    <Button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      size={size ?? (showLabel ? "sm" : "icon-sm")}
      type="button"
      variant={variant}
      {...props}
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      {showLabel ? label : <span className="sr-only">{label}</span>}
    </Button>
  );
  if (showLabel) return button;
  // Own provider so the buttons work anywhere, even in apps without one.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? <span className="inline-flex">{button}</span> : button}
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Undo the last edit (Cmd/Ctrl+Z). */
export function ImageEditorUndoButton(props: ActionButtonProps) {
  const editor = useImageEditor();
  return (
    <EditorActionButton
      disabled={editor.disabled || !editor.history.canUndo}
      icon={Undo2Icon}
      label="Undo"
      onClick={editor.history.undo}
      {...props}
    />
  );
}

/** Redo (Cmd/Ctrl+Shift+Z). */
export function ImageEditorRedoButton(props: ActionButtonProps) {
  const editor = useImageEditor();
  return (
    <EditorActionButton
      disabled={editor.disabled || !editor.history.canRedo}
      icon={Redo2Icon}
      label="Redo"
      onClick={editor.history.redo}
      {...props}
    />
  );
}

/** Open an image from disk. */
export function ImageEditorOpenButton({ showLabel = true, ...props }: ActionButtonProps) {
  const editor = useImageEditor();
  return (
    <EditorActionButton
      disabled={editor.disabled || editor.isLoading}
      icon={ImagePlusIcon}
      label="Open"
      onClick={() => void editor.openFile()}
      showLabel={showLabel}
      variant="outline"
      {...props}
    />
  );
}

/** Discard every edit. */
export function ImageEditorResetButton({ showLabel = true, ...props }: ActionButtonProps) {
  const editor = useImageEditor();
  return (
    <EditorActionButton
      disabled={editor.disabled || !editor.hasImage}
      icon={RotateCcwIcon}
      label="Reset"
      onClick={editor.resetAll}
      showLabel={showLabel}
      variant="outline"
      {...props}
    />
  );
}

/** Press and hold to see the original (geometry is kept). */
export function ImageEditorCompareButton({
  showLabel = true,
  ...props
}: ActionButtonProps) {
  const editor = useImageEditor();
  const release = () => editor.compare.setActive(false);
  return (
    <EditorActionButton
      aria-pressed={editor.compare.active}
      disabled={editor.disabled || !editor.hasImage}
      icon={EyeIcon}
      label="Original"
      onBlur={release}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") editor.compare.setActive(true);
      }}
      onKeyUp={release}
      onPointerCancel={release}
      onPointerDown={() => editor.compare.setActive(true)}
      onPointerLeave={release}
      onPointerUp={release}
      showLabel={showLabel}
      variant="outline"
      {...props}
    />
  );
}

