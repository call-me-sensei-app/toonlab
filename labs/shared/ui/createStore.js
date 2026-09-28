// Minimal external store: getState/subscribe/notify with immutable
// snapshots, consumable from React via useSyncExternalStore and from
// vanilla engines via subscribe(). designerStore (tree) and rockStore
// (later) build on this.

/**
 * @param {object} initialState
 * @returns {{ getState, setState, subscribe }}
 *   setState(patch | fn): shallow-merges a patch (or fn(state) -> patch)
 *   into a NEW state object and notifies. Never mutate nested objects in
 *   place — replace the changed slice so React snapshot comparison works.
 */
export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState: () => state,
    setState(patchOrFn) {
      const patch = typeof patchOrFn === 'function' ? patchOrFn(state) : patchOrFn;
      if (!patch) return;
      state = { ...state, ...patch };
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
