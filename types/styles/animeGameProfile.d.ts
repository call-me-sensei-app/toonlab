export function cloneAnimeGameProfile(profile?: Readonly<{
    antiGoals: readonly any[];
    family: "anime-game";
    rendering: "cel-shaded";
    subjects: readonly any[];
    traits: readonly any[];
}>): {
    antiGoals: any[];
    family: "anime-game";
    rendering: "cel-shaded";
    subjects: any[];
    traits: any[];
};
/**
 * Public product intent shared by style bundles, MCP discovery, and coding
 * agents. ToonLab is intentionally narrower than a generic "stylized" kit.
 */
export const TOONLAB_ANIME_GAME_PROFILE: Readonly<{
    antiGoals: readonly any[];
    family: "anime-game";
    rendering: "cel-shaded";
    subjects: readonly any[];
    traits: readonly any[];
}>;
export const TOONLAB_ANIME_GAME_PROFILE_FAMILY: "anime-game";
export const TOONLAB_ANIME_GAME_RENDERING: "cel-shaded";
export const DEFAULT_UNSUPPORTED_STYLE_DOMAINS: readonly any[];
