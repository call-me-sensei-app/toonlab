// The weapon-move library: authored default motions the VFX rides on, so a
// designer only tunes the LOOK — the swing itself is provided. Every move is
// PURE DATA broken into phases (windup → strike → recover …), and each phase
// carries its own VFX event track (trail on/off, impact, landing, dust).
// Elaborate moves decompose the same way — `plunge` is the Dragoon jump:
// crouch → leap → apex → dive → landfall → recover, six phases, each with
// its beats.
//
// Conventions (what weapons/stylizedWeapons.js provides):
//   - actor origin at (0,0,0), facing −X; grip pose is relative to it
//   - pose = { p: [x, y, z] grip position, r: [rx, ry, rz] euler 'XYZ' },
//     weapon blade along local +Y
//   - phase durations are seconds at weight 1; a weapon profile's `weight`
//     multiplies time (dagger flicks, hammer commits) and impact power
//
// This module is pure math — no THREE — so verify-vfxgen.mjs exercises the
// full move set in Node. moves/moveController.js is the THREE-side driver.

const HALF_PI = Math.PI / 2;
const REST = { p: [0.35, 1.0, 0.25], r: [0, 0, -0.35] };

/** Grip on a circle around the actor, blade pointing outward, horizontal. */
function arcPose(theta, { height = 1.15, radius = 0.55 } = {}) {
  return {
    p: [Math.cos(theta) * radius, height, Math.sin(theta) * radius],
    r: [0, -theta, -HALF_PI],
  };
}

const key = (t, pose) => ({ t, ...pose });

/**
 * Grip pose for a PLANE swing: the blade rotates about a shoulder pivot in
 * the actor's X/Y plane (a real cut crosses the body in a plane — orbiting
 * the actor like a cylinder folds the trail into a chevron from most
 * cameras). rz is the blade angle: 0 = straight up, +ve sweeps toward the
 * actor's left/down.
 */
function swingPose(rz, { pivot = [0, 1.25, 0.1], reach = 0.35 } = {}) {
  const dir = [-Math.sin(rz), Math.cos(rz), 0];
  return {
    p: [pivot[0] + dir[0] * reach, pivot[1] + dir[1] * reach, pivot[2] + dir[2] * reach],
    r: [0, 0, rz],
  };
}

