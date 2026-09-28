import { CONTROLLER_SCENE, ControllerScene } from './controllerScene.jsx';
import { INDOOR_ROOM_SCENE, IndoorRoomScene } from './indoorRoomScene.jsx';

const REGISTRY = new Map([
  [CONTROLLER_SCENE.id, { ...CONTROLLER_SCENE, Component: ControllerScene }],
  [INDOOR_ROOM_SCENE.id, { ...INDOOR_ROOM_SCENE, Component: IndoorRoomScene }],
]);
for (const scene of [...REGISTRY.values()]) {
  for (const alias of scene.aliases) REGISTRY.set(alias, scene);
}

export function resolveShowcaseScene(id = 'controller') {
  return REGISTRY.get(String(id).toLowerCase()) ?? REGISTRY.get('controller');
}

export {
  CONTROLLER_SCENE,
  ControllerScene,
  INDOOR_ROOM_SCENE,
  IndoorRoomScene,
};
