import { useCallback, useReducer } from "react";

import {
  cloneEditorParams,
  createEditorParams,
  resetEditorParams,
  setSectionSkipped,
  type EditorParamSection,
  type EditorParams,
} from "..";

type EditorParamsAction =
  | { type: "reset" }
  | { type: "patch-section"; section: EditorParamSection; patch: Record<string, unknown> }
  | { type: "set-section-skipped"; section: EditorParamSection; skipped: boolean };

function editorParamsReducer(
  state: EditorParams,
  action: EditorParamsAction,
): EditorParams {
  const next = cloneEditorParams(state);

  switch (action.type) {
    case "reset":
      resetEditorParams(next);
      return next;
    case "patch-section":
      Object.assign(next[action.section], action.patch);
      return next;
    case "set-section-skipped":
      setSectionSkipped(next, action.section, action.skipped);
      return next;
  }
}

export function useEditorParams(initialParams: EditorParams = createEditorParams()) {
  const [params, dispatch] = useReducer(editorParamsReducer, initialParams);

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const patchSection = useCallback(
    (section: EditorParamSection, patch: Record<string, unknown>) =>
      dispatch({ type: "patch-section", section, patch }),
    [],
  );

  const setSkipped = useCallback(
    (section: EditorParamSection, skipped: boolean) =>
      dispatch({ type: "set-section-skipped", section, skipped }),
    [],
  );

  return {
    params,
    reset,
    patchSection,
    setSkipped,
  };
}
