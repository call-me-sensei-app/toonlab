// Stillwater Lane — overhead wires.
//
// Spec: launch-plan/21-stillwater-lane-street-addendum.md §3 ("Overhead wires are worth their
// own mention — they are a defining feature of Japanese urban streets and appear in every
// reference plate. Cheap geometry, enormous density return, and they break the sky exactly
// where §4 wants silhouette variety") and §2 depth band 5 (enclosure).
//
// WHY THESE ARE NOT GENERATED
//
// PROP-LANE-03's concept was prompted with "No strung wires or cables" deliberately. A wire is
// 8-15 mm across and tens of metres long: single-image generation cannot resolve it, and even
// if it could, the wire run is a function of where the poles END UP in the scene, which is not
// knowable at generation time. The generated asset is therefore the pole HARDWARE — pole,
// crossarms, insulators, transformer can, junction box, stay anchor — and the spans between
// them are solved here, procedurally, against the poles' actual placed positions.
//
// This is the same division the rest of the launch world uses: generation supplies form that is
// expensive to author, first-party code supplies everything that is a function of the scene.
//
// COST
//
// A 12 m span at 24 length segments x 3 radial segments is 144 triangles. A dense Japanese
// street reads at roughly 30-40 spans, so the entire wire network lands near 5k triangles —
// well under one supporting prop, for what §3 calls "enormous density return". Three radial
// segments is deliberate: at 10 mm diameter the silhouette against sky is the only thing the
// eye resolves, and a triangular prism has exactly the same silhouette as a cylinder there.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Real-world conductor diameters, in metres.
 *
 * Not eyeballed: Japanese distribution streets carry a visible hierarchy, and reproducing it is
 * most of why a wire run reads as a real street rather than as a set of parallel lines. The
 * heavy primaries sit highest on the crossarms, the service drops are the thin ones that peel
 * off toward the buildings, and the communications bundle is the fat lashed one lower down.
 */
export const LANE_WIRE_GAUGES = Object.freeze({
  primary: 0.014,
  secondary: 0.010,
  comms: 0.022,
  drop: 0.008,
});

/**
 * Sag as a fraction of span length.
 *
 * Sag is what separates a wire from a wireframe line. A dead-straight span reads as a modelling
 * error at any distance, and an over-sagged one reads as rope. 0.02-0.05 of span is the real
 * range for a tensioned distribution conductor; the heavier lashed comms bundle sags more.
 */
export const LANE_WIRE_SAG = Object.freeze({
  primary: 0.022,
  secondary: 0.030,
  comms: 0.045,
  drop: 0.055,
});

/**
 * True catenary rather than a parabola.
 *
 * A parabola is within a millimetre of a catenary at these spans and would be cheaper, but the
 * catenary is two lines of code and removes the question entirely. `a` is solved by bisection
 * from the requested mid-span sag, which is the number an artist can actually reason about.
 */
function catenaryPoint(t, span, sag) {
  if (!(sag > 0)) return 0;
  let lo = 1e-4;
  let hi = 1e4;
  const target = sag;
  for (let i = 0; i < 60; i += 1) {
    const a = (lo + hi) / 2;
    const s = a * (Math.cosh(span / (2 * a)) - 1);
    if (s > target) lo = a;
    else hi = a;
  }
  const a = (lo + hi) / 2;
  const x = (t - 0.5) * span;
  return a * (Math.cosh(x / a) - Math.cosh(span / (2 * a)));
}

/**
 * One span of wire between two points.
 *
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} to
 * @param {object} [options]
 * @param {number} [options.radius]   Conductor radius in metres.
 * @param {number} [options.sag]      Mid-span sag in metres. Derived from span when omitted.
 * @param {string} [options.gauge]    Key into LANE_WIRE_GAUGES / LANE_WIRE_SAG.
 * @param {number} [options.segments] Length segments; scaled from span when omitted.
 * @returns {THREE.BufferGeometry}
 */
export function buildWireSpan(from, to, {
  radius = null,
  sag = null,
  gauge = 'secondary',
  segments = null,
} = {}) {
  const start = from.clone();
  const end = to.clone();
  const span = start.distanceTo(end);
  const r = radius ?? LANE_WIRE_GAUGES[gauge] ?? LANE_WIRE_GAUGES.secondary;
  const drop = sag ?? span * (LANE_WIRE_SAG[gauge] ?? LANE_WIRE_SAG.secondary);
  // One segment per 0.5 m keeps the sag curve smooth at the close camera doc 21 §4 specifies,
  // and clamps so a 2 m service drop does not pay for 24 segments.
  const n = segments ?? THREE.MathUtils.clamp(Math.round(span * 2), 6, 48);

  const points = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const p = start.clone().lerp(end, t);
    p.y += catenaryPoint(t, span, drop);
    points.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(points);
  // 3 radial segments: at 8-22 mm the silhouette is all the eye resolves, and a prism's
  // silhouette against sky is a cylinder's. Closed ends are not worth their triangles — every
  // span terminates inside pole hardware.
  return new THREE.TubeGeometry(curve, n, r, 3, false);
}

