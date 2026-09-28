import * as THREE from 'three';

const workingPosition = new THREE.Vector3();

// Tracks objects interacting with a WaterSurface and converts their motion
// into ripples, wakes, and splashes:
//   - fast downward crossing of the surface -> entry splash + ripple ring
//   - fast upward exit -> smaller exit splash
//   - horizontal movement while touching the water -> wake ripples + foam
//
// Interactor sources can be a THREE.Object3D or a function/object producing a
// world position, so physics bodies (e.g. rapier) hook in without adapters.
export class WaterInteractionManager {
  constructor(surface, {
    wakeInterval = 0.07,
    entrySplashSpeed = 1.4,
    exitSplashSpeed = 2.2,
    minWakeSpeed = 0.12,
  } = {}) {
    this.surface = surface;
    this.wakeInterval = wakeInterval;
    this.entrySplashSpeed = entrySplashSpeed;
    this.exitSplashSpeed = exitSplashSpeed;
    this.minWakeSpeed = minWakeSpeed;
    this.interactors = new Map();
    this.nextId = 1;
  }

  resolvePosition(source, out) {
    if (typeof source === 'function') {
      const result = source(out);
      if (result && result !== out) out.set(result.x ?? 0, result.y ?? 0, result.z ?? 0);
      return out;
    }
    if (source?.isObject3D) return source.getWorldPosition(out);
    if (typeof source?.getPosition === 'function') {
      const result = source.getPosition(out);
      if (result && result !== out) out.set(result.x ?? 0, result.y ?? 0, result.z ?? 0);
      return out;
    }
    if (source && Number.isFinite(source.x)) return out.set(source.x, source.y ?? 0, source.z ?? 0);
    return out.set(0, -1e6, 0);
  }

  // Options: radius (m), splashStrength / wakeStrength multipliers, splashes /
  // wakes toggles, onSplash(event) callback.
  add(source, options = {}) {
    const id = options.id ?? `interactor-${this.nextId += 1}`;
    this.interactors.set(id, {
      source,
      radius: options.radius ?? 0.35,
      // Vertical extent above the tracked point. For tall bodies (characters,
      // boats) this makes "touching" mean the waterline passes through the
      // body, so chest-deep wading wakes but a fully submerged body is silent.
      height: options.height ?? 0,
      splashStrength: options.splashStrength ?? 1,
      wakeStrength: options.wakeStrength ?? 1,
      splashes: options.splashes ?? true,
      wakes: options.wakes ?? true,
      onSplash: options.onSplash ?? null,
      previousPosition: new THREE.Vector3(0, -1e6, 0),
      wasTouching: false,
      wasAboveSurface: true,
      wasBelowSurface: false,
      wakeTimer: 0,
      initialized: false,
    });
    return id;
  }

  remove(id) {
    this.interactors.delete(id);
  }

  clear() {
    this.interactors.clear();
  }

  update(delta) {
    if (delta <= 0) return;
    for (const interactor of this.interactors.values()) {
      this.updateInteractor(interactor, delta);
    }
  }

