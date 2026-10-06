import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { createMiniGlEditor } from "../dom";
import type {
  EditorColorSpace,
  EditorRenderer,
  LoadableImage,
} from "..";

import { useLatestRef } from "./use-latest-ref";

export type MiniGlEditorImage = LoadableImage;

export interface MiniGlEditorInstance<TRenderer = EditorRenderer> {
  renderer: TRenderer;
  dispose?: () => void;
}

export interface CreateMiniGlEditorOptions<TImage = MiniGlEditorImage> {
  canvas: HTMLCanvasElement;
  image: TImage;
  colorspace: EditorColorSpace;
}

export type CreateMiniGlEditor<
  TRenderer = EditorRenderer,
  TEditor extends MiniGlEditorInstance<TRenderer> = MiniGlEditorInstance<TRenderer>,
  TImage = MiniGlEditorImage,
> = (
  options: CreateMiniGlEditorOptions<TImage>,
) => TEditor | Promise<TEditor>;

export interface MiniGlEditorReady<
  TRenderer = EditorRenderer,
  TEditor extends MiniGlEditorInstance<TRenderer> = MiniGlEditorInstance<TRenderer>,
> {
  canvas: HTMLCanvasElement;
  editor: TEditor;
  renderer: TRenderer;
}

export interface UseMiniGlEditorOptions<
  TRenderer = EditorRenderer,
  TEditor extends MiniGlEditorInstance<TRenderer> = MiniGlEditorInstance<TRenderer>,
  TImage = MiniGlEditorImage,
> {
  image?: TImage | null;
  colorspace?: EditorColorSpace;
  createEditor?: CreateMiniGlEditor<TRenderer, TEditor, TImage>;
  onReady?: (ready: MiniGlEditorReady<TRenderer, TEditor>) => void;
  onError?: (error: unknown) => void;
}

export interface UseMiniGlEditorResult<
  TRenderer = EditorRenderer,
  TEditor extends MiniGlEditorInstance<TRenderer> = MiniGlEditorInstance<TRenderer>,
> {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  editor: TEditor | null;
  renderer: TRenderer | null;
  status: MiniGlEditorStatus;
  error: unknown;
  isReady: boolean;
  /**
   * Use as the `key` of the `<canvas>` you attach `canvasRef` to. It changes
   * whenever a renderer needs a fresh canvas (new image, color space change,
   * Strict Mode remounts), because a canvas handed to a worker can't be reused.
   */
  canvasKey: number;
}

export type MiniGlEditorStatus = "idle" | "loading" | "ready" | "error";

/**
 * Factories that take exclusive ownership of the canvas (e.g. by calling
 * `transferControlToOffscreen`, which can only happen once per element) set
 * this flag. The hook then gives every editor instance its own `<canvas>`.
 */
export interface ExclusiveCanvasFactory {
  exclusiveCanvas?: boolean;
}

const claimedCanvases = new WeakSet<HTMLCanvasElement>();

export function useMiniGlEditor<
  TRenderer = EditorRenderer,
  TEditor extends MiniGlEditorInstance<TRenderer> = MiniGlEditorInstance<TRenderer>,
  TImage = MiniGlEditorImage,
>({
  image,
  colorspace = "srgb",
  createEditor,
  onReady,
  onError,
}: UseMiniGlEditorOptions<TRenderer, TEditor, TImage>): UseMiniGlEditorResult<
  TRenderer,
  TEditor
> {
  // Memoize editorFactory so that an inline createEditor prop doesn't flip
  // the effect's dep on every parent render (which would dispose + recreate
  // the editor unnecessarily).
  const editorFactory = useMemo(
    () =>
      createEditor ??
      (createMiniGlEditor as unknown as CreateMiniGlEditor<TRenderer, TEditor, TImage>),
    [createEditor],
  );
  // A ref object whose setter re-renders: when React swaps the <canvas>
  // element (layout change, re-key) the effect below sees the new one.
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useMemo<RefObject<HTMLCanvasElement | null>>(() => {
    let element: HTMLCanvasElement | null = null;
    return {
      get current() {
        return element;
      },
      set current(next: HTMLCanvasElement | null) {
        if (next === element) return;
        element = next;
        setCanvasElement(next);
      },
    };
  }, []);
  const onReadyRef = useLatestRef(onReady);
  const onErrorRef = useLatestRef(onError);
  const [editor, setEditor] = useState<TEditor | null>(null);
  const renderer = useMemo<TRenderer | null>(
    () => editor?.renderer ?? null,
    [editor],
  );
  const [status, setStatus] = useState<MiniGlEditorStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const rekeyedFromRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasElement;
    let disposed = false;
    let activeEditor: TEditor | null = null;

    setEditor(null);
    setError(null);

    if (!canvas || !image) {
      setStatus("idle");
      return () => {
        disposed = true;
      };
    }

    if ((editorFactory as ExclusiveCanvasFactory).exclusiveCanvas) {
      if (claimedCanvases.has(canvas)) {
        if (rekeyedFromRef.current === canvas) {
          // We asked for a fresh canvas and got the same element back.
          setStatus("error");
          setError(
            new Error(
              "This <canvas> already belongs to a renderer. Render it with key={canvasKey} so a fresh one can be mounted.",
            ),
          );
          return () => {
            disposed = true;
          };
        }
        rekeyedFromRef.current = canvas;
        setStatus("loading");
        setCanvasKey((key) => key + 1);
        return () => {
          disposed = true;
        };
      }
      claimedCanvases.add(canvas);
    }

    setStatus("loading");

    void Promise.resolve(editorFactory({ canvas, image, colorspace }))
      .then((nextEditor) => {
        if (disposed) {
          nextEditor.dispose?.();
          return;
        }

        activeEditor = nextEditor;
        setEditor(nextEditor);
        setStatus("ready");
        onReadyRef.current?.({
          canvas,
          editor: nextEditor,
          renderer: nextEditor.renderer,
        });
      })
      .catch((nextError: unknown) => {
        if (!disposed) {
          setError(nextError);
          setStatus("error");
          onErrorRef.current?.(nextError);
        }
      });

    return () => {
      disposed = true;
      activeEditor?.dispose?.();
    };
  }, [colorspace, editorFactory, image, canvasKey, canvasElement]);

  return {
    canvasRef,
    editor,
    renderer,
    status,
    error,
    isReady: status === "ready",
    canvasKey,
  };
}