/**
 * The wire network for a run of poles.
 *
 * `poles` is a list of placed pole positions with the heights of their attachment points, in
 * WORLD space — this module never guesses where a pole is. The scene owner places the generated
 * PROP-LANE-03 pole hardware, reads back the attachment heights, and hands them here.
 *
 * @param {Array<{position: THREE.Vector3, attachments?: number[], drops?: THREE.Vector3[]}>} poles
 * @param {object} [options]
 * @param {number[]} [options.lines]  Lateral offsets, in metres, of the conductors on a crossarm.
 * @returns {THREE.Group}
 */
export function buildLaneOverheadWires(poles, {
  lines = [-0.72, -0.24, 0.24, 0.72],
  commsHeight = 4.9,
  primaryHeight = 7.4,
  secondaryHeight = 6.6,
} = {}) {
  const group = new THREE.Group();
  group.name = 'Stillwater Lane · overhead wires';
  if (!Array.isArray(poles) || poles.length < 2) return group;

  const geometries = [];
  const axis = new THREE.Vector3();

  for (let i = 0; i < poles.length - 1; i += 1) {
    const a = poles[i];
    const b = poles[i + 1];
    // Conductors sit ACROSS the run direction, so the lateral offsets are taken on the
    // horizontal perpendicular. Deriving it per span rather than once is what lets the run
    // follow a bend without the wires crossing each other through the pole.
    axis.subVectors(b.position, a.position).setY(0).normalize();
    const lateral = new THREE.Vector3(-axis.z, 0, axis.x);

    for (const offset of lines) {
      const o = lateral.clone().multiplyScalar(offset);
      geometries.push(buildWireSpan(
        a.position.clone().add(o).setY(a.position.y + primaryHeight),
        b.position.clone().add(o).setY(b.position.y + primaryHeight),
        { gauge: 'primary' },
      ));
    }
    for (const offset of [-0.45, 0.45]) {
      const o = lateral.clone().multiplyScalar(offset);
      geometries.push(buildWireSpan(
        a.position.clone().add(o).setY(a.position.y + secondaryHeight),
        b.position.clone().add(o).setY(b.position.y + secondaryHeight),
        { gauge: 'secondary' },
      ));
    }
    // The lashed communications bundle, the fat low one. It is the span the camera passes
    // closest to and the one that reads hardest against the sky.
    geometries.push(buildWireSpan(
      a.position.clone().setY(a.position.y + commsHeight),
      b.position.clone().setY(b.position.y + commsHeight),
      { gauge: 'comms' },
    ));
  }

  // Service drops — the wires that leave the run and land on a building. These are what stop the
  // network reading as an abstract grid: every drop is evidence the street is connected to
  // something. The scene owner supplies the wall anchor points.
  for (const pole of poles) {
    for (const anchor of pole.drops ?? []) {
      geometries.push(buildWireSpan(
        pole.position.clone().setY(pole.position.y + secondaryHeight - 0.35),
        anchor.clone(),
        { gauge: 'drop' },
      ));
    }
  }

  if (!geometries.length) return group;
  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();

  // One material, one draw call for the whole network.
  //
  // No tiling §9 map is bound here, and that is a measured decision rather than a shortcut: a
  // conductor is 8-22 mm across, so MAT-CITY-02 at its authored 0.6 m tile puts roughly one
  // fiftieth of the tile across the whole wire. There is no texture detail to see, and binding
  // one would only add a sampler. The §9 SEMANTIC ROLES are carried in full, so the wires
  // resolve through the same role path as every other lane surface and pick up the same
  // shadow-fill treatment — which is the part that actually matters for how they read.
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.09, 0.09, 0.1),
    roughness: 0.82,
    metalness: 0,
  });
  material.userData.toonLabSemanticRoles = {
    baseMaterial: 'metal',
    finish: 'painted',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
    objectClass: 'infrastructure',
  };
  material.userData.toonLabMaterialId = 'MAT-CITY-02';

  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'overhead-wire-network';
  mesh.castShadow = true;
  // Wires do not receive meaningfully and shadow-receive on a 10 mm tube costs more than it
  // shows; they DO cast, because the thin shadow lines across asphalt are half the effect.
  mesh.receiveShadow = false;
  group.add(mesh);

  group.userData.triangles = merged.index
    ? merged.index.count / 3
    : merged.attributes.position.count / 3;
  group.userData.spans = geometries.length;
  return group;
}
