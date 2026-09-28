// The atmosphere layer. Import from '@call-me-sensei/toonlab/ambientfx'.
//
//   const fx = createAmbientFx({
//     seed, heightAt, waterLevel, followTarget, timeOfDay,
//     effects: { petals: true, fireflies: { density: 1.5 } },
//   });
//   scene.add(fx.root);
//   fx.update(delta, camera);                  // each frame
//   fx.setWind({ windDirection: [1, 0.3], windSpeed: 1, windStrength: 0.16 });
//   fx.setDistanceFog({ color, density, falloff, floorY });   // height-fog layer
//   fx.addBloomSources([{ x, y, z, radius, color, effect: 'petals' }]);
//
// All five effects are emission presets over ONE particle backbone (three
// draw calls total — see particleBackbone.js for the grouping rationale).
// Effects listed in `effects` override their settings group; `densityScale`
// multiplies the per-m³ base density, so `{ fireflies: { densityScale: 1.5 } }`
// reads as "half again as many fireflies". The former `density` spelling
// remains a compatibility alias.

import * as THREE from 'three';

import {
  AMBIENTFX_EFFECT_IDS,
  createAmbientFxSettings,
  timeGateWeight,
} from './ambientFxSettings.js';
import { resolveAmbientFxPreset } from './ambientFxPresets.js';
import {
  createParticleBackbone,
  EFFECT_KIND,
  GROUP_FOR_KIND,
  RECENTER_FRACTION,
  windDriftVector,
} from './particleBackbone.js';
import { emitCanopyBound, emitGlobalVolume, emitWaterMargin } from './emitters.js';

