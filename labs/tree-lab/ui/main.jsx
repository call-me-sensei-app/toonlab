// Tree Lab entry. Shared runtime lives in bootPlantLab; this entry owns only
// Tree Lab styling and scope selection.

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';
import { bootPlantLab } from './bootPlantLab.jsx';

bootPlantLab({ labKind: 'tree' });
