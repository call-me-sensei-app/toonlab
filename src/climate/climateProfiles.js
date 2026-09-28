// Independent atmospheric profiles. The values are immutable so a director
// can safely blend cloned snapshots without mutating the authored registry.

const c = (r, g, b, a = 1) => [r, g, b, a];

const BASE_PROFILE = {
  air: {
    mix: 0,
    strength: 0.99,
    range: 30000,
    falloff: 1,
    tint: {
      noon: c(0.06300999969244003, 0.11697100102901459, 0.18782100081443787),
      dusk: c(0.06124600023031235, 0.0930590033531189, 0.14702700078487396),
      midnight: c(0.020289000123739243, 0.0481720007956028, 0.09989900141954422),
      dawn: c(0.07227200269699097, 0.08437599986791611, 0.09989900141954422),
    },
  },
  ceiling: {
    amount: 0,
    tint: c(0.485150009393692, 0.5711249709129333, 1),
    cloudOcclusion: 0,
    celestialOcclusion: 0,
    starsVisible: true,
  },
  depthFog: {
    amount: 0,
    tint: c(0.11953800171613693, 0.1980690062046051, 0.3564000129699707),
  },
  mist: {
    amount: 0,
    tint: c(0.41254299879074097, 0.5457249879837036, 1, 0.05999999865889549),
    gravity: 0,
  },
  volumeFog: {
    mix: 0,
    density: 0,
    tint: c(0.06300999969244003, 0.11697100102901459, 0.18782100081443787),
  },
  rain: {
    amount: 0,
    tint: c(0.7011020183563232, 0.9473069906234741, 1, 0.699999988079071),
  },
  flakes: {
    amount: 0,
    tint: c(1.350000023841858, 1.4249999523162842, 1.5, 0.6000000238418579),
    size: 1,
    turbulence: 1.2,
    gravity: 0,
  },
  embers: {
    amount: 0,
    tint: c(1, 0.38132598996162415, 0.16826899349689484),
    size: 1,
    turbulence: 1,
  },
  light: {
    sunLevel: 1,
    moonLevel: 1,
    ambientLevel: 1,
    ambientTint: c(0.3094690144062042, 0.7230550050735474, 0.9559739828109741),
    colorMix: 0,
    sunTint: c(1, 1, 1),
    moonTint: c(1, 1, 1),
  },
  electric: {
    farArc: 0,
    farFlash: 0,
    nearRate: 0,
    tintLow: c(0.03954600170254707, 0.1980690062046051, 1),
    tintHigh: c(0.03954600170254707, 0.07227200269699097, 1),
  },
  flow: {
    minimum: 1,
    maximum: 3,
    streakAmount: 1,
    streakOpacity: 0.3,
  },
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeTree(base, override) {
  const result = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(override ?? {})])) {
    const baseValue = base[key];
    const overrideValue = override?.[key];
    if (isRecord(baseValue) && isRecord(overrideValue)) {
      result[key] = mergeTree(baseValue, overrideValue);
    } else if (overrideValue !== undefined) {
      result[key] = Array.isArray(overrideValue) ? [...overrideValue] : overrideValue;
    } else {
      result[key] = Array.isArray(baseValue) ? [...baseValue] : baseValue;
    }
  }
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function defineProfile(id, label, override = {}) {
  return deepFreeze({
    id,
    label,
    ...mergeTree(BASE_PROFILE, override),
  });
}