const focusScratch = new THREE.Vector3();
const colorA = new THREE.Color();
const colorB = new THREE.Color();
const colorMix = new THREE.Color();

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeGroupOverrides(...layers) {
  const merged = {};
  for (const layer of layers) {
    for (const [group, values] of Object.entries(cleanObject(layer))) {
      merged[group] = { ...merged[group], ...cleanObject(values) };
    }
  }
  return merged;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createAmbientFx({
  seed = 1,
  heightAt = () => 0,
  waterLevel = null,
  followTarget = null,
  timeOfDay = null,
  effects = {},
  bounds = null,
  preset = null,
  settings = {},
} = {}) {
  const worldSeed = Math.max(1, Math.round(Number(seed) || 1)) >>> 0;

  // Per-effect runtime config pulled out of `effects`: enabled/density are
  // levers, `mask` binds pollen/fireflies to host masks, the rest is plain
  // settings overrides layered over preset + settings.
  const densityMult = {};
  const effectMasks = {};
  const effectOverrides = {};
  for (const id of AMBIENTFX_EFFECT_IDS) {
    const raw = effects?.[id];
    densityMult[id] = 1;
    effectMasks[id] = null;
    if (raw === false) {
      effectOverrides[id] = { enabled: false };
    } else if (raw === true) {
      effectOverrides[id] = { enabled: true };
    } else if (raw && typeof raw === 'object') {
      const { density, densityScale, mask, ...rest } = raw;
      const scale = densityScale ?? density;
      if (Number.isFinite(Number(scale))) densityMult[id] = Math.max(Number(scale), 0);
      if (typeof mask === 'function') effectMasks[id] = mask;
      effectOverrides[id] = { enabled: true, ...rest };
    }
  }
  const resolved = createAmbientFxSettings(
    mergeGroupOverrides(resolveAmbientFxPreset(preset), settings, effectOverrides));
  const shared = resolved.shared;
  const windowRadius = shared.windowRadius;
  const worldBounds = bounds && Number.isFinite(Number(bounds.x)) && Number.isFinite(Number(bounds.z))
    ? { x: Math.abs(Number(bounds.x)), z: Math.abs(Number(bounds.z)) }
    : null;

  const backbone = createParticleBackbone(resolved);
  const u = backbone.uniforms;
  const root = new THREE.Group();
  root.name = 'StylizedAmbientFx';
  for (const group of Object.values(backbone.groups)) root.add(group.mesh);
  // Mist is the one effect that must not enter the water scene passes: a
  // fog sheet in the refraction grab reads as murk under the surface.
  // Fireflies (and petals/leaves) deliberately stay IN — glowing motes
  // doubling on the lake at dusk is the whole point of the effect, and at
  // these counts the extra pass cost is noise.
  backbone.groups.soft.mesh.userData.waterExclude = true;

  const bloomSources = [];
  const counts = { fireflies: 0, leaves: 0, mist: 0, petals: 0, pollen: 0 };
  const gateWeights = { fireflies: 1, leaves: 1, mist: 1, petals: 1, pollen: 1 };
  const emissionCenter = { x: 0, z: 0 };
  let emittedOnce = false;
  let hour = 13;

  const effectiveDensity = (id) =>
    (resolved[id].enabled ? resolved[id].density * densityMult[id] : 0);

  // Soft global budget: expected counts scale down proportionally when the
  // requested densities would blow past maxParticles. Upper-bound estimate —
  // masks and water margins only ever emit fewer.
  const budgetScale = () => {
    const area = Math.PI * windowRadius * windowRadius;
    let expected = 0;
    for (const id of AMBIENTFX_EFFECT_IDS) {
      const density = effectiveDensity(id);
      if (!(density > 0)) continue;
      const e = resolved[id];
      const band = e.emitHeight ?? e.hoverHeight ?? [0, 1.2];
      expected += density * area * Math.max(Math.abs(band[1] - band[0]), 0.25);
      if (id === 'petals' || id === 'leaves') {
        const canopyDensity = (e.canopyDensity ?? 0) * densityMult[id];
        for (const source of bloomSources) {
          if ((source.effect ?? 'petals') !== id) continue;
          expected += canopyDensity * (2 / 3) * Math.PI * source.radius ** 3;
        }
      }
    }
    return expected > shared.maxParticles ? shared.maxParticles / expected : 1;
  };

  const emitAll = (center) => {
    emissionCenter.x = Number(center.x) || 0;
    emissionCenter.z = Number(center.z) || 0;
    const scale = budgetScale();
    const records = { cutout: [], glow: [], soft: [] };

    const makeRecord = (id, e, x, y, z, rng, extra, fields) => {
      colorA.setRGB(...(e.colorA ?? e.color), THREE.SRGBColorSpace);
      colorB.setRGB(...(e.colorB ?? e.color), THREE.SRGBColorSpace);
      if (extra?.color) colorA.setRGB(...extra.color, THREE.SRGBColorSpace).lerp(colorB, 0.1);
      colorMix.copy(colorA).lerp(colorB, rng());
      records[GROUP_FOR_KIND[id]].push({
        gateJitter: rng(),
        kind: EFFECT_KIND[id],
        phase: rng(),
        seed: rng(),
        size: lerp(e.sizeRange[0], e.sizeRange[1], rng()),
        windResponse: e.windResponse * (0.8 + 0.4 * rng()),
        x, y, z,
        r: colorMix.r, g: colorMix.g, b: colorMix.b,
        ...fields(rng),
      });
    };

    const fallEmit = (id) => (x, y, z, rng, extra) => {
      const e = resolved[id];
      makeRecord(id, e, x, y, z, rng, extra, (r) => ({
        range: Math.min(Math.max(y - Number(heightAt(x, z) || 0) + 0.4, 1.5), 60),
        rate: (id === 'petals' ? e.flutter : e.tumble) * (0.75 + 0.5 * r()),
      }));
    };
    const hoverEmit = (id) => (x, y, z, rng, extra) => {
      const e = resolved[id];
      makeRecord(id, e, x, y, z, rng, extra, (r) => (id === 'fireflies'
        ? { range: e.hoverRadius * (0.6 + 0.8 * r()), rate: e.blinkSpeed * (0.7 + 0.6 * r()) }
        : { range: e.driftRadius * (0.5 + r()), rate: 0.8 + 1.2 * r() }));
    };
    const mistEmit = (x, y, z, rng, extra) => {
      const e = resolved.mist;
      makeRecord('mist', e, x, y, z, rng, extra, (r) => ({
        range: e.scrollSpan * (0.7 + 0.6 * r()),
        rate: 0.25 + 0.3 * r(),
      }));
    };

    const common = (id) => ({
      bounds: worldBounds,
      center: emissionCenter,
      heightAt,
      kindId: EFFECT_KIND[id],
      radius: windowRadius,
      seed: worldSeed,
    });

    // Petals/leaves: canopy-bound wherever bloom volumes registered for
    // them exist; the open-air fall band is the global fallback.
    for (const id of ['petals', 'leaves']) {
      counts[id] = 0;
      const density = effectiveDensity(id);
      if (!(density > 0)) continue;
      const sources = bloomSources.filter((s) => (s.effect ?? 'petals') === id);
      if (sources.length > 0) {
        counts[id] = emitCanopyBound({
          ...common(id),
          density: resolved[id].canopyDensity * densityMult[id] * scale,
          emit: fallEmit(id),
          sources,
        });
      } else {
        counts[id] = emitGlobalVolume({
          ...common(id),
          band: resolved[id].emitHeight,
          density: density * scale,
          emit: fallEmit(id),
          mask: effectMasks[id],
        });
      }
    }

    // Fireflies over grass/shore: a host mask wins; otherwise dry land near
    // the ground (they never hover over open deep water).
    counts.fireflies = effectiveDensity('fireflies') > 0
      ? emitGlobalVolume({
        ...common('fireflies'),
        band: resolved.fireflies.hoverHeight,
        density: effectiveDensity('fireflies') * scale,
        emit: hoverEmit('fireflies'),
        mask: effectMasks.fireflies ?? (Number.isFinite(waterLevel)
          ? (x, z) => Number(heightAt(x, z) || 0) > waterLevel + 0.05
          : null),
      })
      : 0;

    counts.pollen = effectiveDensity('pollen') > 0
      ? emitGlobalVolume({
        ...common('pollen'),
        band: resolved.pollen.hoverHeight,
        density: effectiveDensity('pollen') * scale,
        emit: hoverEmit('pollen'),
        mask: effectMasks.pollen,
      })
      : 0;

    // Mist hugs water margins when the world has a waterline, low ground
    // otherwise. Band is thin — wisps are a floor treatment, not a wall.
    counts.mist = 0;
    if (effectiveDensity('mist') > 0) {
      const mistOptions = {
        ...common('mist'),
        band: [0.1, 0.8],
        density: effectiveDensity('mist') * scale,
        emit: mistEmit,
        mask: effectMasks.mist,
      };
      counts.mist = Number.isFinite(waterLevel)
        ? emitWaterMargin({ ...mistOptions, margin: resolved.mist.marginWidth, waterLevel })
        : emitGlobalVolume(mistOptions);
    }

    for (const [groupId, group] of Object.entries(backbone.groups)) {
      group.setInstances(records[groupId]);
    }
    emittedOnce = true;
  };

  const applyGates = () => {
    for (const id of AMBIENTFX_EFFECT_IDS) {
      gateWeights[id] = timeGateWeight(resolved[id].gate, hour);
    }
    u.uGatePetals.value = gateWeights.petals;
    u.uGateLeaves.value = gateWeights.leaves;
    u.uGateFireflies.value = gateWeights.fireflies;
    u.uGatePollen.value = gateWeights.pollen;
    u.uGateMist.value = gateWeights.mist;
  };

  const resolveHourOption = (value) => {
    if (typeof value === 'function') return Number(value());
    if (value && typeof value === 'object') return Number(value.hour);
    return Number(value);
  };
  const initialHour = resolveHourOption(timeOfDay);
  hour = Number.isFinite(initialHour) ? initialHour : 13;
  applyGates();

  const resolveFocus = (camera) => {
    const target = followTarget;
    if (typeof target === 'function') {
      const result = target(focusScratch);
      if (result && Number.isFinite(result.x)) return result;
    } else if (target?.isObject3D) {
      return target.getWorldPosition(focusScratch);
    } else if (target && Number.isFinite(target.x)) {
      return focusScratch.set(target.x, target.y ?? 0, target.z ?? 0);
    }
    if (camera?.isObject3D) return camera.getWorldPosition(focusScratch);
    return focusScratch.set(emissionCenter.x, 0, emissionCenter.z);
  };

  const fx = {
    root,

    /** Live emission/window state (also what verify-ambientfx.mjs asserts). */
    get stats() {
      return {
        byEffect: { ...counts },
        capacity: Object.values(backbone.groups).reduce((sum, g) => sum + g.capacity, 0),
        center: { ...emissionCenter },
        drawCalls: Object.values(backbone.groups).filter((g) => g.count > 0).length,
        densityScales: { ...densityMult },
        gateWeights: { ...gateWeights },
        hour,
        liveParticles: Object.values(counts).reduce((sum, n) => sum + n, 0),
        wind: {
          direction: windDriftVector(shared.windDirection),
          speed: shared.windSpeed,
          strength: shared.windStrength,
        },
        windowRadius,
      };
    },

    settings: resolved,

    /**
     * Per frame. Ticks time, follows the target (or the camera when no
     * target is set), and re-emits the window when the focus has strayed
     * past RECENTER_FRACTION of the radius — world-anchored cells keep the
     * overlap bit-identical, so the swap is invisible.
     */
    update(delta, camera) {
      u.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
      if (typeof timeOfDay === 'function') {
        const next = Number(timeOfDay());
        if (Number.isFinite(next) && Math.abs(next - hour) > 1e-3) {
          hour = next;
          applyGates();
        }
      }
      const focus = resolveFocus(camera);
      u.uCenter.value.set(focus.x, focus.z);
      if (camera?.isObject3D) {
        // Billboard basis from the camera, CPU-side — backend-agnostic.
        const e = camera.matrixWorld.elements;
        u.uCamRight.value.set(e[0], e[1], e[2]);
        u.uCamUp.value.set(e[4], e[5], e[6]);
      }
      const dx = focus.x - emissionCenter.x;
      const dz = focus.z - emissionCenter.z;
      const stray = windowRadius * RECENTER_FRACTION;
      if (!emittedOnce || dx * dx + dz * dz > stray * stray) emitAll(focus);
      return fx;
    },

    /**
     * Shares the world wind. Accepts the grass-shaped settings object
     * `{ windDirection: [x, z], windSpeed, windStrength }` or the shorthand
     * `(headingRadians, strength)` — heading is CCW from +X, so
     * `setWind(0, 1)` blows toward +X and `setWind(Math.PI / 2, 1)` toward +Z.
     */
    setWind(directionOrSettings, strength) {
      if (typeof directionOrSettings === 'number') {
        shared.windDirection = [Math.cos(directionOrSettings), Math.sin(directionOrSettings)];
        if (Number.isFinite(strength)) shared.windStrength = Math.max(strength, 0);
      } else {
        const options = cleanObject(directionOrSettings);
        if (Array.isArray(options.windDirection) && options.windDirection.length >= 2) {
          shared.windDirection = [Number(options.windDirection[0]) || 0, Number(options.windDirection[1]) || 0];
        }
        if (Number.isFinite(options.windSpeed)) shared.windSpeed = options.windSpeed;
        if (Number.isFinite(options.windStrength)) shared.windStrength = Math.max(options.windStrength, 0);
      }
      u.uWindDir.value.set(shared.windDirection[0], shared.windDirection[1]);
      u.uWindSpeed.value = shared.windSpeed;
      u.uWindStrength.value = shared.windStrength;
      return fx;
    },

    /** Hour 0–24; fireflies/pollen/mist gates follow environmentTimeOfDay. */
    setTimeOfDay(hours) {
      const next = resolveHourOption(hours);
      if (Number.isFinite(next)) {
        hour = next;
        applyGates();
      }
      return fx;
    },

    /** Aims the pollen backlight / petal sheen — match the sun rig. */
    setSun({ direction } = {}) {
      if (Array.isArray(direction) && direction.length >= 3) {
        u.uSunDirection.value.set(direction[0], direction[1], direction[2]).normalize();
      } else if (direction?.isVector3) {
        u.uSunDirection.value.copy(direction).normalize();
      }
      return fx;
    },

    /**
     * Joins every particle to the environment shader's height-fog layer —
     * same parameters and formula as forest.setDistanceFog, so petals haze
     * out with the terrain instead of floating on it. Density 0 disables.
     */
    setDistanceFog({ color, density, falloff, floorY } = {}) {
      if (density !== undefined) u.uFogDensity.value = Math.max(Number(density) || 0, 0);
      if (falloff !== undefined) u.uFogFalloff.value = Math.max(Number(falloff) || 0, 0.001);
      if (floorY !== undefined) u.uFogFloorY.value = Number(floorY) || 0;
      if (color !== undefined) {
        const next = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color);
        u.uFogColor.value.copy(next);
      }
      return fx;
    },

    /** Emits immediately so construction-time stats and captures are valid. */
    emitNow(camera = null) {
      const focus = resolveFocus(camera);
      u.uCenter.value.set(focus.x, focus.z);
      emitAll(focus);
      return fx;
    },

    /**
     * Registers bloom volumes — `{ x, y, z, radius, color?, effect? }` per
     * emitters.js — and rebinds petals/leaves to them. Tree canopies are the
     * intended source; any sphere works.
     */
    addBloomSources(list = []) {
      for (const source of list) {
        if (!source || !Number.isFinite(Number(source.x))) continue;
        bloomSources.push({
          color: Array.isArray(source.color) ? source.color.slice(0, 3) : null,
          effect: source.effect === 'leaves' ? 'leaves' : 'petals',
          radius: Math.max(Number(source.radius) || 1.5, 0.4),
          x: Number(source.x), y: Number(source.y) || 0, z: Number(source.z) || 0,
        });
      }
      if (emittedOnce) emitAll(emissionCenter);
      return fx;
    },

    /** Re-emits in place — call after terrain/mask edits under the window. */
    refresh() {
      if (emittedOnce) emitAll(emissionCenter);
      return fx;
    },

    dispose() {
      for (const group of Object.values(backbone.groups)) group.dispose();
      root.parent?.remove(root);
    },
  };
  return fx;
}
