import React from 'react';
import { createRoot } from 'react-dom/client';

import '../shared/siteHeader.js';
import '../shared/ui/tokens.css';
import '../shared/ui/kit.css';
import '../home/home.css';
import '../shared/proPrimitives.css';
import './generate.css';
import { App } from './App.jsx';

createRoot(document.getElementById('app')).render(<App />);
