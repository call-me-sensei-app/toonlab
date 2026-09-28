const freezeList = (values) => Object.freeze([...values]);

/**
 * Public product intent shared by style bundles, MCP discovery, and coding
 * agents. ToonLab is intentionally narrower than a generic "stylized" kit.
 */
export const TOONLAB_ANIME_GAME_PROFILE = Object.freeze({
  antiGoals: freezeList([
    'unintended photorealism',
    'generic low-poly styling',
    'undirected cartoon rendering',
    'raw PBR materials without anime treatment',
  ]),
  family: 'anime-game',
  rendering: 'cel-shaded',
  subjects: freezeList(['character', 'environment']),
  traits: freezeList([
    'graphic value grouping',
    'readable gameplay silhouettes',
    'controlled texture detail',
    'cohesive shadow color',
    'material-aware highlights',
    'atmospheric depth',
    'coordinated post-processing',
  ]),
});

export const TOONLAB_ANIME_GAME_PROFILE_FAMILY = 'anime-game';
export const TOONLAB_ANIME_GAME_RENDERING = 'cel-shaded';

export const DEFAULT_UNSUPPORTED_STYLE_DOMAINS = freezeList([
  'vfx',
  'renderer',
]);

export function cloneAnimeGameProfile(profile = TOONLAB_ANIME_GAME_PROFILE) {
  return {
    antiGoals: [...profile.antiGoals],
    family: profile.family,
    rendering: profile.rendering,
    subjects: [...profile.subjects],
    traits: [...profile.traits],
  };
}
