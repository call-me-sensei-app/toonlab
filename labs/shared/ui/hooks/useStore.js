import { useSyncExternalStore } from 'react';

/**
 * Subscribes a component to a createStore()-style store. Selectors must
 * return primitives or STABLE slices (the store replaces changed slices
 * rather than mutating, so `s => s.settings.trunk` is stable until trunk
 * actually changes).
 */
export function useStoreState(store, selector = (state) => state) {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
