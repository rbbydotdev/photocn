"use client";

import { createContext, useContext, type ReactNode } from "react";

import {
  useImageEditorState,
  type ImageEditorApi,
  type UseImageEditorStateOptions,
} from "./use-image-editor-state";

const ImageEditorContext = createContext<ImageEditorApi | null>(null);

export type ImageEditorProviderProps =
  | ({ editor: ImageEditorApi; children?: ReactNode } & {
      [K in keyof UseImageEditorStateOptions]?: never;
    })
  | (UseImageEditorStateOptions & { editor?: undefined; children?: ReactNode });

/**
 * Makes an editor available to every `useImageEditor()` call below it.
 *
 * Either pass options (`src`, `onParamsChange`, ...) and the provider owns the
 * state, or create it yourself with `useImageEditorState()` and pass `editor`
 * — handy when the parent also needs the API.
 */
export function ImageEditorProvider(props: ImageEditorProviderProps) {
  if (props.editor) {
    return (
      <ImageEditorContext.Provider value={props.editor}>
        {props.children}
      </ImageEditorContext.Provider>
    );
  }
  return <OwnedProvider {...props} />;
}

function OwnedProvider({
  children,
  editor: _editor,
  ...options
}: UseImageEditorStateOptions & { editor?: undefined; children?: ReactNode }) {
  const editor = useImageEditorState(options);
  return (
    <ImageEditorContext.Provider value={editor}>{children}</ImageEditorContext.Provider>
  );
}

/** Read the nearest editor. Throws outside `<ImageEditorProvider>`. */
export function useImageEditor(): ImageEditorApi {
  const editor = useContext(ImageEditorContext);
  if (!editor) {
    throw new Error("useImageEditor must be used within <ImageEditorProvider>.");
  }
  return editor;
}

/** Like `useImageEditor()` but returns `null` outside a provider. */
export function useOptionalImageEditor(): ImageEditorApi | null {
  return useContext(ImageEditorContext);
}
