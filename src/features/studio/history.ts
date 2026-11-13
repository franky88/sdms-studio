import type { StudioJob } from "./job";

export type StudioHistory = {
  present: StudioJob;
  past: StudioJob[];
  future: StudioJob[];
  group?: string;
};
export type HistoryAction =
  | { type: "change"; job: StudioJob; group?: string }
  | { type: "replace"; job: StudioJob }
  | { type: "undo" | "redo" | "end-group" };

export function createHistory(job: StudioJob): StudioHistory {
  return { present: job, past: [], future: [] };
}

export function historyReducer(state: StudioHistory, action: HistoryAction): StudioHistory {
  switch (action.type) {
    case "replace":
      return createHistory(action.job);
    case "change":
      if (action.job === state.present) return state;
      return {
        present: action.job,
        past: action.group && action.group === state.group ? state.past : [...state.past.slice(-49), state.present],
        future: [],
        group: action.group,
      };
    case "end-group":
      return { ...state, group: undefined };
    case "undo":
      if (!state.past.length) return state;
      return {
        present: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
      };
    case "redo":
      if (!state.future.length) return state;
      return {
        present: state.future[0],
        past: [...state.past.slice(-49), state.present],
        future: state.future.slice(1),
      };
  }
}

export function historyAssetIds(history: StudioHistory) {
  return new Set([...history.past, history.present, ...history.future]
    .flatMap((job) => job.entries.map((entry) => entry.assetId)));
}
