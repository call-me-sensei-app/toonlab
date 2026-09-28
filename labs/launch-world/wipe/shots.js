// §11 camera and shot plan — the ten launch-video shots as data, plus the
// lens/motion rig that drives a camera from them.
//
// SCOPE CHANGE 2026-08-15 — the city was cancelled, then the coast; the launch
// scene is Stillwater Garden (`launch-plan/20-stillwater-garden-scene-brief.md`),
// a compact Japanese garden. Every shot is re-sited to `garden`.
//
// Lenses, durations and motion are §11 VERBATIM and unchanged: §11 is a
// photographic plan, not a location plan, and re-siting does not alter it.
// Shots whose §11 ACTION referenced city or coastal content carry `resiting` —
// a note naming what the scene owner still has to choose. Nothing is silently
// reinterpreted, and no lens has been quietly widened to make a smaller scene
// fill the frame.
//
// The garden is ~40 x 40 m walkable with ~24 x 18 m of hero camera space, which
// bites on the two 50 mm locked shots: at 22.9 deg vertical, a wide read costs
// DISTANCE, and there is much less of it here than on a headland. S07's framing
// is therefore the tightest constraint in the plan and is solved from the lens
// (see `solveDistanceForSubjectBand`) rather than eyeballed.
//
// S07 is now the headline shot of the whole video: a whole-scene garden wipe
// flips terrain, gravel, moss, stone, trees, water, sky, cloud and Yua at once.
//
// FILL-001. This is scene-local today; the post-merge home is `src/camera/`
// beside cameraRig.js, because "give me a camera at a real focal length, and
// tell me what render policy this shot requires" is a general ToonLab need and
// not a launch-world one. See docs/capability-status.md.
//
// LENS. §11 specifies photographic focal lengths (28/50/70/35/24/32/50/85/28/40
// mm). three.js `PerspectiveCamera.fov` is a VERTICAL angle, so a focal length
// only becomes an fov once a film gauge and an aspect ratio are known. The rig
// pins `filmGauge = 36` (full-frame horizontal) and calls three's own
// `setFocalLength`, which derives film height as `gauge / aspect`. At the §11
// master aspect of 3840x2160 that puts a 50 mm at 22.87 deg vertical — the real
// 50 mm framing, not an approximation of it. The fov is therefore RE-DERIVED on
// every resize; a fixed fov would silently change the lens with the window.
//
// A/B RENDER POLICY. §11: "physically consistent motion blur disabled during
// A/B wipes, ... stable exposure." Motion blur is a temporal accumulation, so
// the two scissored renders of one frame would carry different histories and
// the wipe would compare shading against shading-plus-smear. Exposure is shared
// by construction — the comparison never touches `toneMappingExposure` between
// the two renders — and `exposureLocked` records that a shot must not animate
// it either.

/** Full-frame horizontal film gauge, in millimetres. */
export const LAUNCH_FILM_GAUGE_MM = 36;

/** The §11 master format. Lens fov is derived against this aspect. */
export const LAUNCH_MASTER_FORMAT = Object.freeze({ height: 2160, width: 3840 });

/**
 * §11's shot plan verbatim, as data. `ab` is the wipe axis when the shot is a
 * comparison and `null` otherwise; `motion` names the camera behaviour.
 */