const profileList = [
  defineProfile('openSky', 'Open Sky'),
  defineProfile('lowMist', 'Low Mist', {
    air: {
      mix: 0.98,
      strength: 1,
      range: 12000,
      falloff: 2,
      tint: {
        noon: c(0.47851601243019104, 0.6499320268630981, 0.875),
        dusk: c(0.524957001209259, 0.6470479965209961, 0.8541669845581055),
        midnight: c(0.23263899981975555, 0.39559999108314514, 0.6979169845581055),
        dawn: c(0.6824569702148438, 0.7779690027236938, 0.8020830154418945),
      },
    },
    ceiling: { amount: 0.1 },
    depthFog: {
      amount: 0.2,
      tint: c(0.815155029296875, 0.8643540143966675, 0.9635419845581055),
    },
    mist: {
      amount: 1,
      tint: c(0.6764119863510132, 0.8210639953613281, 1, 0.20000000298023224),
    },
    volumeFog: {
      mix: 0.4,
      density: 0.2,
      tint: c(0.7447919845581055, 0.6778140068054199, 0.3930079936981201),
    },
    light: { sunLevel: 0.9, ambientLevel: 0.7 },
  }),
  defineProfile('closedSky', 'Closed Sky', {
    ceiling: {
      amount: 0.85,
      tint: c(0.4245060086250305, 0.4997340142726898, 0.875),
      cloudOcclusion: 0.9,
      celestialOcclusion: 0.9,
      starsVisible: false,
    },
    depthFog: { amount: 0.1 },
    light: { sunLevel: 0.12, moonLevel: 0.2, ambientLevel: 0.4 },
  }),
  defineProfile('softDrizzle', 'Soft Drizzle', {
    air: { mix: 0.75, range: 20000, falloff: 0.8 },
    ceiling: {
      amount: 0.8,
      cloudOcclusion: 0.9,
      celestialOcclusion: 0.9,
      starsVisible: false,
    },
    depthFog: { amount: 0.1 },
    mist: {
      amount: 0.3,
      tint: c(0.41254299879074097, 0.5457249879837036, 1, 0.10196100175380707),
    },
    volumeFog: { mix: 0.9, density: 0.1 },
    rain: { amount: 0.2 },
    light: {
      sunLevel: 0.12,
      moonLevel: 0.2,
      ambientLevel: 0.6,
      ambientTint: c(0.4793199896812439, 0.7835379838943481, 0.9559739828109741),
    },
  }),
  defineProfile('steadyShower', 'Steady Shower', {
    air: { mix: 1, range: 18000, falloff: 0.8 },
    ceiling: {
      amount: 1,
      cloudOcclusion: 1,
      celestialOcclusion: 1,
      starsVisible: false,
    },
    depthFog: { amount: 0.2 },
    mist: {
      amount: 0.5,
      tint: c(0.41254299879074097, 0.5457249879837036, 1, 0.10196100175380707),
    },
    volumeFog: { mix: 1, density: 0.2 },
    rain: { amount: 0.66 },
    light: {
      sunLevel: 0.12,
      moonLevel: 0.2,
      ambientLevel: 0.3,
      ambientTint: c(0.4793199896812439, 0.7835379838943481, 0.9559739828109741),
    },
    flow: { minimum: 2, maximum: 5 },
  }),
  defineProfile('deepDownpour', 'Deep Downpour', {
    air: {
      mix: 0.8,
      strength: 1.5,
      range: 15000,
      falloff: 0.3,
      tint: {
        noon: c(0.09989900141954422, 0.18782100081443787, 0.30054399371147156),
        dusk: c(0.07421399652957916, 0.11443500220775604, 0.1811639964580536),
        dawn: c(0.08649999648332596, 0.10224200040102005, 0.11953800171613693),
      },
    },
    ceiling: {
      amount: 1,
      tint: c(0.2422810047864914, 0.2874409854412079, 0.5028870105743408),
      cloudOcclusion: 1,
      celestialOcclusion: 1,
      starsVisible: false,
    },
    depthFog: { amount: 0.25 },
    mist: {
      amount: 1,
      tint: c(0.41254299879074097, 0.5457249879837036, 1, 0.10196100175380707),
    },
    volumeFog: { mix: 1, density: 0.5 },
    rain: { amount: 1 },
    light: {
      sunLevel: 0.08,
      moonLevel: 0.2,
      ambientLevel: 0.2,
      ambientTint: c(0.4793199896812439, 0.7835379838943481, 0.9559739828109741),
    },
    flow: { minimum: 2, maximum: 5 },
  }),
  defineProfile('sparseFlurry', 'Sparse Flurry', {
    air: {
      mix: 0.7,
      strength: 1,
      tint: {
        noon: c(0.800000011920929, 1.100000023841858, 2),
        dusk: c(1.1200000047683716, 1.1200000047683716, 1.600000023841858),
        midnight: c(0.1599999964237213, 0.25999999046325684, 0.44999998807907104),
        dawn: c(0.9599999785423279, 1.2799999713897705, 1.600000023841858),
      },
    },
    ceiling: {
      amount: 0.2,
      tint: c(0.201555997133255, 0.44520100951194763, 1),
      cloudOcclusion: 1,
      celestialOcclusion: 0.2,
    },
    depthFog: {
      amount: 0.2,
      tint: c(0.30054399371147156, 0.4735319912433624, 1),
    },
    mist: {
      amount: 0.2,
      tint: c(0.4019779860973358, 0.6514059901237488, 1, 0.12156900018453598),
    },
    volumeFog: {
      mix: 0.8,
      density: 0.1,
      tint: c(0.6800000071525574, 0.9879999756813049, 2),
    },
    flakes: { amount: 0.3 },
    light: { sunLevel: 0.7, moonLevel: 0.8, ambientLevel: 0.8 },
  }),
  defineProfile('steadyFlurry', 'Steady Flurry', {
    air: {
      mix: 0.9,
      strength: 1,
      tint: {
        noon: c(0.800000011920929, 1.100000023841858, 2),
        dusk: c(1.1200000047683716, 1.1200000047683716, 1.600000023841858),
        midnight: c(0.1599999964237213, 0.25999999046325684, 0.44999998807907104),
        dawn: c(0.9599999785423279, 1.2799999713897705, 1.600000023841858),
      },
    },
    ceiling: {
      amount: 0.8,
      tint: c(0.201555997133255, 0.44520100951194763, 1),
      cloudOcclusion: 1,
      celestialOcclusion: 0.9,
      starsVisible: false,
    },
    depthFog: {
      amount: 0.3,
      tint: c(0.30054399371147156, 0.4735319912433624, 1),
    },
    mist: {
      amount: 0.6,
      tint: c(0.4019779860973358, 0.6514059901237488, 1, 0.12156900018453598),
    },
    volumeFog: {
      mix: 1,
      density: 0.1,
      tint: c(0.6800000071525574, 0.9879999756813049, 2),
    },
    flakes: { amount: 0.6 },
    light: { sunLevel: 0.4, moonLevel: 0.5, ambientLevel: 0.6 },
    flow: { minimum: 2, maximum: 4 },
  }),
  defineProfile('whiteout', 'Whiteout', {
    air: {
      mix: 0.98,
      strength: 1,
      range: 10000,
      falloff: 0.8,
      tint: {
        noon: c(0.800000011920929, 1.100000023841858, 2),
        dusk: c(1.1200000047683716, 1.1200000047683716, 1.600000023841858),
        midnight: c(0.1599999964237213, 0.25999999046325684, 0.44999998807907104),
        dawn: c(0.9599999785423279, 1.2799999713897705, 1.600000023841858),
      },
    },
    ceiling: {
      amount: 1,
      tint: c(0.201555997133255, 0.44520100951194763, 1),
      cloudOcclusion: 1,
      celestialOcclusion: 0.98,
      starsVisible: false,
    },
    depthFog: {
      amount: 0.3,
      tint: c(0.30054399371147156, 0.4735319912433624, 1),
    },
    mist: {
      amount: 1,
      tint: c(0.5028870105743408, 0.7083759903907776, 1, 0.2509799897670746),
    },
    volumeFog: {
      mix: 1,
      density: 0.1,
      tint: c(0.6800000071525574, 0.9879999756813049, 2),
    },
    flakes: { amount: 1, turbulence: 1.4 },
    light: { sunLevel: 0.2, moonLevel: 0.4, ambientLevel: 0.4 },
    flow: { minimum: 6, maximum: 9 },
  }),
  defineProfile('farThunder', 'Far Thunder', {
    air: { mix: 1, range: 22000 },
    ceiling: {
      amount: 1,
      cloudOcclusion: 1,
      celestialOcclusion: 1,
      starsVisible: false,
    },
    depthFog: { amount: 0.2 },
    mist: {
      amount: 0.5,
      tint: c(0.41254299879074097, 0.5457249879837036, 1, 0.10196100175380707),
    },
    volumeFog: { mix: 1, density: 0.2 },
    rain: { amount: 0.66 },
    light: {
      sunLevel: 0.12,
      moonLevel: 0.2,
      ambientLevel: 0.3,
      ambientTint: c(0.4793199896812439, 0.7835379838943481, 0.9559739828109741),
    },
    electric: { farArc: 0.5, farFlash: 0.3 },
    flow: { minimum: 3, maximum: 6, streakOpacity: 0.2 },
  }),
  defineProfile('closeThunder', 'Close Thunder', {
    air: { mix: 1, range: 18000, falloff: 0.8 },
    ceiling: {
      amount: 1,
      cloudOcclusion: 1,
      celestialOcclusion: 1,
      starsVisible: false,
    },
    depthFog: { amount: 0.2 },
    mist: {
      amount: 0.5,
      tint: c(0.41254299879074097, 0.5457249879837036, 1, 0.10196100175380707),
    },
    volumeFog: { mix: 1, density: 0.2 },
    rain: { amount: 0.66 },
    light: {
      sunLevel: 0.12,
      moonLevel: 0.2,
      ambientLevel: 0.2,
      ambientTint: c(0.4793199896812439, 0.7835379838943481, 0.9559739828109741),
    },
    electric: { farArc: 0.5, farFlash: 0.2, nearRate: 0.06 },
    flow: { minimum: 3, maximum: 8, streakOpacity: 0.1 },
  }),
  defineProfile('causticFront', 'Caustic Front', {
    air: {
      mix: 0.9,
      strength: 0.85,
      range: 25000,
      tint: {
        noon: c(0.4095950126647949, 0.5520830154418945, 0.1246189996600151),
        dusk: c(0.7239580154418945, 0.5683299899101257, 0.1403529942035675),
        midnight: c(0.1533699929714203, 0.28125, 0.1283160001039505),
        dawn: c(0.3287290036678314, 0.78125, 0.3867590129375458),
      },
    },
    ceiling: {
      amount: 1,
      tint: c(0.1518319994211197, 0.6822919845581055, 0.12758900225162506),
      cloudOcclusion: 1,
      starsVisible: false,
    },
    depthFog: {
      amount: 0.15,
      tint: c(0.5296689867973328, 0.6458330154418945, 0.27900001406669617),
    },
    mist: {
      amount: 1,
      tint: c(0.6041809916496277, 0.800000011920929, 0.3300339877605438, 0.10000000149011612),
    },
    volumeFog: {
      mix: 1,
      density: 0.3,
      tint: c(0.6457639932632446, 0.8854169845581055, 0.47458401322364807),
    },
    rain: {
      amount: 1,
      tint: c(1.1038939952850342, 3, 0.47570401430130005),
    },
    light: {
      sunLevel: 0.4,
      moonLevel: 0.5,
      ambientLevel: 0.4,
      ambientTint: c(0.7238479852676392, 0.9559739828109741, 0.6871060132980347),
      colorMix: 0.4,
      sunTint: c(0.36666199564933777, 1, 0.3565230071544647),
      moonTint: c(0.7242749929428101, 1, 0.20881299674510956),
    },
    flow: { minimum: 2, maximum: 5 },
  }),
  defineProfile('crimsonVeil', 'Crimson Veil', {
    air: {
      mix: 0.9,
      strength: 0.95,
      range: 15000,
      falloff: 0.8,
      tint: {
        noon: c(0.8958330154418945, 0.17289599776268005, 0.17289599776268005),
        dusk: c(0.34375, 0.08326300233602524, 0.05586300045251846),
        midnight: c(0.140625, 0.01977499946951866, 0.01977499946951866),
        dawn: c(0.9270830154418945, 0.11884599924087524, 0.09097500145435333),
      },
    },
    ceiling: {
      amount: 1,
      tint: c(0.640999972820282, 0.11409799754619598, 0.11409799754619598),
      cloudOcclusion: 1,
      starsVisible: false,
    },
    depthFog: {
      amount: 0.1,
      tint: c(0.41666701436042786, 0.004145000129938126, 0),
    },
    mist: {
      amount: 0.5,
      tint: c(1, 0.16857799887657166, 0.0625, 0.10196100175380707),
    },
    volumeFog: {
      mix: 0.9,
      density: 0.2,
      tint: c(0.5, 0.15514600276947021, 0.078125),
    },
    rain: {
      amount: 0.4,
      tint: c(4, 0.3199999928474426, 0.3199999928474426, 0.8999999761581421),
    },
    light: {
      sunLevel: 0.8,
      moonLevel: 0.4,
      ambientLevel: 0.4,
      ambientTint: c(0.9559739828109741, 0.3447270095348358, 0.28679201006889343),
      colorMix: 0.9,
      sunTint: c(1, 0.05796699970960617, 0.041999999433755875),
      moonTint: c(10, 0.30000001192092896, 0.30000001192092896),
    },
    electric: {
      farArc: 0.5,
      farFlash: 0.3,
      tintLow: c(0.4000000059604645, 0.015819000080227852, 0.015819000080227852),
      tintHigh: c(0.6000000238418579, 0.05063999816775322, 0.01140000019222498),
    },
  }),
  defineProfile('ionSquall', 'Ion Squall', {
    air: {
      mix: 0.9,
      strength: 0.7,
      falloff: 0.8,
      tint: {
        noon: c(0.13419100642204285, 0.13419100642204285, 0.4000000059604645),
        dusk: c(0.3944540023803711, 0.18092499673366547, 0.7409999966621399),
        midnight: c(0.016675999388098717, 0.07870800048112869, 0.125),
        dawn: c(0.30163100361824036, 0.22656400501728058, 0.8700000047683716),
      },
    },
    ceiling: {
      amount: 0.86,
      tint: c(0.9330599904060364, 0.3749130070209503, 1),
      cloudOcclusion: 1,
      celestialOcclusion: 0.2,
      starsVisible: false,
    },
    depthFog: {
      amount: 0.1,
      tint: c(0.20090700685977936, 0.3328930139541626, 0.5989999771118164, 0.843999981880188),
    },
    mist: {
      amount: 0.3,
      tint: c(0.17299999296665192, 0.36048799753189087, 1, 0.20000000298023224),
      gravity: -0.5,
    },
    volumeFog: {
      mix: 0.9,
      density: 0.5,
      tint: c(0.198730006814003, 0.14277100563049316, 0.40104201436042786),
    },
    embers: {
      amount: 0.1,
      tint: c(1.4326460361480713, 0.5, 2),
      turbulence: 2,
    },
    light: {
      sunLevel: 0.7,
      moonLevel: 0.6,
      ambientLevel: 0.7,
      ambientTint: c(0.5106359720230103, 0.5180580019950867, 0.9559739828109741),
      colorMix: 0.5,
      sunTint: c(0.7621260285377502, 0.17000000178813934, 1),
      moonTint: c(0.4053080081939697, 0.25551798939704895, 1),
    },
    electric: {
      farArc: 1,
      farFlash: 1,
      nearRate: 0.08,
      tintLow: c(0.024000000208616257, 0.3493329882621765, 1),
      tintHigh: c(1, 0.10700000077486038, 0.9553499817848206),
    },
  }),
  defineProfile('ashFall', 'Ash Fall', {
    air: {
      mix: 0.9,
      strength: 3,
      falloff: 2,
      tint: {
        noon: c(0.30729201436042786, 0.1574610024690628, 0.0880260020494461),
        dusk: c(0.2409999966621399, 0.10266400128602982, 0.09278500080108643),
        midnight: c(0.08715800195932388, 0.09660500288009644, 0.140625),
      },
    },
    ceiling: {
      amount: 0.8,
      tint: c(0.20833300054073334, 0.1804330050945282, 0.17333300411701202),
      cloudOcclusion: 0.8,
    },
    depthFog: {
      amount: 0.3,
      tint: c(0.23499999940395355, 0.0812470018863678, 0.07026500254869461),
    },
    mist: {
      amount: 1,
      tint: c(0.125, 0.10823000222444534, 0.10192699730396271, 0.6000000238418579),
      gravity: -1,
    },
    volumeFog: {
      mix: 0.9,
      density: 0.4,
      tint: c(0.0729999989271164, 0.03501100093126297, 0.031557001173496246),
    },
    flakes: {
      amount: 0.5,
      tint: c(0, 0, 0),
      turbulence: 3,
      gravity: -2,
    },
    embers: { amount: 1 },
    light: {
      sunLevel: 0.5,
      moonLevel: 0.3,
      ambientLevel: 0.3,
      ambientTint: c(0.836063027381897, 0.9464539885520935, 0.9559739828109741),
      colorMix: 0.8,
      sunTint: c(1, 0.2199999988079071, 0.10000000149011612),
      moonTint: c(1, 0.1855670064687729, 0.07800000160932541),
    },
    flow: { maximum: 4, streakOpacity: 0.1 },
  }),
];

