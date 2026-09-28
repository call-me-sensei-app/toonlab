// Catalog browser boot: mount the user library into the shared registry,
// then render. ?hud=0 skips React (headless probes still get the dataset
// gates from the registry itself).

import React from 'react';
import { createRoot } from 'react-dom/client';

import { catalog } from '@call-me-sensei/toonlab/catalog';
import { mountLibrary } from '../userLibrary.js';
import { App } from './App.jsx';
import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './catalog.css';

if (!window.__catalogLabBooted) {
  window.__catalogLabBooted = true;
  const urlParams = new URLSearchParams(location.search);
  mountLibrary(catalog).then((mounted) => {
    const count = catalog.list().length;
    document.body.dataset.catalogCount = String(count);
    document.body.dataset.catalogLibraryCount = String(mounted);
    document.body.dataset.catalogReady = 'true';
    if (urlParams.get('hud') === '0') return;
    createRoot(document.getElementById('app')).render(
      <App initialCount={count} />,
    );
  });
}
