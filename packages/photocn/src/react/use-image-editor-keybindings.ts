import { useEffect, useRef, type RefObject } from "react";

export interface UseImageEditorKeybindingsOptions {
  enabled: boolean;
  /** Editor root; with several editors on a page only the last one touched reacts. */
  rootRef: RefObject<HTMLElement | null>;
  undo: () => void;
  redo: () => void;
  onEscape?: () => void;
}

const mounted = new Set<RefObject<HTMLElement | null>>();
let lastActive: RefObject<HTMLElement | null> | null = null;

function isActive(rootRef: RefObject<HTMLElement | null>): boolean {
  if (mounted.size <= 1) return true;
  const root = rootRef.current;
  const focused = document.activeElement;
  if (root && focused && focused !== document.body && root.contains(focused)) {
    return true;
  }
  return lastActive === rootRef;
}

function isEditableElement(element: Element): boolean {
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (element as HTMLElement).isContentEditable;
}

/**
 * Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z or Ctrl+Y redo, Escape clears a draft crop.
 */
export function useImageEditorKeybindings({
  enabled,
  rootRef,
  undo,
  redo,
  onEscape,
}: UseImageEditorKeybindingsOptions): void {
  const handlers = useRef({ undo, redo, onEscape });
  handlers.current = { undo, redo, onEscape };

  useEffect(() => {
    if (!enabled) return;
    mounted.add(rootRef);
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        lastActive = rootRef;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (target && isEditableElement(target)) return;
      if (!isActive(rootRef)) return;

      if (event.key === "Escape" && handlers.current.onEscape) {
        event.preventDefault();
        handlers.current.onEscape();
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handlers.current.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        handlers.current.redo();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      mounted.delete(rootRef);
      if (lastActive === rootRef) lastActive = null;
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, rootRef]);
}
