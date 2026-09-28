import * as THREE from 'three';

const AXES = [
  { name: 'X', color: '#ff8585', vector: [1, 0, 0] },
  { name: 'Y', color: '#83e4a3', vector: [0, 1, 0] },
  { name: 'Z', color: '#84baff', vector: [0, 0, 1] },
];

/** Camera-relative directions, not screen-fixed axis labels. */
export function projectViewportAxes(cameraQuaternion, basis = new THREE.Matrix4()) {
  const inverseCamera = cameraQuaternion.clone().invert();
  return AXES.flatMap((axis) => [-1, 1].map((sign) => {
    const direction = new THREE.Vector3(...axis.vector).multiplyScalar(sign)
      .transformDirection(basis).applyQuaternion(inverseCamera);
    return { name: `${sign < 0 ? '−' : ''}${axis.name}`, color: axis.color,
      x: direction.x, y: -direction.y, z: direction.z, positive: sign > 0 };
  })).sort((a, b) => a.z - b.z);
}

export function createViewportAxes({ camera, scene }) {
  // A triad on the edited rock makes local tool directions visible in-place.
  const rockAxes = new THREE.Group(); rockAxes.name = 'Rock editor axis guide'; scene.add(rockAxes);
  const positions = new Float32Array(18), colors = new Float32Array(18);
  AXES.forEach((axis,i) => { const color=new THREE.Color(axis.color); color.toArray(colors,i*6); color.toArray(colors,i*6+3); });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const material = new THREE.LineBasicMaterial({vertexColors:true,depthTest:false,depthWrite:false,toneMapped:false});
  const lines = new THREE.LineSegments(geometry,material); lines.frustumCulled=false; lines.renderOrder=1000; rockAxes.add(lines);
  const labels = AXES.map((axis) => {
    const canvas=document.createElement('canvas'); canvas.width=64; canvas.height=64;
    const context=canvas.getContext('2d'); context.font='bold 38px sans-serif'; context.textAlign='center'; context.textBaseline='middle';
    context.strokeStyle='#14202c'; context.lineWidth=7; context.strokeText(axis.name,32,32);
    context.fillStyle=axis.color; context.fillText(axis.name,32,32);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false}));
    sprite.renderOrder=1001; rockAxes.add(sprite); return sprite;
  });
  const namespace = 'http://www.w3.org/2000/svg';
  const element = document.createElement('div');
  element.className = 'rg-axis-compass';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', 'Scene axes: X red, Y green (up), Z blue. Directions follow the camera.');
  element.dataset.testid = 'viewport-axis-compass';
  const heading = document.createElement('div'); heading.textContent = 'Scene axes'; element.append(heading);
  const svg = document.createElementNS(namespace, 'svg'); svg.setAttribute('viewBox', '0 0 120 112'); element.append(svg);
  const groups = new Map();
  for (const axis of projectViewportAxes(new THREE.Quaternion())) {
    const group = document.createElementNS(namespace, 'g');
    const line = document.createElementNS(namespace, 'line');
    const circle = document.createElementNS(namespace, 'circle');
    const text = document.createElementNS(namespace, 'text');
    line.setAttribute('stroke', axis.color); line.setAttribute('stroke-width', axis.positive ? '2.5' : '1');
    if (!axis.positive) line.setAttribute('stroke-dasharray', '3 3');
    circle.setAttribute('fill', axis.positive ? axis.color : '#202a35');
    circle.setAttribute('stroke', axis.color); circle.setAttribute('r', axis.positive ? '11' : '9');
    text.textContent = axis.name; text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', axis.positive ? '#11202c' : axis.color);
    group.append(line, circle, text); svg.append(group); groups.set(axis.name, { group, line, circle, text });
  }
  document.body.append(element);
  const orientation = new THREE.Quaternion();
  return {
    update(mesh = null) {
      rockAxes.visible = Boolean(mesh);
      if (mesh) {
        mesh.updateWorldMatrix(true,false);
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const center=mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        const length=Math.max(mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length()*0.25,0.1);
        AXES.forEach((axis,i) => {
          const end=new THREE.Vector3(...axis.vector).transformDirection(mesh.matrixWorld).multiplyScalar(length).add(center);
          center.toArray(positions,i*6); end.toArray(positions,i*6+3);
          labels[i].position.copy(end); labels[i].scale.setScalar(length*0.22);
        });
        geometry.attributes.position.needsUpdate=true;
      }
      camera.getWorldQuaternion(orientation);
      const axes = projectViewportAxes(orientation);
      for (const axis of axes) {
        const { group, line, circle, text } = groups.get(axis.name);
        const x = 60 + axis.x * 40, y = 56 + axis.y * 40;
        line.setAttribute('x1', '60'); line.setAttribute('y1', '56'); line.setAttribute('x2', String(x)); line.setAttribute('y2', String(y));
        circle.setAttribute('cx', String(x)); circle.setAttribute('cy', String(y));
        text.setAttribute('x', String(x)); text.setAttribute('y', String(y));
        group.setAttribute('opacity', axis.z < -0.1 ? '0.55' : '1');
        svg.append(group); // rear directions draw behind the forward ones
      }
      const inspector = document.querySelector('.rg-inspector')?.getBoundingClientRect();
      const topbar = document.querySelector('.rg-topbar')?.getBoundingClientRect();
      element.style.right = `${inspector ? window.innerWidth - inspector.left + 12 : 12}px`;
      element.style.top = `${(topbar?.bottom ?? 0) + 12}px`;
      element.hidden = document.body.dataset.hideHud === 'true';
    },
    dispose() {
      element.remove(); scene.remove(rockAxes); geometry.dispose(); material.dispose();
      labels.forEach(label=>{label.material.map.dispose();label.material.dispose();});
    },
  };
}
