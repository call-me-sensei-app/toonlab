import * as THREE from 'three';

export const RESIZE_HANDLES = [
  ...[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z]))),
  [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1],
];

export function resizeHandlePoint(bounds, handle) {
  const center = bounds.getCenter(new THREE.Vector3()), half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  return center.add(half.multiply(new THREE.Vector3(...handle)));
}

/** Pointer rays follow a visible handle; the opposite face/corner is anchored. */
export function createHandleResizeDrag({ bounds, handle, matrixWorld, cameraDirection, ray, proportional }) {
  const start = resizeHandlePoint(bounds, handle);
  const anchor = resizeHandlePoint(bounds, handle.map((v) => -v));
  const startWorld = start.clone().applyMatrix4(matrixWorld);
  const anchorWorld = anchor.clone().applyMatrix4(matrixWorld);
  const inverse = matrixWorld.clone().invert();
  const dimensions = bounds.getSize(new THREE.Vector3()).toArray();
  const axes = handle.flatMap((v, i) => v ? [i] : []);
  const direction = startWorld.clone().sub(anchorWorld).normalize();
  const planeNormal = cameraDirection.clone();
  if (axes.length === 1 || proportional) planeNormal.addScaledVector(direction, -planeNormal.dot(direction));
  if (planeNormal.lengthSq() < 1e-8) return null; // end-on handle: orbit to see its direction
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal.normalize(), startWorld);
  const initial = ray.intersectPlane(plane, new THREE.Vector3());
  if (!initial) return null;
  return {
    pivot: anchor.toArray(),
    sample(nextRay) {
      const hit = nextRay.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return null;
      const delta = hit.sub(initial);
      if (proportional) {
        const factor = 1 + delta.dot(direction) / startWorld.distanceTo(anchorWorld);
        return factor > 0 && Number.isFinite(factor) ? [factor, factor, factor] : null;
      }
      const localDelta = startWorld.clone().add(delta).applyMatrix4(inverse).sub(start);
      const result = [1, 1, 1];
      for (const axis of axes) result[axis] = 1 + localDelta.getComponent(axis) / (dimensions[axis] * handle[axis]);
      return result.every((v) => v > 0 && Number.isFinite(v)) ? result : null;
    },
  };
}

/** Screen-sized handles over a projected local bounding box, not hidden axis modes. */
export function createResizeHandles({ canvas, camera, onStart }) {
  const overlay = document.createElement('div');
  overlay.className = 'rg-resize-overlay';
  overlay.setAttribute('aria-label', 'Resize selected rock');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.append(svg);
  const lines = [];
  for (let a = 0; a < 8; a += 1) for (let b = a + 1; b < 8; b += 1) {
    if (RESIZE_HANDLES[a].filter((v, i) => v !== RESIZE_HANDLES[b][i]).length !== 1) continue;
    const line = document.createElementNS(svg.namespaceURI, 'line'); svg.append(line); lines.push({ a, b, line });
  }
  let current = null;
  const buttons = RESIZE_HANDLES.map((handle, index) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `rg-resize-handle ${index < 8 ? 'corner' : 'side'}`;
    const label = index < 8 ? `Resize corner ${index + 1}` : ['Width side 1', 'Width side 2', 'Height side 1', 'Height side 2', 'Depth side 1', 'Depth side 2'][index - 8];
    button.setAttribute('aria-label', label); button.dataset.testid = `resize-handle-${index}`;
    button.title = `${label} — drag to resize. Opposite side stays fixed.`;
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.altKey || !current) return;
      event.preventDefault(); event.stopPropagation(); onStart(event, { ...current, handle });
    });
    overlay.append(button); return button;
  });
  document.body.append(overlay);
  let cachedGeometry, cachedWeights, cachedVersion, bounds;
  return {
    update(target) {
      current = target; overlay.hidden = !target;
      if (!target) return;
      const { mesh, weights } = target, position = mesh.geometry.attributes.position;
      if (mesh.geometry !== cachedGeometry || weights !== cachedWeights || position.version !== cachedVersion) {
        bounds = new THREE.Box3(); const vertex = new THREE.Vector3();
        for (let i = 0; i < position.count; i += 1) if (!weights || weights[i] > 0) bounds.expandByPoint(vertex.fromBufferAttribute(position, i));
        cachedGeometry = mesh.geometry; cachedWeights = weights; cachedVersion = position.version;
      }
      if (bounds.isEmpty()) { overlay.hidden = true; return; }
      current.bounds = bounds.clone();
      const rect = canvas.getBoundingClientRect();
      const inspector = document.querySelector('.rg-inspector')?.getBoundingClientRect();
      const topbar = document.querySelector('.rg-topbar')?.getBoundingClientRect();
      const rail = document.querySelector('.rg-rail')?.getBoundingClientRect();
      const status = document.querySelector('.rg-status')?.getBoundingClientRect();
      overlay.style.clipPath = `inset(${topbar?.bottom ?? 0}px ${inspector ? window.innerWidth - inspector.left : 0}px ${status ? window.innerHeight - status.top : 0}px ${rail?.right ?? 0}px)`;
      svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
      mesh.updateWorldMatrix(true, false);
      const points = RESIZE_HANDLES.map((handle) => resizeHandlePoint(bounds, handle).applyMatrix4(mesh.matrixWorld).project(camera));
      const pixels = points.map((point) => [rect.left + (point.x + 1) * rect.width / 2, rect.top + (1 - point.y) * rect.height / 2]);
      for (const {a,b,line} of lines) {
        line.setAttribute('x1', pixels[a][0]); line.setAttribute('y1', pixels[a][1]);
        line.setAttribute('x2', pixels[b][0]); line.setAttribute('y2', pixels[b][1]);
        line.style.display = Math.abs(points[a].z) <= 1 && Math.abs(points[b].z) <= 1 ? '' : 'none';
      }
      buttons.forEach((button, i) => {
        button.style.left = `${pixels[i][0]}px`; button.style.top = `${pixels[i][1]}px`;
        button.hidden = Math.abs(points[i].z) > 1;
      });
    },
    dispose() { overlay.remove(); },
  };
}
