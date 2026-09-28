export const MANUFACTURED_LOCAL_TEST_ASSETS = Object.freeze([
  {
    description: 'Separated body, wheels, handles, trim, and lid assignments.',
    id: 'dumpster',
    kind: 'local',
    label: 'Dumpster',
    source: 'Local-only test cases',
  },
  {
    description: 'Large distressed vehicle with reprojected mixed atlases.',
    id: 'streetcar',
    kind: 'local',
    label: 'Streetcar',
    source: 'Local-only test cases',
  },
  {
    description: 'Distressed vehicle set retained from the local benchmark grid.',
    id: 'burned-out-cars',
    kind: 'local',
    label: 'Burned-out cars',
    source: 'Local-only test cases',
  },
  {
    description: 'Mixed-atlas beach prop collection.',
    id: 'beach',
    kind: 'local',
    label: 'Beach props',
    source: 'Local-only test cases',
  },
  {
    description: 'Infrastructure asset with metal, glass, mineral, signs, and emitters.',
    id: 'bus-station',
    kind: 'local',
    label: 'Bus station',
    source: 'Local-only test cases',
  },
  {
    description: 'Large exterior fixture with mineral, trim, roof, and marble finishes.',
    id: 'apartment',
    kind: 'local',
    label: 'Apartment building',
    source: 'Local-only test cases',
  },
  {
    description: 'Mixed masonry, wood, metal, and cavity atlas compatibility case.',
    id: 'ground-floor-kit',
    kind: 'local',
    label: 'Ground-floor kit',
    source: 'Local-only test cases',
  },
  {
    description: 'Interior fixture with glass, mirror, textile, metal, mineral, and wood.',
    id: 'living-room',
    kind: 'local',
    label: 'Living room',
    source: 'Local-only test cases',
  },
  {
    description: 'Vehicle and planter materials plus explicit vegetation routes.',
    id: 'bicycle-collection',
    kind: 'local',
    label: 'Bicycle collection',
    source: 'Local-only test cases',
  },
]);

export const MANUFACTURED_PUBLIC_SAMPLES = Object.freeze([
  {
    description: 'CC0 1K glTF by James Ray Cock / Poly Haven. One atlas spans wood and metal, so the lab reports a mixed-atlas audit.',
    id: 'wooden-crate-01',
    kind: 'sample',
    label: 'Wooden Crate 01',
    source: 'Redistributable samples',
  },
]);

export const MANUFACTURED_PREVIEW_ASSETS = Object.freeze([
  ...MANUFACTURED_PUBLIC_SAMPLES,
  ...MANUFACTURED_LOCAL_TEST_ASSETS,
]);

