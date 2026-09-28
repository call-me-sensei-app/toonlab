// Sketch-tool wiring + world→recipe stroke math. Owns everything that needs
// the live plant (spaces, raycast anchors, erase/resize picking); results
// land in the store as recipe-space data. SketchTools itself is unchanged —
// this module supplies its host callbacks.

import * as THREE from 'three';
import { SketchTools } from '../sketchTools.js';

const round4 = (value) => Math.round(value * 10000) / 10000;
const toTriplet = (vector) => [round4(vector.x), round4(vector.y), round4(vector.z)];

export function createSketchBindings({ engine, ground, store }) {
  const {
    camera, controls, getPlant, renderer, scene,
  } = engine;

  function settings() {
    return store.getState().settings;
  }

  function sketch() {
    return store.getState().sketch;
  }

  function plantSpaces() {
    const plant = getPlant();
    const size = settings().plant.size;
    const anchor = plant.canopyMesh.position;
    const canopyScale = plant.canopyMesh.scale.x;
    return {
      anchor,
      canopyLocalToWorld: (local) =>
        new THREE.Vector3(...(Array.isArray(local) ? local : local.toArray()))
          .multiplyScalar(canopyScale).add(anchor).multiplyScalar(size),
      canopyScale,
      size,
      toCanopyLocal: (world) =>
        world.clone().divideScalar(size).sub(anchor).divideScalar(canopyScale),
      toTreeLocal: (world) => world.clone().divideScalar(size),
    };
  }

  function commitBranchStroke(worldPoints, { trunk = false } = {}) {
    const { toTreeLocal } = plantSpaces();
    const { brush } = store.getState();
    // Trunk semantics: the explicit Trunk tool, or any branch stroke drawn
    // up from the ground — a ground start means "new stem", and stems at
    // branch radius read as sticks, which is never what was meant.
    const isTrunk = trunk || worldPoints[0].y < 0.05;
    const radiusStart = isTrunk ? Math.max(brush.branchRadius * 2.4, 0.14) : brush.branchRadius;
    const spine = {
      points: worldPoints.map((point) => toTriplet(toTreeLocal(point))),
      radiusStart: round4(radiusStart),
      // Trunks taper gently (branches grow off them); branches whip to a tip.
      radiusEnd: round4(Math.max(0.015, radiusStart * (isTrunk ? 0.55 : 0.3))),
      leafTip: isTrunk ? false : brush.leafTip,
    };
    const count = sketch().branchSpines.length + 1;
    store.actions.addBranchSpine(spine, {
      status: isTrunk
        ? `Trunk added (${count} strokes) — grow branches off it with ✏️ Branch.`
        : `Branch added (${count} drawn).`,
    });
  }

  // Shared polygon helpers for the closed-loop brushes.
  function polygonTools(worldPoints, planeNormal) {
    const vAxis = new THREE.Vector3(0, 1, 0);
    const uAxis = new THREE.Vector3().crossVectors(vAxis, planeNormal).normalize();
    const polygon = worldPoints.map((point) => [point.dot(uAxis), point.dot(vAxis)]);
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    const inPolygon = (x, y) => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    };
    const edgeDistance = (x, y) => {
      let min = Infinity;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const a = new THREE.Vector2(...polygon[j]);
        const b = new THREE.Vector2(...polygon[i]);
        const ab = b.clone().sub(a);
        const t = THREE.MathUtils.clamp(
          new THREE.Vector2(x, y).sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-8), 0, 1);
        min = Math.min(min, a.clone().addScaledVector(ab, t).distanceTo(new THREE.Vector2(x, y)));
      }
      return min;
    };
    return {
      edgeDistance, inPolygon, uAxis, vAxis, xs, ys,
    };
  }

  // Wood skeleton as world-space polylines: committed spines + the
  // procedural trunk axis. Used by connectivity snapping and depth snapping.
  function collectWoodPolylines() {
    const { size } = plantSpaces();
    const lines = sketch().branchSpines.map((spine) =>
      spine.points.map((point) => new THREE.Vector3(...point).multiplyScalar(size)));
    if (settings().skeleton.generator !== 'drawn') {
      lines.push([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, settings().trunk.height * size, 0),
      ]);
    }
    return lines;
  }

  // DEPTH SNAP: strokes are captured on the tree-axis work plane, so ink can
  // land in front of / behind the limb the user was visually painting over.
  // Re-cast the sample along its eye ray and move it to the ray's closest
  // approach to the wood — same screen position, branch depth. Returns null
  // when no wood is near the ray (free-floating canopy areas stay put).
  const snapRay = new THREE.Ray();
  const snapRayPoint = new THREE.Vector3();
  const snapSegPoint = new THREE.Vector3();
  function depthSnapToWood(point, eye, woodLines, maxLateral) {
    snapRay.origin.copy(eye);
    snapRay.direction.copy(point).sub(eye);
    if (snapRay.direction.lengthSq() < 1e-8) return null;
    snapRay.direction.normalize();
    let best = null;
    let bestSq = maxLateral * maxLateral;
    for (const line of woodLines) {
      for (let i = 1; i < line.length; i += 1) {
        const distanceSq = snapRay.distanceSqToSegment(
          line[i - 1], line[i], snapRayPoint, snapSegPoint);
        if (distanceSq < bestSq) {
          bestSq = distanceSq;
          best = snapRayPoint.clone();
        }
      }
    }
    return best;
  }

  function commitLeavesStroke(worldPoints, planeNormal) {
    const { canopyScale, size, toCanopyLocal } = plantSpaces();
    const closed = worldPoints.length >= 3
      && worldPoints[0].distanceTo(worldPoints[worldPoints.length - 1]) < 0.3 * size;

    if (!closed) {
      // Open stroke: leaf tufts sampled along it, one every ~clusterRadius
      // so the tufts read as a continuous run rather than beads.
      const spacing = Math.max(0.2, settings().leaves.clusterRadius * 0.8) * size;
      const attachments = [];
      let carried = 0;
      for (let i = 1; i < worldPoints.length; i += 1) {
        const from = worldPoints[i - 1];
        const to = worldPoints[i];
        const segment = to.clone().sub(from);
        const length = segment.length();
        if (length < 1e-6) continue;
        segment.divideScalar(length);
        let distance = spacing - carried;
        while (distance <= length) {
          const sample = from.clone().addScaledVector(segment, distance);
          const snapped = depthSnapToWood(
            sample, camera.position, collectWoodPolylines(), 0.6 * size);
          attachments.push({
            position: toTriplet(toCanopyLocal(snapped ?? sample)),
            direction: toTriplet(segment),
          });
          distance += spacing;
        }
        carried = (carried + length) % spacing;
      }
      if (!attachments.length) {
        attachments.push({
          position: toTriplet(toCanopyLocal(worldPoints[0])),
          direction: [0, 1, 0],
        });
      }
      store.actions.addLeafAttachments(attachments, {
        status: `Leaf run added (${attachments.length} tufts).`,
      });
      return;
    }

    // Closed silhouette: fill the outline's interior with foliage blobs on a
    // jittered grid (the blob-shell card sampling randomizes from there).
    const {
      edgeDistance, inPolygon, uAxis, vAxis, xs, ys,
    } = polygonTools(worldPoints, planeNormal);
    const spacing = 0.3 * size;
    const accepted = [];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += spacing) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += spacing) {
        const jx = x + (Math.random() - 0.5) * spacing * 0.5;
        const jy = y + (Math.random() - 0.5) * spacing * 0.5;
        if (!inPolygon(jx, jy)) continue;
        const radius = THREE.MathUtils.clamp(edgeDistance(jx, jy) * 0.9, 0.15 * size, 0.9 * size);
        if (accepted.some((blob) =>
          Math.hypot(blob.x - jx, blob.y - jy) < (blob.radius + radius) * 0.45)) continue;
        accepted.push({ x: jx, y: jy, radius });
      }
    }
    if (!accepted.length) {
      store.actions.setStatus('Outline too small to fill — draw a bigger loop.');
      return;
    }
    const woodLines = collectWoodPolylines();
    const blobs = accepted.map((blob) => {
      const world = uAxis.clone().multiplyScalar(blob.x).addScaledVector(vAxis, blob.y);
      const snapped = depthSnapToWood(world, camera.position, woodLines, 0.6 * size);
      return {
        offset: toTriplet(toCanopyLocal(snapped ?? world)),
        radius: round4(blob.radius / (size * canopyScale)),
      };
    });
    store.actions.addFoliageBlobs(blobs, {
      status: `Outline filled with ${accepted.length} foliage blobs.`,
    });
  }

  // Crown brush: the drawn outline becomes the crown's blob layout — the
  // limb growth then grows INTO the drawn silhouette. Coarse on purpose: a
  // crown layout wants a handful of big blobs, not confetti.
  function commitCrownStroke(worldPoints, planeNormal) {
    if (settings().skeleton.generator === 'drawn') {
      // Hand-drawn trees have no growth to steer — the leaf brush IS the
      // foliage tool there.
      commitLeavesStroke(worldPoints, planeNormal);
      return;
    }
    if (worldPoints.length < 3) {
      store.actions.setStatus('Draw a closed outline around where the crown should be.');
      return;
    }
    const { canopyScale, size, toCanopyLocal } = plantSpaces();
    const {
      edgeDistance, inPolygon, uAxis, vAxis, xs, ys,
    } = polygonTools(worldPoints, planeNormal);
    const spacing = 0.45 * size;
    const accepted = [];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += spacing) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += spacing) {
        const jx = x + (Math.random() - 0.5) * spacing * 0.4;
        const jy = y + (Math.random() - 0.5) * spacing * 0.4;
        if (!inPolygon(jx, jy)) continue;
        const radius = THREE.MathUtils.clamp(
          edgeDistance(jx, jy) * 0.95, 0.3 * size, 1.1 * size);
        if (accepted.some((blob) =>
          Math.hypot(blob.x - jx, blob.y - jy) < (blob.radius + radius) * 0.55)) continue;
        accepted.push({ x: jx, y: jy, radius });
      }
    }
    if (!accepted.length) {
      store.actions.setStatus('Crown outline too small — draw a bigger loop around the tree top.');
      return;
    }
    const blobs = accepted.map((blob) => {
      const world = uAxis.clone().multiplyScalar(blob.x).addScaledVector(vAxis, blob.y);
      return {
        offset: toTriplet(toCanopyLocal(world)),
        radius: round4(blob.radius / (size * canopyScale)),
      };
    });
    // The crown outline is CONFIGURATION for whatever generator is active —
    // never a generator switch (that silently replaced authored trees).
    // limbs: the outline becomes the growth target (pinned crown layout).
    // branching/drawn: the wood is authored — the outline becomes foliage
    // coverage ON the existing tree instead.
    const generator = settings().skeleton.generator;
    if (generator === 'limbs') {
      store.actions.setCrownBlobs(blobs, {
        status: `Crown pinned to your outline (${accepted.length} blobs) — the limbs grow into it; Crown Shape sliders idle until cleared.`,
        switchGeneratorToLimbs: false,
      });
    } else {
      store.actions.addFoliageBlobs(blobs, {
        status: `Crown outline filled with foliage (${accepted.length} areas) — your ${
          generator === 'drawn' ? 'drawn' : 'branching'} wood keeps its shape.`,
      });
    }
  }

  // Every drawn stroke as a clickable world-space sphere for erase/resize.
  function strokeTargets() {
    const plant = getPlant();
    const { canopyLocalToWorld, size } = plantSpaces();
    const targets = [];
    const current = sketch();
    current.branchSpines.forEach((spine, index) => {
      const center = new THREE.Vector3();
      for (const point of spine.points) center.add(new THREE.Vector3(...point));
      center.divideScalar(spine.points.length).multiplyScalar(size);
      const radius = Math.max(...spine.points.map((point) =>
        new THREE.Vector3(...point).multiplyScalar(size).distanceTo(center))) + 0.25 * size;
      targets.push({ kind: 'branchSpines', index, sphere: new THREE.Sphere(center, radius) });
    });
    current.extraAttachments.forEach((attachment, index) => {
      targets.push({
        kind: 'extraAttachments',
        index,
        sphere: new THREE.Sphere(canopyLocalToWorld(attachment.position), 0.45 * size),
      });
    });
    for (const kind of ['extraBlobs', 'crownBlobs']) {
      current[kind].forEach((blob, index) => {
        targets.push({
          kind,
          index,
          sphere: new THREE.Sphere(
            canopyLocalToWorld(blob.offset),
            blob.radius * size * plant.canopyMesh.scale.x),
        });
      });
    }
    return targets;
  }

  function eraseAt(raycaster) {
    const hit = strokeTargets()
      .filter((target) => raycaster.ray.intersectsSphere(target.sphere))
      .sort((a, b) =>
        a.sphere.center.distanceTo(raycaster.ray.origin)
        - b.sphere.center.distanceTo(raycaster.ray.origin))[0];
    if (!hit) return;
    store.actions.removeSketchItem(hit.kind, hit.index);
  }

  // Size tool: click wood to thicken (or thin). A drawn branch resizes
  // individually; procedural wood scales as a whole through the trunk base
  // radius (the pipe model keys every limb off it).
  function resizeAt(raycaster, shrink) {
    const plant = getPlant();
    const factor = shrink ? 1 / 1.15 : 1.15;
    const woodHits = plant?.trunkMesh
      ? raycaster.intersectObject(plant.trunkMesh, false)
      : [];
    const spineTargets = strokeTargets().filter((target) => target.kind === 'branchSpines');
    let spineHit = null;
    if (woodHits.length) {
      spineHit = spineTargets.find((target) => target.sphere.containsPoint(woodHits[0].point));
    } else {
      spineHit = spineTargets
        .filter((target) => raycaster.ray.intersectsSphere(target.sphere))
        .sort((a, b) =>
          a.sphere.center.distanceTo(raycaster.ray.origin)
          - b.sphere.center.distanceTo(raycaster.ray.origin))[0] ?? null;
    }
    if (!spineHit && !woodHits.length) {
      store.actions.setStatus('Click a branch or the trunk to resize it.');
      return;
    }
    if (spineHit) store.actions.resizeSpine(spineHit.index, factor);
    else store.actions.setTrunkRadiusBottom(factor);
  }

  // Pixel brush -> world radius at the work-plane depth (the plane passes
  // through the tree axis, so camera distance to mid-tree approximates it).
  function doodleWorldRadius() {
    const midTree = new THREE.Vector3(0, settings().plant.size * 1.2, 0);
    const distance = camera.position.distanceTo(midTree);
    const worldPerPixel = (2 * distance * Math.tan((camera.fov * Math.PI) / 360))
      / renderer.domElement.clientHeight;
    return Math.max(store.getState().brush.doodleSizePx * worldPerPixel * 0.5, 0.02);
  }

  const sketchTools = new SketchTools({
    renderer,
    scene,
    camera,
    controls,
    // Doodle brushes preview as stamped AREA ink from the first pixel.
    getBrushRadius: (mode) =>
      (mode.startsWith('doodle') ? doodleWorldRadius() : null),
    // Branch strokes must start ON the wood: raycast the real trunk mesh
    // (styled trunks bow far off the ideal axis, so axis-distance checks
    // reject perfectly good clicks). The hit point anchors the work plane.
    getStrokeStart: (raycaster, mode) => {
      const plant = getPlant();
      const hits = plant?.trunkMesh
        ? raycaster.intersectObject(plant.trunkMesh, false)
        : [];
      // Doodle brushes draw anywhere on the tree-axis plane — a crayon has
      // no anchoring rules.
      if (mode.startsWith('doodle')) return null;
      if (mode === 'branch' || mode === 'trunk') {
        if (hits.length) return hits[0].point;
        // No wood under the pointer: a stroke may start from the GROUND
        // instead — that's how trunks are drawn from scratch.
        const groundHits = raycaster.intersectObject(ground, false);
        if (groundHits.length && Math.hypot(groundHits[0].point.x, groundHits[0].point.z)
          < settings().plant.size * 4) {
          return groundHits[0].point.setY(0);
        }
        return false;
      }
      // Leaves: when the stroke starts on wood, anchor the drawing plane at
      // that hit so tufts land ON the limb. Off-wood strokes keep the axis
      // plane.
      return hits.length ? hits[0].point : null;
    },
    onRejectStroke: () => {
      store.actions.setStatus('Branch strokes start on wood or on the ground — click there and drag.');
    },
    onCommitStroke: (mode, worldPoints, planeNormal) => {
      if (settings().plant.type === 'bush') {
        store.actions.setStatus('Sketch tools work on trees and flowers — switch Type first.');
        return;
      }
      if (mode === 'doodleErase') {
        // Eraser: drop every pending stroke the erase path touches,
        // judged in SCREEN space — erase what you see, regardless of which
        // camera angle each stroke was drawn from.
        const erasePoints = worldPoints.map((point) => engine.projectToScreen([point.x, point.y, point.z]));
        const midTree = new THREE.Vector3(0, settings().plant.size * 1.2, 0);
        const worldPerPixel = (2 * camera.position.distanceTo(midTree)
          * Math.tan((camera.fov * Math.PI) / 360)) / renderer.domElement.clientHeight;
        const erasePx = store.getState().brush.doodleSizePx * 0.5;
        // Strokes are stored decimated (often just endpoints), so test
        // polyline-vs-polyline: every point of one against every SEGMENT of
        // the other, both ways.
        const distToSegment = (point, a, b) => {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len2 = dx * dx + dy * dy;
          const t = len2
            ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2))
            : 0;
          return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
        };
        const pointsNearPolyline = (points, line, threshold) => points.some((point) => {
          if (line.length === 1) {
            return Math.hypot(point.x - line[0].x, point.y - line[0].y) < threshold;
          }
          for (let i = 0; i < line.length - 1; i += 1) {
            if (distToSegment(point, line[i], line[i + 1]) < threshold) return true;
          }
          return false;
        });
        const hit = [];
        store.getState().pendingStrokes.forEach((stroke, index) => {
          const threshold = erasePx + stroke.radius / worldPerPixel;
          const strokeScreen = stroke.points.map(([x, y, z]) => engine.projectToScreen([x, y, z]));
          if (pointsNearPolyline(strokeScreen, erasePoints, threshold)
            || pointsNearPolyline(erasePoints, strokeScreen, threshold)) hit.push(index);
        });
        if (hit.length) store.actions.removePendingStrokes(hit);
        else store.actions.setStatus('Nothing erased — drag across the ink you want gone.');
        return;
      }
      if (mode.startsWith('doodle')) {
        // Sketch mode: pool the raw stroke; nothing rebuilds until Convert.
        // The brush paints AREA — the same world radius the live preview
        // stamped, so the ink never changes on release.
        const radius = doodleWorldRadius();
        store.actions.addPendingStroke({
          brush: mode === 'doodleWood' ? 'wood' : mode === 'doodleRoot' ? 'root' : 'leaves',
          // The eye at draw time: conversion depth-snaps along these rays,
          // so orbiting between drawing and converting can't skew the snap.
          eye: [camera.position.x, camera.position.y, camera.position.z],
          planeNormal: [planeNormal.x, planeNormal.y, planeNormal.z],
          points: worldPoints.map((point) => [point.x, point.y, point.z]),
          radius,
        });
        return;
      }
      if (mode === 'branch') commitBranchStroke(worldPoints);
      else if (mode === 'trunk') commitBranchStroke(worldPoints, { trunk: true });
      else if (mode === 'leaves') commitLeavesStroke(worldPoints, planeNormal);
      else if (mode === 'crown') commitCrownStroke(worldPoints, planeNormal);
    },
    onToolClick: (mode, raycaster, event) => {
      if (settings().plant.type === 'bush') return;
      if (mode === 'erase') eraseAt(raycaster);
      else if (mode === 'thicken') resizeAt(raycaster, event.shiftKey);
      else if (mode === 'thin') resizeAt(raycaster, true);
    },
  });

  // Tool state flows one way: UI -> store -> sketchTools.
  // 'move' (explicitly selected Move) behaves as camera navigation, same
  // as the idle default 'orbit' — SketchTools only knows 'orbit'.
  const sketchMode = (tool) => (tool === 'move' ? 'orbit' : tool);
  let lastTool = store.getState().tool;
  sketchTools.setMode(sketchMode(lastTool));
  store.subscribe(() => {
    const { tool } = store.getState();
    if (tool !== lastTool) {
      lastTool = tool;
      sketchTools.setMode(sketchMode(tool));
    }
  });

  // ---- Sketch mode: crayon overlay + Convert to Tree -----------------------
  // Pending strokes render as plain lines (wood = bark, leaves = green) so
  // the doodle stays visible; Convert replays them through the SAME commit
  // math the live tools use, so converted trees are indistinguishable from
  // hand-anchored ones — and converting again simply appends.

  const doodleGroup = new THREE.Group();
  doodleGroup.name = 'Sketch doodles';
  scene.add(doodleGroup);
  const doodleMaterials = {
    leaves: new THREE.MeshBasicMaterial({
      color: 0x7ddf7d, depthWrite: false, opacity: 0.55, side: THREE.DoubleSide, transparent: true,
    }),
    root: new THREE.MeshBasicMaterial({
      color: 0x8a5a3a, depthWrite: false, opacity: 0.65, side: THREE.DoubleSide, transparent: true,
    }),
    wood: new THREE.MeshBasicMaterial({
      color: 0xb07a4a, depthWrite: false, opacity: 0.65, side: THREE.DoubleSide, transparent: true,
    }),
  };

  // Resample a polyline at a fixed spacing so disc stamps read as one
  // continuous marker stroke regardless of pointer speed.
  function sampleAlong(points, spacing) {
    const samples = [points[0].clone()];
    let carried = 0;
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      const segment = to.clone().sub(from);
      const length = segment.length();
      if (length < 1e-6) continue;
      segment.divideScalar(length);
      let distance = spacing - carried;
      while (distance <= length) {
        samples.push(from.clone().addScaledVector(segment, distance));
        distance += spacing;
      }
      carried = (carried + length) % spacing;
    }
    return samples;
  }

  // One InstancedMesh of plane-aligned discs per stroke: the marker-ink look.
  function buildStrokeMesh(stroke) {
    const points = stroke.points.map((point) => new THREE.Vector3(...point));
    const samples = sampleAlong(points, Math.max(stroke.radius * 0.45, 0.01));
    const disc = new THREE.CircleGeometry(stroke.radius, 16);
    const mesh = new THREE.InstancedMesh(disc, doodleMaterials[stroke.brush], samples.length);
    const normal = new THREE.Vector3(...stroke.planeNormal);
    const orientation = new THREE.Quaternion()
      .setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.normalize());
    const matrix = new THREE.Matrix4();
    samples.forEach((sample, index) => {
      matrix.compose(sample, orientation, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.renderOrder = 15;
    return mesh;
  }

  let renderedDoodles = 0;
  store.subscribe(() => {
    const { pendingStrokes } = store.getState();
    if (pendingStrokes.length === renderedDoodles) return;
    if (pendingStrokes.length < renderedDoodles) {
      for (const child of [...doodleGroup.children]) {
        child.geometry.dispose();
        doodleGroup.remove(child);
      }
      renderedDoodles = 0;
    }
    for (let i = renderedDoodles; i < pendingStrokes.length; i += 1) {
      doodleGroup.add(buildStrokeMesh(pendingStrokes[i]));
    }
    renderedDoodles = pendingStrokes.length;
  });

  function convertPendingStrokes() {
    const { pendingStrokes } = store.getState();
    if (!pendingStrokes.length) {
      store.actions.setStatus('Nothing to convert — doodle some wood and leaves first.');
      return;
    }
    // Wood first (lowest stroke first) so leaf areas land on fresh wood; the
    // first-ever wood stroke grounds itself and becomes the trunk.
    const wood = pendingStrokes
      .filter((stroke) => stroke.brush === 'wood')
      .sort((a, b) => Math.min(...a.points.map((p) => p[1])) - Math.min(...b.points.map((p) => p[1])));
    const leaves = pendingStrokes.filter((stroke) => stroke.brush === 'leaves');
    const rootStrokes = pendingStrokes.filter((stroke) => stroke.brush === 'root');

    const { size } = plantSpaces();

    // CONNECTIVITY GUARANTEE: converted wood is never disconnected. Every
    // wood stroke either snaps its start onto existing wood (previously
    // committed spines, the procedural trunk, or earlier strokes in this
    // same conversion) or roots itself to the ground as a new stem.
    const woodPolylines = sketch().branchSpines.map((spine) =>
      spine.points.map((point) => new THREE.Vector3(...point).multiplyScalar(size)));
    if (settings().skeleton.generator !== 'drawn') {
      const trunkTop = settings().trunk.height * size;
      woodPolylines.push([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, trunkTop, 0)]);
    }
    const closest = new THREE.Vector3();
    const segment = new THREE.Line3();
    function nearestWoodPoint(target) {
      let best = null;
      let bestDistance = Infinity;
      for (const polyline of woodPolylines) {
        for (let i = 1; i < polyline.length; i += 1) {
          segment.set(polyline[i - 1], polyline[i]);
          segment.closestPointToPoint(target, true, closest);
          const distance = closest.distanceTo(target);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = closest.clone();
          }
        }
      }
      return best ? { distance: bestDistance, point: best } : null;
    }

    let hadSpines = woodPolylines.length > 0;
    for (const stroke of wood) {
      const points = stroke.points.map((point) => new THREE.Vector3(...point));
      const nearest = hadSpines ? nearestWoodPoint(points[0]) : null;
      const nearGround = points[0].y < 0.15;
      const attachable = nearest && nearest.distance < size * 1.2 && !nearGround;
      const isTrunk = !attachable;
      if (attachable) {
        // Start the tube ON the wood it grows from.
        if (nearest.distance > 0.02) points.unshift(nearest.point);
      } else if (points[0].y > 0) {
        // New stem: root to the ground.
        points.unshift(new THREE.Vector3(points[0].x, 0, points[0].z));
      }
      // The brush IS the width: the painted stroke radius (world units,
      // tree-local = /size) becomes the spine radius, so a fat doodle
      // converts into a fat limb.
      const radiusStart = Math.min(Math.max(stroke.radius / size, 0.02), 0.5);
      const spine = {
        points: points.map((point) => toTriplet(point.clone().divideScalar(size))),
        radiusStart: round4(radiusStart),
        radiusEnd: round4(Math.max(0.015, radiusStart * (isTrunk ? 0.55 : 0.35))),
        leafTip: false,
      };
      store.actions.addBranchSpine(spine, {
        status: isTrunk ? 'Trunk converted from your doodle.' : 'Branch converted (attached to the wood).',
      });
      woodPolylines.push(points);
      hadSpines = true;
    }
    // Roots: always attach to the nearest wood (usually the base collar)
    // and bury their tips — a root never floats and never counts as trunk.
    for (const stroke of rootStrokes) {
      const points = stroke.points.map((point) => new THREE.Vector3(...point));
      const nearest = hadSpines ? nearestWoodPoint(points[0]) : null;
      if (nearest && nearest.distance > 0.02) points.unshift(nearest.point);
      const tip = points[points.length - 1];
      if (tip.y > -0.05) points.push(new THREE.Vector3(tip.x, -0.14, tip.z));
      const radiusStart = Math.min(Math.max(stroke.radius / size, 0.02), 0.4);
      store.actions.addBranchSpine({
        points: points.map((point) => toTriplet(point.clone().divideScalar(size))),
        radiusStart: round4(radiusStart),
        radiusEnd: round4(Math.max(0.012, radiusStart * 0.25)),
        leafTip: false,
      }, { status: 'Root converted (buried at the tip).' });
      woodPolylines.push(points);
      hadSpines = true;
    }
    for (const stroke of leaves) {
      // Leaf doodles are COVERAGE: foliage blobs stamped along the painted
      // path at the brush radius, so the crown fills exactly the area drawn.
      // Each blob depth-snaps onto the wood its eye ray passes (including
      // wood converted moments ago in this same pass) — leaves sit ON the
      // branch, never floating just behind it.
      const { canopyScale, toCanopyLocal } = plantSpaces();
      const eye = stroke.eye ? new THREE.Vector3(...stroke.eye) : camera.position;
      const points = stroke.points.map((point) => new THREE.Vector3(...point));
      const samples = sampleAlong(points, Math.max(stroke.radius * 0.9, 0.05));
      const blobRadius = Math.min(Math.max((stroke.radius * 1.15) / (size * canopyScale), 0.12), 1.3);
      const blobs = samples.map((sample) => {
        const snapped = depthSnapToWood(sample, eye, woodPolylines, 0.6 * size);
        return {
          offset: toTriplet(toCanopyLocal(snapped ?? sample)),
          radius: round4(blobRadius),
        };
      });
      store.actions.addFoliageBlobs(blobs, {
        status: `Foliage area converted (${blobs.length} blobs).`,
      });
    }
    store.actions.clearPendingStrokes();
    store.actions.setStatus(
      `Converted ${wood.length + rootStrokes.length + leaves.length} strokes — keep doodling and convert again to grow it.`);
  }

  // Doodle-GROW is INCREMENTAL: the first grow picks a trunk from the doodle
  // (longest wood stroke) and grows a full EZ-style tree along it; later
  // grows keep the existing trunk and add the new strokes as branches on the
  // grown tree. Leaf doodles become extra tuft areas either way.
  function growPendingStrokes() {
    const { pendingStrokes } = store.getState();
    const wood = pendingStrokes.filter((stroke) => stroke.brush === 'wood');
    // The tree already has wood if any generator is producing a trunk
    // (limbs/branching), a doodled trunk spine exists, or spines were drawn.
    // Grow NEVER replaces existing wood — it only acts on the new strokes.
    const existingSpine = sketch().trunkSpine;
    const hasWood = Boolean(existingSpine) ||
      settings().skeleton.generator !== 'drawn' ||
      sketch().branchSpines.length > 0;
    if (!wood.length && !hasWood) {
      store.actions.setStatus('Grow needs a wood stroke to use as the trunk \u2014 doodle one first.');
      return;
    }
    const { size } = plantSpaces();
    const strokeLength = (stroke) => stroke.points.reduce((sum, p, i) => (i
      ? sum + Math.hypot(p[0] - stroke.points[i - 1][0], p[1] - stroke.points[i - 1][1],
        p[2] - stroke.points[i - 1][2])
      : 0), 0);
    const sorted = [...wood].sort((a, b) => strokeLength(b) - strokeLength(a));

    let trunkPoints;
    let branchStrokes;
    if (hasWood) {
      // Existing tree (any generator): EVERY stroke becomes a grown branch on
      // it — nothing about the current tree is replaced.
      trunkPoints = existingSpine
        ? existingSpine.map((point) => new THREE.Vector3(...point).multiplyScalar(size))
        : [new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, settings().trunk.height * size, 0)];
      branchStrokes = sorted;
      if (branchStrokes.length) {
        store.actions.setStatus('Grew branches along your strokes \u2014 the tree itself is untouched.');
      }
    } else {
      // Truly blank canvas: the longest stroke seeds the whole tree.
      const trunkStroke = sorted[0];
      trunkPoints = trunkStroke.points.map((point) => new THREE.Vector3(...point));
      if (trunkPoints[0].y > trunkPoints[trunkPoints.length - 1].y) trunkPoints.reverse();
      if (trunkPoints[0].y > 0) {
        trunkPoints.unshift(new THREE.Vector3(trunkPoints[0].x, 0, trunkPoints[0].z));
      }
      store.actions.setTrunkSpine(
        trunkPoints.map((point) => toTriplet(point.clone().divideScalar(size))),
        { status: 'Grew a tree along your trunk doodle \u2014 tune it under Branches.' });
      branchStrokes = sorted.slice(1);
    }

    // Branch strokes snap to the trunk spine (and to each other via the
    // committed-spines list) so nothing floats.
    const trunkPolyline = trunkPoints;
    const closest = new THREE.Vector3();
    const segment = new THREE.Line3();
    const snapPolylines = [trunkPolyline,
      ...sketch().branchSpines.map((spine) =>
        spine.points.map((point) => new THREE.Vector3(...point).multiplyScalar(size)))];
    for (const stroke of branchStrokes) {
      const points = stroke.points.map((point) => new THREE.Vector3(...point));
      let best = null;
      let bestDistance = Infinity;
      for (const polyline of snapPolylines) {
        for (let i = 1; i < polyline.length; i += 1) {
          segment.set(polyline[i - 1], polyline[i]);
          segment.closestPointToPoint(points[0], true, closest);
          const distance = closest.distanceTo(points[0]);
          if (distance < bestDistance) { bestDistance = distance; best = closest.clone(); }
        }
      }
      if (best && bestDistance > 0.02) points.unshift(best);
      snapPolylines.push(points);
      const radiusStart = Math.min(Math.max(stroke.radius / size, 0.02), 0.5);
      store.actions.addBranchSpine({
        points: points.map((point) => toTriplet(point.clone().divideScalar(size))),
        radiusStart: round4(radiusStart),
        radiusEnd: round4(Math.max(0.015, radiusStart * 0.35)),
        leafTip: false,
        // Grown, not literal: the stroke sprouts sub-branches + foliage.
        grow: true,
      }, { status: 'Branch grown along your stroke.' });
    }

    // Leaf doodles: extra tuft areas on top of the grown canopy. plantSpaces
    // reads the freshly grown plant (setTrunkSpine committed immediately),
    // so canopy-local conversion uses the new anchor.
    const leaves = pendingStrokes.filter((stroke) => stroke.brush === 'leaves');
    for (const stroke of leaves) {
      const { toCanopyLocal } = plantSpaces();
      const points = stroke.points.map((point) => new THREE.Vector3(...point));
      const samples = sampleAlong(points, Math.max(stroke.radius * 0.9, 0.08));
      store.actions.addLeafAttachments(samples.map((sample) => ({
        position: toTriplet(toCanopyLocal(sample)),
        direction: [0, 1, 0],
      })), { status: 'Leaf areas added onto the grown crown.' });
    }
    store.actions.clearPendingStrokes();
  }

  return {
    convertPendingStrokes, growPendingStrokes, plantSpaces, sketchTools, strokeTargets,
  };
}
