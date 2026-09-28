// Designer scene dressing: a dense grass meadow for a sense of scale and
// place (always on), an optional 1.8m mannequin scale reference, and a
// lightweight walk preview (keyboard moves the mannequin around the tree,
// camera follows). Pure scene furniture — never part of the recipe or
// exports.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createWalkPreviewActions, installWalkPreviewController } from '../../shared/walkPreview.js';
import {
  StylizedGrassField,
  resolveVegetationShaderPreset,
} from '../../../src/vegetation/index.js';
import { installGroundSurface } from './groundSurface.js';

export function createSceneDressing({ engine, store }) {
  const { camera, controls, scene } = engine;

  // Portable Ground Shader disc + one ground-field capture (see
  // groundSurface.js). Installed before the meadow so blades sample a field
  // that already reflects the shader's ground color.
  const groundSurface = installGroundSurface({ engine });

  // --- Grass meadow (always on) --------------------------------------------
  // Reference anime-style density, clump-scattered around the subject. Even
  // though this is one draw call, each blade still costs CPU allocation,
  // buffer upload, vertex work, and shadow/depth processing. Keep the editor
  // default deliberately bounded; the query override remains available for
  // presentation captures that want a denser meadow.
  // ?grass=<n> overrides the blade budget (0 disables).
  const grassParam = new URLSearchParams(window.location.search).get('grass');
  const bladeBudget = grassParam === null ? 90_000 : Math.max(0, Number(grassParam) || 0);
  let grass = null;
  if (bladeBudget > 0) {
    const BLADES_PER_CLUMP = 9;
    // Tight + lush: the whole blade budget packed close around the tree —
    // density beats coverage (user-tuned: ~58 blades/m² felt sparse, this is
    // ~4× that).
    const MEADOW_RADIUS = 36;
    const placements = new Array(bladeBudget);
    let filled = 0;
    while (filled < bladeBudget) {
      // sqrt(random) = uniform density over the disc; the extra factor eases
      // it slightly inward so it reads fullest around the tree.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * MEADOW_RADIUS * (0.75 + Math.random() * 0.25);
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const clumpSpread = 0.35 + Math.random() * 0.5;
      for (let i = 0; i < BLADES_PER_CLUMP && filled < bladeBudget; i += 1) {
        placements[filled] = {
          x: cx + (Math.random() - 0.5) * clumpSpread,
          y: 0,
          z: cz + (Math.random() - 0.5) * clumpSpread,
        };
        filled += 1;
      }
    }
    grass = new StylizedGrassField({
      // Blade roots adopt the Ground Shader's color from the ground-field
      // capture, so the meadow sits in the shader's ground instead of
      // floating on a flat-color disc. Kept subtle — stronger values wash
      // the blade palette toward the ground tint.
      groundAdoptStrength: 0.35,
      groundField: true,
      placements,
      vegetationShader: resolveVegetationShaderPreset(store.getState().styleId),
    });
    // Fade the blades out before the meadow edge — never a hard rim.
    grass.material.uniforms.uFadeStart.value = MEADOW_RADIUS * 0.8;
    grass.material.uniforms.uFadeEnd.value = MEADOW_RADIUS;
    scene.add(grass);
    engine.onFrame((delta) => grass.update(delta));
  }

  // --- Mannequin + walk preview -------------------------------------------
  let mannequin = null;
  let loading = false;
  let mixer = null;
  let walkActions = null;

  function loadMannequin() {
    if (mannequin || loading) return;
    loading = true;
    new GLTFLoader().load('/characters/mannequin.glb', (gltf) => {
      mannequin = gltf.scene;
      mannequin.name = 'Scale mannequin';
      mannequin.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      const { settings } = store.getState();
      mannequin.position.set(settings.plant.size * 1.6, 0, settings.plant.size * 0.9);
      mannequin.visible = Boolean(store.getState().mannequin);
      scene.add(mannequin);
      // Real locomotion, never a T-pose: shared native idle/walk/run/jump
      // action setup, matching the controller lab's clip names.
      mixer = new THREE.AnimationMixer(mannequin);
      walkActions = createWalkPreviewActions({ clips: gltf.animations, mixer });
      // Blades part around the walker.
      grass?.setPushTarget(mannequin);
      loading = false;
    }, undefined, (error) => {
      loading = false;
      console.warn('Mannequin failed to load:', error);
      store.actions.setStatus('Mannequin model not available in this checkout.');
    });
  }

  engine.onFrame((delta) => {
    if (mannequin?.visible) mixer?.update(delta);
  });

  store.subscribe(() => {
    const { mannequin: wanted, styleId, walkPreview } = store.getState();
    if ((wanted || walkPreview) && !mannequin) loadMannequin();
    if (mannequin) mannequin.visible = Boolean(wanted || walkPreview);
    if (grass && grass.userData.previewStyleId !== styleId) {
      grass.userData.previewStyleId = styleId;
      grass.setVegetationShader(resolveVegetationShaderPreset(styleId));
    }
  });

  function moveWithTreeCollision(delta) {
    mannequin.position.add(delta);
    // Trunk collision: every grounded stem is a cylinder the walker slides
    // around (procedural trunk at the origin, drawn trunks at their base).
    const { settings, sketch } = store.getState();
    const size = settings.plant.size;
    const pillars = sketch.branchSpines
      .filter((spine) => spine.points[0][1] <= 0.02)
      .map((spine) => ({
        radius: spine.radiusStart * size,
        x: spine.points[0][0] * size,
        z: spine.points[0][2] * size,
      }));
    if (settings.skeleton.generator !== 'drawn') {
      pillars.push({ radius: settings.trunk.radiusBottom * size, x: 0, z: 0 });
    }
    for (const pillar of pillars) {
      const dx = mannequin.position.x - pillar.x;
      const dz = mannequin.position.z - pillar.z;
      const minDistance = pillar.radius + 0.35; // + body radius
      const distance = Math.hypot(dx, dz);
      if (distance < minDistance) {
        const nx = distance < 1e-5 ? 1 : dx / distance;
        const nz = distance < 1e-5 ? 0 : dz / distance;
        mannequin.position.x = pillar.x + nx * minDistance;
        mannequin.position.z = pillar.z + nz * minDistance;
      }
    }
  }

  installWalkPreviewController({
    camera,
    controls,
    engine,
    getActions: () => walkActions,
    getEnabled: () => store.getState().walkPreview,
    getWalker: () => mannequin,
    moveHorizontal: moveWithTreeCollision,
  });

  return { grass, groundSurface };
}