const MOVES = {
  slash: {
    id: 'slash',
    label: 'Slash',
    description: 'A wide plane cut across the body — the bread-and-butter swing; the trail draws one continuous ~200° crescent.',
    phases: [
      {
        id: 'windup',
        duration: 0.22,
        keys: [key(0, REST), key(1, swingPose(-1.7))],
        events: [],
      },
      {
        id: 'strike',
        duration: 0.18,
        // Four keys keep the interpolated arc round across the wide sweep.
        keys: [
          key(0, swingPose(-1.7)),
          key(0.35, swingPose(-0.5)),
          key(0.7, swingPose(0.9)),
          key(1, swingPose(2.3)),
        ],
        events: [
          { at: 0, do: 'trailStart' },
          { at: 0.6, do: 'impact', power: 1.0 },
        ],
      },
      {
        id: 'recover',
        duration: 0.3,
        keys: [key(0, swingPose(2.3)), key(1, REST)],
        events: [{ at: 0.15, do: 'trailStop' }],
      },
    ],
  },

  overhead: {
    id: 'overhead',
    label: 'Overhead',
    description: 'Raise over the shoulder, chop down through the front.',
    phases: [
      {
        id: 'windup',
        duration: 0.28,
        keys: [key(0, REST), key(1, { p: [0.15, 1.62, 0.15], r: [0, 0, -0.5] })],
        events: [],
      },
      {
        id: 'strike',
        duration: 0.16,
        keys: [
          key(0, { p: [0.15, 1.62, 0.15], r: [0, 0, -0.5] }),
          key(0.55, { p: [-0.3, 1.25, 0.12], r: [0, 0, HALF_PI] }),
          key(1, { p: [-0.52, 0.72, 0.1], r: [0, 0, 2.62] }),
        ],
        events: [
          { at: 0, do: 'trailStart' },
          { at: 0.8, do: 'impact', power: 1.25 },
        ],
      },
      {
        id: 'recover',
        duration: 0.32,
        keys: [key(0, { p: [-0.52, 0.72, 0.1], r: [0, 0, 2.62] }), key(1, REST)],
        events: [{ at: 0.15, do: 'trailStop' }],
      },
    ],
  },

  thrust: {
    id: 'thrust',
    label: 'Thrust',
    description: 'Coil back and lunge the point straight forward — spears live here.',
    phases: [
      {
        id: 'windup',
        duration: 0.18,
        keys: [key(0, REST), key(1, { p: [0.5, 1.12, 0.12], r: [0, 0, HALF_PI] })],
        events: [],
      },
      {
        id: 'strike',
        duration: 0.12,
        keys: [
          key(0, { p: [0.5, 1.12, 0.12], r: [0, 0, HALF_PI] }),
          key(1, { p: [-0.78, 1.12, 0.05], r: [0, 0, HALF_PI] }),
        ],
        events: [
          { at: 0, do: 'trailStart' },
          { at: 0.85, do: 'impact', power: 0.9 },
        ],
      },
      {
        id: 'recover',
        duration: 0.26,
        keys: [key(0, { p: [-0.78, 1.12, 0.05], r: [0, 0, HALF_PI] }), key(1, REST)],
        events: [{ at: 0.2, do: 'trailStop' }],
      },
    ],
  },

  spin: {
    id: 'spin',
    label: 'Spin',
    description: 'Full 360° sweep — the trail draws a complete circle.',
    phases: [
      {
        id: 'windup',
        duration: 0.2,
        keys: [key(0, REST), key(1, arcPose(Math.PI + 0.3, { height: 1.18 }))],
        events: [],
      },
      {
        id: 'strike',
        duration: 0.5,
        // Five keys around the circle keep the interpolated arc round.
        keys: [0, 0.25, 0.5, 0.75, 1].map((t) =>
          key(t, arcPose(Math.PI + 0.3 - t * Math.PI * 2, { height: 1.18, radius: 0.62 }))),
        events: [
          { at: 0, do: 'trailStart' },
          { at: 0.45, do: 'impact', power: 0.8 },
        ],
      },
      {
        id: 'recover',
        duration: 0.26,
        keys: [key(0, arcPose(Math.PI + 0.3 - Math.PI * 2, { height: 1.18, radius: 0.62 })), key(1, REST)],
        events: [{ at: 0.1, do: 'trailStop' }],
      },
    ],
  },

  plunge: {
    id: 'plunge',
    label: 'Plunge',
    description: 'The Dragoon jump, decomposed: crouch → leap → apex → dive → landfall → recover.',
    phases: [
      {
        id: 'crouch',
        duration: 0.28,
        keys: [key(0, REST), key(1, { p: [0.3, 0.68, 0.2], r: [0, 0, -0.6] })],
        events: [{ at: 0.2, do: 'dust' }],
      },
      {
        id: 'leap',
        duration: 0.4,
        keys: [
          key(0, { p: [0.3, 0.68, 0.2], r: [0, 0, -0.6] }),
          key(1, { p: [0.15, 3.4, 0.12], r: [0, 0, -0.15] }),
        ],
        events: [
          { at: 0.1, do: 'trailStart' },
          { at: 0.85, do: 'trailStop' },
        ],
      },
      {
        id: 'apex',
        duration: 0.15,
        // Hang beat: flip the blade to point straight down for the dive.
        keys: [
          key(0, { p: [0.15, 3.4, 0.12], r: [0, 0, -0.15] }),
          key(1, { p: [-0.45, 3.28, 0.08], r: [0, 0, Math.PI] }),
        ],
        events: [],
      },
      {
        id: 'dive',
        duration: 0.22,
        keys: [
          key(0, { p: [-0.45, 3.28, 0.08], r: [0, 0, Math.PI] }),
          key(1, { p: [-1.7, 0.45, 0], r: [0, 0, Math.PI] }),
        ],
        events: [{ at: 0, do: 'trailStart' }],
      },
      {
        id: 'landfall',
        duration: 0.3,
        keys: [
          key(0, { p: [-1.7, 0.45, 0], r: [0, 0, Math.PI] }),
          key(1, { p: [-1.6, 0.55, 0.05], r: [0, 0, 2.6] }),
        ],
        events: [
          { at: 0, do: 'impact', power: 2.2 },
          { at: 0, do: 'landing', power: 2.0 },
          { at: 0.12, do: 'dust' },
          { at: 0.15, do: 'trailStop' },
        ],
      },
      {
        id: 'recover',
        duration: 0.35,
        keys: [key(0, { p: [-1.6, 0.55, 0.05], r: [0, 0, 2.6] }), key(1, REST)],
        events: [],
      },
    ],
  },
};