  updateInteractor(interactor, delta) {
    const position = this.resolvePosition(interactor.source, workingPosition);
    if (position.y < -1e5) return;

    if (!interactor.initialized) {
      interactor.previousPosition.copy(position);
      interactor.initialized = true;
      interactor.wasTouching = false;
      interactor.wasAboveSurface = true;
      interactor.wasBelowSurface = false;
      return;
    }

    const surface = this.surface;
    const inArea = surface.containsPoint(position.x, position.z);
    const waterHeight = surface.getHeightAt(position.x, position.z);
    const height = typeof interactor.height === 'function' ? interactor.height() : interactor.height;
    const top = position.y + Math.max(height, interactor.radius);
    const bottom = position.y - interactor.radius;
    // Surface effects only happen where the waterline actually passes through
    // the interactor volume. A body running along the seabed (fully below) or
    // flying above leaves the surface untouched.
    const touching = inArea && waterHeight >= bottom - 0.05 && waterHeight <= top + 0.05;
    const aboveSurface = bottom > waterHeight;
    const belowSurface = top < waterHeight;

    const velocityY = (position.y - interactor.previousPosition.y) / delta;
    const planarSpeed = Math.hypot(
      position.x - interactor.previousPosition.x,
      position.z - interactor.previousPosition.z) / delta;

    // Crossing detection uses the previous frame's relation to the surface so
    // a fast fall that skips past the waterline band in one step still counts.
    const enteredFromAbove = interactor.wasAboveSurface && (touching || belowSurface);
    const exitedUpward = (interactor.wasTouching || interactor.wasBelowSurface) && aboveSurface;

    if (inArea && enteredFromAbove && interactor.splashes &&
      velocityY < -this.entrySplashSpeed) {
      const strength = Math.min(2.4, 0.4 + Math.abs(velocityY) * 0.22) *
        interactor.splashStrength * (0.6 + interactor.radius);
      surface.splash(position, { strength, radius: interactor.radius * 2.2 });
      interactor.onSplash?.({ type: 'enter', position: position.clone(), strength });
    } else if (inArea && exitedUpward && interactor.splashes &&
      velocityY > this.exitSplashSpeed) {
      const strength = Math.min(1.4, 0.3 + velocityY * 0.1) * interactor.splashStrength;
      surface.splash(position, { strength: strength * 0.7, radius: interactor.radius * 1.6 });
      interactor.onSplash?.({ type: 'exit', position: position.clone(), strength });
    }

    if (interactor.wakes && interactor.wasTouching && belowSurface && velocityY < -0.3) {
      surface.addRipple(position, { radius: interactor.radius * 1.4, strength: -0.4 * interactor.wakeStrength });
    } else if (interactor.wakes && interactor.wasBelowSurface && touching && velocityY > 0.3) {
      surface.addRipple(position, { radius: interactor.radius * 1.4, strength: 0.35 * interactor.wakeStrength });
    }

    if (touching && interactor.wakes) {
      interactor.wakeTimer -= delta;
      if (planarSpeed > this.minWakeSpeed && interactor.wakeTimer <= 0) {
        const speedFactor = Math.min(planarSpeed, 4);
        // A body pushing through water makes a V-wake, not concentric rings:
        // a rising bow push just ahead, and a pair of depressions at the
        // flanks slightly behind. The propagating pair draws the trailing V.
        const stepX = position.x - interactor.previousPosition.x;
        const stepZ = position.z - interactor.previousPosition.z;
        const stepLength = Math.hypot(stepX, stepZ) || 1;
        const dirX = stepX / stepLength;
        const dirZ = stepZ / stepLength;
        const sideX = -dirZ;
        const sideZ = dirX;
        const radius = interactor.radius;
        const wakeStrength = speedFactor * interactor.wakeStrength;
        surface.addRipple({
          x: position.x + dirX * radius * 1.15,
          z: position.z + dirZ * radius * 1.15,
        }, { radius: radius * (0.9 + speedFactor * 0.1), strength: 0.16 * wakeStrength });
        const backX = position.x - dirX * radius * 0.5;
        const backZ = position.z - dirZ * radius * 0.5;
        surface.addRipple({
          x: backX + sideX * radius,
          z: backZ + sideZ * radius,
        }, { radius: radius * 0.85, strength: -0.12 * wakeStrength });
        surface.addRipple({
          x: backX - sideX * radius,
          z: backZ - sideZ * radius,
        }, { radius: radius * 0.85, strength: -0.12 * wakeStrength });
        // Fast movers kick up a little spray off the bow.
        if (planarSpeed > 1.8 && interactor.splashes) {
          surface.sprayAt({
            x: position.x + dirX * radius,
            y: position.y,
            z: position.z + dirZ * radius,
          }, {
            count: Math.round(2 + speedFactor),
            strength: speedFactor * 0.22 * interactor.splashStrength,
          });
        }
        interactor.wakeTimer = this.wakeInterval / Math.max(planarSpeed, 1);
      }
    } else {
      interactor.wakeTimer = 0;
    }

    interactor.wasTouching = touching;
    interactor.wasAboveSurface = aboveSurface;
    interactor.wasBelowSurface = belowSurface;
    interactor.previousPosition.copy(position);
  }
}
