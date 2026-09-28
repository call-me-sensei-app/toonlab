import * as THREE from 'three';

// Sketch capture for Tree Lab: pointer strokes on a camera-facing
// work plane through the tree axis. This module owns the DOM/pointer side and
// the raw 3D stroke; the designer converts committed strokes into recipe data
// (branchSpines / extraAttachments / extraBlobs) and rebuilds.
//
//   const tools = new SketchTools({
//     renderer, scene, camera, controls,
//     onCommitStroke: (mode, worldPoints, planeNormal) => {...},
//     onErase: (raycaster) => {...},
//   });
//   tools.setMode('branch' | 'leaves' | 'erase' | 'orbit');

// Ramer–Douglas–Peucker on Vector3 polylines: keeps the drawn shape while
// dropping pointer noise, so recipes stay small and tubes stay smooth.
export function simplifyStroke(points, epsilon) {
  if (points.length < 3) return points.slice();
  const line = new THREE.Line3(points[0], points[points.length - 1]);
  const closest = new THREE.Vector3();
  let maxDistance = 0;
  let maxIndex = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    line.closestPointToPoint(points[i], true, closest);
    const distance = closest.distanceTo(points[i]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];
  const head = simplifyStroke(points.slice(0, maxIndex + 1), epsilon);
  const tail = simplifyStroke(points.slice(maxIndex), epsilon);
  return [...head.slice(0, -1), ...tail];
}

const MODE_COLORS = {
  branch: 0xffa94d,
  crown: 0x69b7ff,
  doodleErase: 0xf07a6a,
  doodleLeaves: 0x7ddf7d,
  doodleRoot: 0x8a5a3a,
  doodleWood: 0xb07a4a,
  erase: 0xff6b6b,
  leaves: 0x7ddf7d,
  trunk: 0xd2a05a,
};
// Click-tools act on a single pointerdown; draw-tools capture a stroke.
const CLICK_TOOLS = new Set(['erase', 'thicken', 'thin']);

export class SketchTools {
  constructor({
    renderer, scene, camera, controls, onCommitStroke, onToolClick,
    getStrokeStart = null, onRejectStroke = null, getBrushRadius = null,
  }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.onCommitStroke = onCommitStroke;
    // Fired for click-tools (erase, thicken) with (mode, raycaster, event).
    this.onToolClick = onToolClick;
    // Optional anchor lookup: given the pointer ray and mode, return the 3D
    // point the stroke must start from (branch mode raycasts the actual
    // trunk mesh — styled trunks bow far off the ideal axis), or null to
    // reject the stroke (onRejectStroke fires so the host can explain why).
    this.getStrokeStart = getStrokeStart;
    this.onRejectStroke = onRejectStroke;
    // Optional AREA brush: when the host returns a world-space radius for
    // the active mode, the live preview stamps discs (marker ink) instead
    // of a hairline — the stroke looks identical while drawing and after.
    this.getBrushRadius = getBrushRadius;
    this.brushPreview = null; // { group, geometry, material, radius, last }

    this.mode = 'orbit';
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.plane = new THREE.Plane();
    this.planeNormal = new THREE.Vector3(0, 0, 1);
    this.stroke = null; // { points: Vector3[], lastScreen: Vector2 }
    this.previewLine = null;

    const element = renderer.domElement;
    element.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    element.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    element.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    element.addEventListener('pointerleave', (event) => this.handlePointerUp(event));
  }

  setMode(mode) {
    this.mode = mode;
    this.controls.enabled = mode === 'orbit';
    this.renderer.domElement.style.cursor = mode === 'orbit' ? '' : 'crosshair';
  }

  updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  pointOnWorkPlane(event) {
    this.updatePointer(event);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? hit : null;
  }