export const LAUNCH_SHOTS = Object.freeze([
  Object.freeze({
    ab: null, end: 5, id: 'S01', lensMm: 28, motion: 'crane-dolly', scene: 'garden',
    label: 'Crane/dolly reveal, Yua enters through the garden gate',
    point: 'Premium world and character',
    resiting: 'Was "City crane/dolly reveal, Yua enters plaza". The reveal move is unchanged; the scene owner picks the gate approach. A 28 mm crane in a 40 m garden must start low and close — there is no room for a city-scale reveal arc.',
    start: 0,
  }),
  Object.freeze({
    ab: 'vertical', end: 11, id: 'S02', lensMm: 50, motion: 'locked', scene: 'garden',
    label: 'Locked Yua three-quarter on the stone path; neutral-to-ToonLab vertical wipe',
    point: 'Shader difference',
    resiting: 'Re-sited city plaza -> coastal overlook -> garden stone path. Locked 50 mm unchanged.',
    start: 5, subject: 'character',
    // PROVISIONAL. The garden brief gives a layout, not coordinates. Yua stands
    // on the stone path near the gate looking north-northwest into the garden,
    // so the teahouse, lantern and maple sit behind her. The scene owner owns
    // the authored mark; `markSource` says which of us it came from so it is
    // never mistaken for a spec value.
    subjectMark: Object.freeze({
      bearingDeg: 337.5,
      facing: 'north-northwest',
      markSource: 'provisional-camera-owner',
      position: Object.freeze([0, 0, 6]),
    }),
  }),
  Object.freeze({
    ab: null, end: 17, id: 'S03', lensMm: 70, motion: 'orbit', scene: 'garden',
    label: 'Face/hair/clothing close-up with controlled orbit',
    point: 'Material roles, outlines, highlights', start: 11,
  }),
  Object.freeze({
    ab: null, end: 25, id: 'S04', lensMm: 35, motion: 'track', scene: 'garden',
    label: 'Yua walks the stepping stones past the teahouse terrace',
    point: 'Retargeting, shadows, materials',
    resiting: 'Was "walks past real storefront glazing and interior depth". The teahouse is the only structure with interior depth in a garden; its shoji/timber terrace carries the material point instead of storefront glazing. Scene owner to confirm.',
    start: 17,
  }),
  Object.freeze({
    ab: null, end: 32, id: 'S05', lensMm: 24, motion: 'match-cut', scene: 'garden',
    label: 'Wide on the pond and sky',
    point: 'Environment breadth',
    resiting: 'Was a CITY-TO-COAST match cut. With one scene there is nothing to cut FROM. Kept as a 24 mm wide on the pond/sky motif; the editor may instead fold this duration into S06. NOTE: 24 mm is the widest lens in the plan and a 40 m garden is the smallest scene — this shot is the most likely to reveal the boundary wall.',
    start: 25,
  }),
  Object.freeze({
    ab: null, end: 40, id: 'S06', lensMm: 32, motion: 'lateral', scene: 'garden',
    label: 'Lateral move across moss, set stone, cascade and teahouse',
    point: 'ToonLab natural systems',
    resiting: 'Was "across grass, rocks, surf, cafe".',
    start: 32,
  }),
  Object.freeze({
    ab: 'vertical', end: 47, id: 'S07', lensMm: 50, motion: 'locked', scene: 'garden',
    label: 'Locked whole-garden neutral-to-ToonLab wipe',
    point: 'Whole-scene conversion',
    resiting: 'Was the coastal whole-scene wipe. Now the headline shot of the video: gravel, moss, stone, maple, pine, pond, sky, cloud and Yua all convert in one frame.',
    start: 40, subject: 'scene',
  }),
  Object.freeze({
    ab: null, end: 55, id: 'S08', lensMm: 85, motion: 'detail-montage', scene: 'garden',
    label: 'Pond/moss/maple/set-stone detail montage',
    point: 'Individual system quality', start: 47,
  }),
  Object.freeze({
    ab: null, end: 65, id: 'S09', lensMm: 28, motion: 'follow', scene: 'garden',
    label: 'Walkable Yua hero movement through the garden',
    point: 'Integrated runtime', start: 55,
  }),
  Object.freeze({
    ab: null, end: 72, id: 'S10', lensMm: 40, motion: 'hero-hold', scene: 'garden',
    label: 'Final garden hero composition and ToonLab Pro title',
    point: 'Brand close',
    resiting: 'Was a combined city/coast composition. Now a single garden hero hold.',
    start: 65,
  }),
]);

export const LAUNCH_SHOT_IDS = Object.freeze(LAUNCH_SHOTS.map((shot) => shot.id));

export function resolveLaunchShot(id) {
  return LAUNCH_SHOTS.find((shot) => shot.id === String(id ?? '').toUpperCase()) ?? LAUNCH_SHOTS[0];
}

/**
 * Vertical field of view in degrees for a focal length at an aspect ratio.
 * Exported so a capture script can assert the lens without instantiating a
 * camera.
 */
export function verticalFovForLens(lensMm, aspect, { filmGaugeMm = LAUNCH_FILM_GAUGE_MM } = {}) {
  const filmHeight = filmGaugeMm / Math.max(aspect, 1);
  return (180 / Math.PI) * 2 * Math.atan((0.5 * filmHeight) / lensMm);
}

/**
 * Camera distance that makes a subject of `subjectBandMetres` exactly fill the
 * frame height at a given vertical fov. Framing in a small scene has to be
 * SOLVED from the lens, not guessed: at a fixed focal length the only way to
 * change how much fits in frame is to move, and a 40 x 40 m garden does not
 * always have the room. A shot that cannot reach its distance inside the
 * playable footprint is a composition problem to raise, not a lens to widen.
 */
export function solveDistanceForSubjectBand(subjectBandMetres, verticalFovDeg) {
  return subjectBandMetres / (2 * Math.tan((verticalFovDeg * Math.PI) / 360));
}

/**
 * Stillwater Garden's playable footprint, from the scene brief §2.
 * Used to check whether a shot's solved camera distance actually exists.
 */
export const GARDEN_FOOTPRINT = Object.freeze({
  heroCamera: Object.freeze({ depth: 18, width: 24 }),
  walkable: Object.freeze({ depth: 40, width: 40 }),
});

/**
 * Does a shot's required camera distance fit inside the scene?
 *
 * This is the check a small scene needs and a large one never does. At a fixed
 * focal length the ONLY way to fit more in frame is to move further back, and a
 * 40 x 40 m garden runs out of room long before a headland would.
 *
 * Measured for the two locked 50 mm shots at the §11 master aspect (22.90 deg
 * vertical):
 *
 *   S02, 1.62 m subject band (Yua three-quarter)  ->  4.0 m. Fits easily.
 *   S07, 12 m subject band (a wide garden read)   -> 29.6 m. Does NOT fit
 *                                                     inside the 40 m walkable
 *                                                     footprint from any
 *                                                     interior mark, and is
 *                                                     well outside the 24 x 18 m
 *                                                     hero camera space.
 *
 * That is a real composition constraint, not a lens to quietly widen. §11's
 * product point for S07 is "Whole-scene CONVERSION" — every domain flipping in
 * one frame — which a 6-8 m band at ~15-20 m satisfies while still reading as
 * the garden. Widening S07 off 50 mm would break its pairing with S02, which is
 * the whole reason the two wipes share a lens.
 *
 * @returns {{distance: number, fits: boolean, limit: number, note: string}}
 */
