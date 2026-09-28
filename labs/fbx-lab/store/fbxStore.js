// FBX editor state: plain snapshots for the React HUD. The engine owns the
// live three.js objects and republishes tree/selection snapshots here after
// every structural or transform change.

import { createStore } from '../../shared/ui/createStore.js';

export function createFbxStore() {
  const store = createStore({
    error: null,
    exportName: '',
    exporting: false,
    fileName: null,
    gizmoMode: 'translate',
    // 'empty' | 'loading' | 'ready' | 'error'
    status: 'empty',
    selectedId: null,
    selectedInfo: null,
    stats: null,
    tree: null,
    undoCount: 0,
    warnings: [],
  });
  return store;
}
