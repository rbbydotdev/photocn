"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import {
  EyeOffIcon,
  ImagePlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  Undo2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useImageEditor } from "photocn/react";

import { editorToolbarDefaultTools } from "./toolbar";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export interface EditorCommandItem {
  value: string;
  label: string;
  keywords?: string[];
  shortcut?: string;
  disabled?: boolean;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect?: (value: string) => void;
}

export interface EditorCommandGroup {
  heading?: string;
  items: readonly EditorCommandItem[];
}

export interface EditorCommandDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  groups: readonly EditorCommandGroup[];
  title?: string;
  description?: string;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

export function EditorCommandDialog({
  open,
  onOpenChange,
  groups,
  title = "Editor commands",
  description = "Search editor tools and actions.",
  placeholder = "Search commands...",
  emptyLabel = "No commands found.",
  className,
}: EditorCommandDialogProps) {
  return (
    <CommandDialog
      className={className}
      description={description}
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    >
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        {groups.map((group, groupIndex) => (
          <CommandGroup
            heading={group.heading}
            key={group.heading ?? `group-${groupIndex}`}
          >
            {group.items.map((item) => {
              const Icon = item.icon;

              return (
                <CommandItem
                  disabled={item.disabled}
                  key={item.value}
                  keywords={item.keywords}
                  onSelect={(value) => item.onSelect?.(value)}
                  value={item.value}
                >
                  {Icon ? <Icon aria-hidden="true" /> : null}
                  <span>{item.label}</span>
                  {item.shortcut ? (
                    <CommandShortcut>{item.shortcut}</CommandShortcut>
                  ) : null}
                </CommandItem>
              );
            })}
            {groupIndex < groups.length - 1 ? <CommandSeparator /> : null}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export interface ImageEditorCommandMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Toggle with Cmd/Ctrl+K. Default `true`. */
  shortcut?: boolean;
  /** Extra groups appended after the built-in ones. */
  groups?: readonly EditorCommandGroup[];
}

/** Command palette for tools, history and filter presets (Cmd/Ctrl+K). */
export function ImageEditorCommandMenu({
  open: openProp,
  onOpenChange,
  shortcut = true,
  groups = [],
}: ImageEditorCommandMenuProps) {
  const editor = useImageEditor();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        const root = editor.rootRef.current;
        const inside =
          !root || root.contains(document.activeElement) || document.activeElement === document.body;
        if (!inside) return;
        event.preventDefault();
        setOpenState((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut, editor.rootRef]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const builtIn: EditorCommandGroup[] = [
    {
      heading: "Tools",
      items: editorToolbarDefaultTools.map((tool) => ({
        value: `tool:${tool.value}`,
        label: tool.label,
        icon: tool.icon,
        onSelect: run(() => editor.setTool(tool.value)),
      })),
    },
    {
      heading: "Edit",
      items: [
        {
          value: "undo",
          label: "Undo",
          icon: Undo2Icon,
          shortcut: "⌘Z",
          disabled: !editor.history.canUndo,
          onSelect: run(editor.history.undo),
        },
        {
          value: "redo",
          label: "Redo",
          icon: Redo2Icon,
          shortcut: "⇧⌘Z",
          disabled: !editor.history.canRedo,
          onSelect: run(editor.history.redo),
        },
        {
          value: "open",
          label: "Open image…",
          icon: ImagePlusIcon,
          onSelect: run(() => void editor.openFile()),
        },
        {
          value: "reset",
          label: "Reset all edits",
          icon: RotateCcwIcon,
          onSelect: run(editor.resetAll),
        },
      ],
    },
    {
      heading: "Filters",
      items: [
        {
          value: "filter:none",
          label: "No filter",
          icon: EyeOffIcon,
          onSelect: run(() => void editor.filters.select(null)),
        },
        ...editor.filters.presets.map((preset) => ({
          value: `filter:${preset.label}`,
          label: `Filter: ${preset.label}`,
          keywords: ["filter", "lut", preset.label],
          icon: WandSparklesIcon,
          onSelect: run(() => void editor.filters.select(preset)),
        })),
      ],
    },
  ];

  return (
    <EditorCommandDialog
      groups={[...builtIn, ...groups]}
      onOpenChange={setOpen}
      open={open}
    />
  );
}