export const CLIMATE_PROFILES = deepFreeze(
  Object.fromEntries(profileList.map((profile) => [profile.id, profile])),
);

// The transferred fifteen-profile collection is the first-party Call Me
// Sensei atmospheric-condition set. A set is an authored world-state library,
// not a shader style and not a source-asset pack. Keeping that identity
// explicit prevents future condition collections from silently extending or
// mutating the studio reference set.
export const DEFAULT_ATMOSPHERIC_CONDITION_SET = 'call_me_sensei';

export const ATMOSPHERIC_CONDITION_SETS = deepFreeze({
  call_me_sensei: {
    id: 'call_me_sensei',
    label: 'Call Me Sensei',
    description: 'The first-party atmospheric-condition set for the Call Me Sensei look.',
    conditions: profileList.map(({ id }) => id),
  },
});

export function getAtmosphericConditionSetOptions() {
  return Object.values(ATMOSPHERIC_CONDITION_SETS).map((set) => ({
    description: set.description,
    id: set.id,
    label: set.label,
  }));
}

export function resolveAtmosphericConditionSet(
  set = DEFAULT_ATMOSPHERIC_CONDITION_SET,
) {
  const id = typeof set === 'string' ? set : set?.id;
  const resolved = ATMOSPHERIC_CONDITION_SETS[id];
  if (!resolved) {
    throw new RangeError(`Unknown atmospheric-condition set "${id}".`);
  }
  return resolved;
}