  handlePointerDown(event) {
    if (event.button !== 0 || this.mode === 'orbit') return;
    if (CLICK_TOOLS.has(this.mode)) {
      this.updatePointer(event);
      this.onToolClick?.(this.mode, this.raycaster, event);
      return;
    }
    // Work plane facing the camera but kept vertical, so strokes land in the
    // upright slice the user is looking at. Branch strokes anchor the plane
    // at the actual clicked point on the wood (via getStrokeStart); other
    // strokes use the slice through the tree axis.
    this.updatePointer(event);
    let anchor = null;
    if (this.getStrokeStart) {
      anchor = this.getStrokeStart(this.raycaster, this.mode);
      if (anchor === false) {
        this.onRejectStroke?.(this.mode);
        return;
      }
    }
    this.camera.getWorldDirection(this.planeNormal);
    this.planeNormal.y = 0;
    if (this.planeNormal.lengthSq() < 1e-4) this.planeNormal.set(0, 0, 1);
    this.planeNormal.normalize();
    this.plane.setFromNormalAndCoplanarPoint(
      this.planeNormal, anchor ?? new THREE.Vector3(0, 0, 0));

    const start = anchor ?? this.pointOnWorkPlane(event);
    if (!start) return;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.stroke = {
      points: [start],
      lastScreen: new THREE.Vector2(event.clientX, event.clientY),
    };
    const brushRadius = this.getBrushRadius?.(this.mode) ?? null;
    if (brushRadius) {
      const geometry = new THREE.CircleGeometry(brushRadius, 16);
      const material = new THREE.MeshBasicMaterial({
        color: MODE_COLORS[this.mode] ?? 0xffffff,
        depthWrite: false,
        opacity: 0.6,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const group = new THREE.Group();
      group.renderOrder = 999;
      this.scene.add(group);
      this.brushPreview = {
        geometry, group, last: start.clone(), material, radius: brushRadius,
      };
      this.stampBrush(start);
    } else {
      this.previewLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(this.stroke.points),
        new THREE.LineBasicMaterial({
          color: MODE_COLORS[this.mode] ?? 0xffffff,
          depthTest: false,
          transparent: true,
          opacity: 0.9,
        }),
      );
      this.previewLine.renderOrder = 999;
      this.scene.add(this.previewLine);
    }
  }

  stampBrush(point) {
    const preview = this.brushPreview;
    const disc = new THREE.Mesh(preview.geometry, preview.material);
    disc.position.copy(point);
    disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.planeNormal);
    disc.renderOrder = 999;
    preview.group.add(disc);
  }

  // Fill the gap between samples so fast strokes stay a continuous mark.
  stampBrushTo(point) {
    const preview = this.brushPreview;
    const spacing = preview.radius * 0.45;
    const segment = point.clone().sub(preview.last);
    const length = segment.length();
    if (length < 1e-6) return;
    segment.divideScalar(length);
    for (let d = spacing; d <= length; d += spacing) {
      this.stampBrush(preview.last.clone().addScaledVector(segment, d));
    }
    this.stampBrush(point);
    preview.last.copy(point);
  }

  handlePointerMove(event) {
    if (!this.stroke) return;
    // Screen-space gate keeps the sample rate pointer-driven; the world gate
    // keeps zoomed-out strokes from collapsing into duplicate points.
    const screen = new THREE.Vector2(event.clientX, event.clientY);
    if (screen.distanceTo(this.stroke.lastScreen) < 6) return;
    const point = this.pointOnWorkPlane(event);
    if (!point) return;
    if (point.distanceTo(this.stroke.points[this.stroke.points.length - 1]) < 0.04) return;
    this.stroke.lastScreen.copy(screen);
    this.stroke.points.push(point);
    if (this.brushPreview) {
      this.stampBrushTo(point);
    } else {
      this.previewLine.geometry.dispose();
      this.previewLine.geometry = new THREE.BufferGeometry().setFromPoints(this.stroke.points);
    }
  }

  handlePointerUp() {
    if (!this.stroke) return;
    const { points } = this.stroke;
    this.stroke = null;
    if (this.previewLine) {
      this.scene.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine.material.dispose();
      this.previewLine = null;
    }
    if (this.brushPreview) {
      this.scene.remove(this.brushPreview.group);
      this.brushPreview.geometry.dispose();
      this.brushPreview.material.dispose();
      this.brushPreview = null;
    }
    if (points.length >= 2) {
      const span = points[0].distanceTo(points[points.length - 1]) +
        points.reduce((sum, p, i) => (i ? sum + p.distanceTo(points[i - 1]) : 0), 0);
      const simplified = simplifyStroke(points, Math.max(0.015, span * 0.008));
      this.onCommitStroke?.(this.mode, simplified, this.planeNormal.clone());
    }
  }
}
