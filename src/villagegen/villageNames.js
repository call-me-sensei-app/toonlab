// Tiny seeded syllable name generator. Pure flavor — and the thing everyone
// screenshots, which is why it ships in v1. Names lean soft-Japanese
// romaji to match the shrine/torii dressing, with a per-archetype suffix.

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPENERS = ['ka', 'ki', 'ku', 'ha', 'hi', 'ho', 'na', 'no', 'mi', 'mo', 'sa', 'shi', 'so', 'ta', 'to', 'ya', 'yu', 'o', 'a', 'i'];
const MIDDLES = ['ra', 'ri', 'ru', 'wa', 'ne', 'ki', 'sa', 'shi', 'chi', 'ba', 'ga', 'zu', 'mi', 'no', 'ta', 'ma', 'ke', 'ko'];
const SUFFIXES = Object.freeze({
  campsite: [' Camp', ' Rest', ' Hollow'],
  pierHamlet: ['hama', 'ura', 'minato'],
  ruin: [' Ruins', ' Stones', ' Remnant'],
  shrine: [' Shrine', '-jinja', ' Hokora'],
  village: ['mura', 'no', 'sato', 'machi'],
});

/** Deterministic per seed; `archetype` picks the suffix family. */
export function generatePlaceName(seed, archetype = 'village') {
  const random = mulberry32(seed * 1597334677 + 89);
  const syllables = 2 + (random() < 0.4 ? 1 : 0);
  let stem = OPENERS[Math.floor(random() * OPENERS.length)];
  for (let index = 1; index < syllables; index += 1) {
    stem += MIDDLES[Math.floor(random() * MIDDLES.length)];
  }
  const suffixes = SUFFIXES[archetype] ?? SUFFIXES.village;
  const suffix = suffixes[Math.floor(random() * suffixes.length)];
  const name = suffix.startsWith(' ') || suffix.startsWith('-')
    ? stem[0].toUpperCase() + stem.slice(1) + suffix
    : stem[0].toUpperCase() + stem.slice(1) + suffix;
  return name;
}
