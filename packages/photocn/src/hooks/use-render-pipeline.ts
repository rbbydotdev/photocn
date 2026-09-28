import { useCallback, useEffect } from "react";

import {
  renderEditorPipeline,
  type EditorParams,
  type EditorRenderer,
} from "..";

import { useLatestRef } from "./use-latest-ref";

export interface UseRenderPipelineOptions {
  renderer?: EditorRenderer | null;
  params?: EditorParams | null;
  onHistogramUpdate?: () => void;
  autoRender?: boolean;
}

export interface RenderPipelineRenderOptions {
  params?: EditorParams | null;
}

export interface UseRenderPipelineResult {
  canRender: boolean;
  render: (options?: RenderPipelineRenderOptions) => void;
}

export function useRenderPipeline({
  renderer,
  params,
  onHistogramUpdate,
  autoRender = false,
}: UseRenderPipelineOptions): UseRenderPipelineResult {
  const canRender = Boolean(renderer && params);
  const onHistogramUpdateRef = useLatestRef(onHistogramUpdate);
  const paramsRef = useLatestRef(params);
  const rendererRef = useLatestRef(renderer);

  // Synchronize external system (canvas) when params or renderer change.
  // Not an event emitter — direct state→side-effect mapping.
  useEffect(() => {
    if (!autoRender || !renderer || !params) return;
    renderEditorPipeline({
      renderer,
      params,
      onHistogramUpdate: onHistogramUpdateRef.current,
    });
  }, [autoRender, renderer, params, onHistogramUpdateRef]);

  const render = useCallback(
    (options: RenderPipelineRenderOptions = {}) => {
      const activeRenderer = rendererRef.current;
      const activeParams = options.params ?? paramsRef.current;
      if (!activeRenderer || !activeParams) return;
      renderEditorPipeline({
        renderer: activeRenderer,
        params: activeParams,
        onHistogramUpdate: onHistogramUpdateRef.current,
      });
    },
    [paramsRef, rendererRef, onHistogramUpdateRef],
  );

  return { canRender, render };
}
