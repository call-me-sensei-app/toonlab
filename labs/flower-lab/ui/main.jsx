// Flower Lab entry. The editor shell and plant engine are shared with Tree
// Lab; labKind supplies flower-only documents, presets, stages, and copy.

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';
import { bootPlantLab } from '../../tree-lab/ui/bootPlantLab.jsx';

bootPlantLab({ labKind: 'flower' });
