import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { App } from './App.jsx';
import { createTransparentPreview } from './engine.js';

const engine = createTransparentPreview({ container: document.getElementById('stage') });
createRoot(document.getElementById('app')).render(<App engine={engine} />);
document.body.dataset.uiReady = 'true';