export function assertShotFitsFootprint(shot, subjectBandMetres, aspect, {
  footprint = GARDEN_FOOTPRINT,
} = {}) {
  const resolved = typeof shot === 'string' ? resolveLaunchShot(shot) : shot;
  const distance = solveDistanceForSubjectBand(
    subjectBandMetres,
    verticalFovForLens(resolved.lensMm, aspect),
  );
  // Half the diagonal of the walkable footprint is the furthest an interior
  // camera can stand from a centred subject.
  const limit = Math.hypot(footprint.walkable.width, footprint.walkable.depth) / 2;
  const fits = distance <= limit;
  return {
    distance,
    fits,
    limit,
    note: fits
      ? `${resolved.lensMm} mm needs ${distance.toFixed(1)} m for a ${subjectBandMetres} m band; ${limit.toFixed(1)} m is available.`
      : `${resolved.lensMm} mm needs ${distance.toFixed(1)} m for a ${subjectBandMetres} m band but only ${limit.toFixed(1)} m exists inside the footprint. Reduce the band, or shoot from outside the walkable area — do not widen the lens, which would break the S02/S07 pairing.`,
  };
}

/**
 * The render policy a shot imposes. §11 forbids motion blur during an A/B wipe
 * and requires stable exposure throughout.
 */
export function shotRenderPolicy(shot) {
  const resolved = typeof shot === 'string' ? resolveLaunchShot(shot) : shot;
  const isComparison = Boolean(resolved?.ab);
  return {
    exposureLocked: true,
    isComparison,
    // Temporal accumulation would give the two scissored renders of one frame
    // different histories, so the wipe would be comparing shading against
    // shading-plus-smear.
    motionBlur: !isComparison,
    reason: isComparison
      ? 'A/B wipe: motion blur disabled and exposure held so both halves differ only by material treatment.'
      : 'Non-comparison shot: motion blur available; exposure still held for cross-shot continuity.',
  };
}

/**
 * Camera rig for the §11 shot plan. Owns the lens (as a focal length, not an
 * fov), the shot's motion, and the render policy handed to the post pipeline.
 *
 * @param {object} options
 * @param {import('three').PerspectiveCamera} options.camera
 * @param {{setSettings: Function, settings?: object}} [options.post]
 *   Optional post pipeline; the rig toggles `features.motionBlur` per shot.
 */
export function createLaunchShotRig({ camera, post = null } = {}) {
  if (!camera?.isPerspectiveCamera) {
    throw new TypeError('createLaunchShotRig requires a THREE.PerspectiveCamera.');
  }
  camera.filmGauge = LAUNCH_FILM_GAUGE_MM;
  camera.filmOffset = 0;

  let shot = LAUNCH_SHOTS[0];
  let aspect = camera.aspect || (LAUNCH_MASTER_FORMAT.width / LAUNCH_MASTER_FORMAT.height);
  let appliedPolicy = shotRenderPolicy(shot);

  function applyLens() {
    camera.aspect = aspect;
    // three derives film height as gauge / max(aspect, 1), so the lens is only
    // correct once the live aspect is set. Re-derive on every resize.
    camera.setFocalLength(shot.lensMm);
    camera.updateProjectionMatrix();
    return camera.fov;
  }

  function applyPolicy() {
    appliedPolicy = shotRenderPolicy(shot);
    if (post && typeof post.setSettings === 'function') {
      post.setSettings({ features: { motionBlur: appliedPolicy.motionBlur } });
    }
    return appliedPolicy;
  }

  return {
    get aspect() { return aspect; },
    get camera() { return camera; },
    get lensMm() { return shot.lensMm; },
    get policy() { return { ...appliedPolicy }; },
    get shot() { return shot; },
    /** Report used by the capture script and the Gate 3 evidence. */
    describe() {
      return {
        aspect,
        exposureLocked: appliedPolicy.exposureLocked,
        filmGaugeMm: camera.filmGauge,
        fovDeg: camera.fov,
        isComparison: appliedPolicy.isComparison,
        lensMm: shot.lensMm,
        motion: shot.motion,
        motionBlur: appliedPolicy.motionBlur,
        shot: shot.id,
        wipeAxis: shot.ab,
      };
    },
    setAspect(next) {
      const value = Number(next);
      if (Number.isFinite(value) && value > 0) aspect = value;
      return applyLens();
    },
    setShot(id) {
      shot = typeof id === 'string' ? resolveLaunchShot(id) : (id ?? shot);
      applyLens();
      applyPolicy();
      return shot;
    },
  };
}