export function getClimateProfileOptions() {
  return profileList.map(({ id, label }) => ({ id, label }));
}

export function getAtmosphericConditionOptions({
  set = DEFAULT_ATMOSPHERIC_CONDITION_SET,
} = {}) {
  const conditionSet = resolveAtmosphericConditionSet(set);
  return conditionSet.conditions.map((id) => {
    const profile = CLIMATE_PROFILES[id];
    return {
      id,
      label: profile.label,
      setId: conditionSet.id,
    };
  });
}

export function resolveClimateProfile(profile = 'openSky') {
  if (typeof profile === 'string') {
    const resolved = CLIMATE_PROFILES[profile];
    if (!resolved) throw new RangeError(`Unknown climate profile "${profile}".`);
    return resolved;
  }
  if (!profile || typeof profile !== 'object') {
    throw new TypeError('A climate profile id or object is required.');
  }
  return deepFreeze({
    id: profile.id ?? 'custom',
    label: profile.label ?? 'Custom',
    ...mergeTree(BASE_PROFILE, profile),
  });
}

export function cloneClimateProfile(profile = 'openSky') {
  return structuredClone(resolveClimateProfile(profile));
}

export function resolveAtmosphericCondition(
  condition = 'openSky',
  { set = DEFAULT_ATMOSPHERIC_CONDITION_SET } = {},
) {
  const conditionSet = resolveAtmosphericConditionSet(set);
  const requestedId = typeof condition === 'string' ? condition : condition?.id;
  if (
    requestedId
    && requestedId !== 'custom'
    && !conditionSet.conditions.includes(requestedId)
  ) {
    throw new RangeError(
      `Atmospheric condition "${requestedId}" does not belong to set "${conditionSet.id}".`,
    );
  }
  return resolveClimateProfile(condition);
}

export function cloneAtmosphericCondition(
  condition = 'openSky',
  options = {},
) {
  return structuredClone(resolveAtmosphericCondition(condition, options));
}
