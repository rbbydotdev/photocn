import { useCallback, useReducer, useRef } from "react";

import {
  cloneEditorParams,
  createEditorParams,
  resetEditorParams,
  setSectionSkipped,
  type EditorParamSection,
  type EditorParams,
} from "..";

export interface PatchSectionOptions {
  /**
   * When true, the patch updates `params` but does not push a history entry.
   * Use for slider drags / continuous gestures. Call `commit()` on
   * pointer-up (or after the gesture ends) to fold the transient state into a
   * single undo entry. Default: false.
   */
  transient?: boolean;
}

export interface UseEditorHistoryOptions {
  initialParams?: EditorParams;
  /** Maximum number of past states retained. Older entries are dropped. */
  limit?: number;
}

export interface UseEditorHistoryResult {
  params: EditorParams;
  patchSection: (
    section: EditorParamSection,
    patch: Record<string, unknown>,
    options?: PatchSectionOptions,
  ) => void;
  setSectionSkipped: (section: EditorParamSection, skipped: boolean) => void;
  /** Apply a wholesale replacement of the params (used by recipe load, etc.). */
  setParams: (next: EditorParams) => void;
  /** Push any pending transient state to the undo stack. No-op if nothing transient is pending. */
  commit: () => void;
  /** Restore default params, push a history entry. */
  reset: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface HistoryState {
  params: EditorParams;
  past: EditorParams[];
  future: EditorParams[];
  /**
   * Snapshot taken at the start of an uncommitted transient batch. When set,
   * the next commit will push this onto `past` instead of the current params.
   */
  pendingBaseline: EditorParams | null;
}

type HistoryAction =
  | { type: "patch"; section: EditorParamSection; patch: Record<string, unknown>; transient: boolean }
  | { type: "set-section-skipped"; section: EditorParamSection; skipped: boolean }
  | { type: "replace"; next: EditorParams }
  | { type: "commit" }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "redo" };

const DEFAULT_LIMIT = 100;

function pushPast(past: EditorParams[], snapshot: EditorParams, limit: number): EditorParams[] {
  const next = past.length >= limit ? past.slice(past.length - limit + 1) : past.slice();
  next.push(snapshot);
  return next;
}

function applyPatch(
  params: EditorParams,
  section: EditorParamSection,
  patch: Record<string, unknown>,
): EditorParams {
  const next = cloneEditorParams(params);
  Object.assign(next[section], patch);
  return next;
}

function makeReducer(limit: number) {
  return function reducer(state: HistoryState, action: HistoryAction): HistoryState {
    switch (action.type) {
      case "patch": {
        if (action.transient) {
          // First transient patch in a batch: snapshot the baseline.
          const baseline = state.pendingBaseline ?? state.params;
          return {
            params: applyPatch(state.params, action.section, action.patch),
            past: state.past,
            future: state.future,
            pendingBaseline: baseline,
          };
        }
        // Non-transient: commit any pending batch first, then push current as the
        // pre-patch state on the undo stack.
        const baseline = state.pendingBaseline ?? state.params;
        return {
          params: applyPatch(state.params, action.section, action.patch),
          past: pushPast(state.past, baseline, limit),
          future: [],
          pendingBaseline: null,
        };
      }

      case "set-section-skipped": {
        const baseline = state.pendingBaseline ?? state.params;
        const next = cloneEditorParams(state.params);
        setSectionSkipped(next, action.section, action.skipped);
        return {
          params: next,
          past: pushPast(state.past, baseline, limit),
          future: [],
          pendingBaseline: null,
        };
      }

      case "replace": {
        const baseline = state.pendingBaseline ?? state.params;
        return {
          params: cloneEditorParams(action.next),
          past: pushPast(state.past, baseline, limit),
          future: [],
          pendingBaseline: null,
        };
      }

      case "commit": {
        if (!state.pendingBaseline) return state;
        return {
          params: state.params,
          past: pushPast(state.past, state.pendingBaseline, limit),
          future: [],
          pendingBaseline: null,
        };
      }

      case "reset": {
        const baseline = state.pendingBaseline ?? state.params;
        const next = cloneEditorParams(state.params);
        resetEditorParams(next);
        return {
          params: next,
          past: pushPast(state.past, baseline, limit),
          future: [],
          pendingBaseline: null,
        };
      }

      case "undo": {
        // Discard any uncommitted transient batch first — that's the most recent
        // visible change. Reverting to its baseline is the user's "undo".
        if (state.pendingBaseline) {
          return {
            params: state.pendingBaseline,
            past: state.past,
            future: state.future,
            pendingBaseline: null,
          };
        }
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        return {
          params: previous,
          past: state.past.slice(0, -1),
          future: [...state.future, state.params],
          pendingBaseline: null,
        };
      }

      case "redo": {
        if (state.future.length === 0) return state;
        const next = state.future[state.future.length - 1];
        return {
          params: next,
          past: pushPast(state.past, state.params, limit),
          future: state.future.slice(0, -1),
          pendingBaseline: null,
        };
      }
    }
  };
}

export function useEditorHistory(
  options: UseEditorHistoryOptions = {},
): UseEditorHistoryResult {
  const limitRef = useRef(options.limit ?? DEFAULT_LIMIT);
  const reducerRef = useRef(makeReducer(limitRef.current));

  const [state, dispatch] = useReducer(reducerRef.current, options.initialParams, (initial) => ({
    params: initial ?? createEditorParams(),
    past: [],
    future: [],
    pendingBaseline: null,
  }));

  const patchSection = useCallback(
    (
      section: EditorParamSection,
      patch: Record<string, unknown>,
      patchOptions: PatchSectionOptions = {},
    ) => {
      dispatch({
        type: "patch",
        section,
        patch,
        transient: Boolean(patchOptions.transient),
      });
    },
    [],
  );

  const setSectionSkippedCallback = useCallback(
    (section: EditorParamSection, skipped: boolean) => {
      dispatch({ type: "set-section-skipped", section, skipped });
    },
    [],
  );

  const setParams = useCallback((next: EditorParams) => {
    dispatch({ type: "replace", next });
  }, []);

  const commit = useCallback(() => {
    dispatch({ type: "commit" });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "redo" });
  }, []);

  return {
    params: state.params,
    patchSection,
    setSectionSkipped: setSectionSkippedCallback,
    setParams,
    commit,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0 || state.pendingBaseline !== null,
    canRedo: state.future.length > 0,
  };
}
