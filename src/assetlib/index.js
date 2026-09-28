// Third-party open-asset integration barrel.
// Import from '@call-me-sensei/toonlab/assetlib'.
//
// Pure clients (browser + Node): assetRef, sources (the registry of every
// source incl. manual/link-out ones), polyhaven, ambientcg, polypizza,
// kaykit, opensource3d, smithsonian, PLATEAU, importedEntry.
// Three-dependent loading: loadImported (browser labs, worlds).
// CORS notes per client header: KayKit / Open Source 3D / Smithsonian run in
// the browser directly; Poly Haven / ambientCG / Poly Pizza use the
// backend/dev proxy routes where required.

export * from './assetRef.js';
export * from './sources.js';
export * from './polyhaven.js';
export * from './ambientcg.js';
export * from './polypizza.js';
export * from './kaykit.js';
export * from './kaykitStaticIndex.js';
export * from './opensource3d.js';
export * from './smithsonian.js';
export * from './plateau.js';
export * from './plateauLandmarks.js';
export * from './plateauViewer.js';
export * from './importedEntry.js';
export * from './galleryMaterialFamily.js';
export * from './loadImported.js';
export * from './zip.js';