export const MOVE_IDS = Object.freeze(Object.keys(MOVES));

export function getMove(id) {
  return MOVES[id] ?? null;
}

/** `{ id, label, description, phases: [ids] }` list for pickers/docs. */
export function getMoveOptions() {
  return MOVE_IDS.map((id) => ({
    description: MOVES[id].description,
    id,
    label: MOVES[id].label,
    phases: MOVES[id].phases.map((phase) => phase.id),
  }));
}

/** Total seconds of a move for a weapon weight (heavier = slower). */
export function moveDuration(move, weight = 1) {
  return move.phases.reduce((sum, phase) => sum + phase.duration, 0) * Math.max(weight, 0.05);
}

function smooth(t) {
  const u = Math.min(Math.max(t, 0), 1);
  return u * u * (3 - 2 * u);
}

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function interpolateKeys(keys, t) {
  if (t <= keys[0].t) return { p: [...keys[0].p], r: [...keys[0].r] };
  for (let i = 1; i < keys.length; i += 1) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const u = smooth((t - a.t) / Math.max(b.t - a.t, 1e-6));
      return { p: lerp3(a.p, b.p, u), r: lerp3(a.r, b.r, u) };
    }
  }
  const last = keys[keys.length - 1];
  return { p: [...last.p], r: [...last.r] };
}

/**
 * Grip pose at `time` seconds into a move for a weapon weight. Returns
 * `{ p, r, phaseId, done }`; after the move ends it holds the final pose
 * with `done: true` so controllers can settle and release.
 */
export function sampleMovePose(move, time, weight = 1) {
  const scale = Math.max(weight, 0.05);
  let cursor = 0;
  for (const phase of move.phases) {
    const span = phase.duration * scale;
    if (time < cursor + span) {
      const local = (time - cursor) / span;
      return { ...interpolateKeys(phase.keys, local), done: false, phaseId: phase.id };
    }
    cursor += span;
  }
  const lastPhase = move.phases[move.phases.length - 1];
  return { ...interpolateKeys(lastPhase.keys, 1), done: true, phaseId: lastPhase.id };
}

/**
 * Events whose scaled absolute time falls in (t0, t1] — controllers call
 * this once per frame with the previous/current clock so every beat fires
 * exactly once regardless of frame rate. Impact power scales with weight
 * (a hammer landing carries more than a dagger flick).
 */
export function collectMoveEvents(move, t0, t1, weight = 1) {
  const scale = Math.max(weight, 0.05);
  const fired = [];
  let cursor = 0;
  for (const phase of move.phases) {
    const span = phase.duration * scale;
    for (const event of phase.events) {
      const at = cursor + event.at * span;
      if (at > t0 && at <= t1) {
        fired.push({
          ...event,
          phaseId: phase.id,
          power: event.power !== undefined ? event.power * (0.6 + 0.4 * scale) : undefined,
          time: at,
        });
      }
    }
    cursor += span;
  }
  return fired.sort((a, b) => a.time - b.time);
}
