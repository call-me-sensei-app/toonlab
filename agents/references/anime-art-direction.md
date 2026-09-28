# ToonLab Anime-Game Art Direction

ToonLab is for anime-style games, characters, and environments. Do not treat
"stylized" as permission to drift toward generic low-poly, western cartoon,
pixel-art, or untreated photoreal rendering.

The selected style bundle is the visual authority. Its `artDirection` must
declare `family: "anime-game"`, `rendering: "cel-shaded"`, and both character
and environment subjects.

Evaluate every scene at gameplay camera distance:

- Group values into intentional light and shadow shapes.
- Preserve readable silhouettes and important material boundaries.
- Reduce high-frequency texture detail deliberately; do not merely blur it.
- Coordinate shadow color, atmosphere, sky, water, and post-processing.
- Use material-aware graphic highlights for skin, hair, cloth, metal, leaves,
  rock, ground, and water rather than one universal specular response.
- Keep imported PBR maps as useful source information, then route the asset
  through its owning ToonLab shader.

If an asset or renderer cannot meet this direction with a supported shader,
record a custom integration note instead of silently accepting a visually inconsistent
fallback.
