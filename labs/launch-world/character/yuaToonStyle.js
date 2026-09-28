// The launch world's hero toon style — a SCENE-SIDE OVERRIDE over the shipped
// `call_me_sensei` toon preset.
//
// Nothing here edits the preset. `src/toon/toonSettings.js` is the product's
// authored house look and stays exactly as shipped; this module is the launch
// video's own layer on top of it, in the same shape the vegetation owner uses
// for `GARDEN_VEGETATION_SHADER` (`labs/shared/stillwaterGardenTrees.js`):
// carry the override where the scene lives, and raise any preset question
// separately instead of editing the preset.
//
// ---------------------------------------------------------------------------
// MERGE SEMANTICS
//
// `createToonSettings` resolves library defaults → preset → these overrides
// FIELD BY FIELD (nested objects merge, colours and other arrays replace). So
// every value below is a delta: a field left out keeps the preset's value, and
// naming one field of a per-surface block (`ramp.tone.cloth`) leaves the other
// surfaces alone.
// ---------------------------------------------------------------------------
//
// Judged against the launch reference close-up at matched head size in S02
// (`/labs/launch-world/wipe/?shot=S02`). Colours (shadow tones, inks) are
// display-space multipliers, like every tone and ink in the settings schema.

/** The preset and reference frame the overrides are judged against. */
export const YUA_LAUNCH_TOON_STYLE_BASIS = Object.freeze({
  preset: 'call_me_sensei',
  reference: 'launch-plan/ananta-refererence/04-street-character-closeup.png',
  shot: 'S02',
});

export const YUA_LAUNCH_TOON_STYLE = Object.freeze({
  preset: 'call_me_sensei',
  settings: Object.freeze({
    // Cutouts are authored where the evidence is. `costume_outerwear`'s
    // alpha is a wrinkle/AO channel pack (Blender's glTF "RGB from image A,
    // alpha from image B" pairing: ~39 % of its texels sit in the
    // intermediate band, where a real cutout mask holds ~0.5 %), and several
    // of Yua's materials carry no alpha channel at all. The measured alpha
    // coverage gate (`alpha.coverageMode: 'auto'`) already refuses to cut
    // those; switching the role and token inferences off as well leaves
    // `preserveSourceAlphaTest` as the only route to a cutout. That reads
    // `material.alphaTest` off the SOURCE material, which `bindSourceMaterials`
    // in `yuaCharacter.js` sets to 0.35 on the shoes — the one material with a
    // genuine binary mask — and to 0 everywhere else.
    alpha: Object.freeze({
      costumeCutout: false,
      cutoutCutoff: 0.35,
      expressionTokenCutout: false,
      faceCutout: false,
      hairCutout: false,
      mapTransparentCutout: false,
      // Left ON deliberately: it is the channel the scene authors the shoes'
      // real mask through.
      preserveSourceAlphaTest: true,
      skinCutout: false,
      sourceAlphaMapCutout: false,
      sourceTransparentCutout: false,
    }),

    // The hair ring ends where the light does: almost none of it survives on
    // the shadow side, so it never softens the two-tone across the hair mass.
    highlights: Object.freeze({
      hair: Object.freeze({ shadowFloor: 0.05 }),
    }),

    // Outline widths are screen-space: with `outline.screenSpace: 1` a width
    // is metres at the reference framing (4 m, 40° vertical), a constant
    // fraction of frame height at any distance. At 1080p a width w draws about
    // w × 371 px, so these land the garment contour at ~3.3 px and the hair
    // at ~3.9 px — thick enough to read as a line at the hero framing (50 mm,
    // subject at 4 m), where the preset's widths draw 1–2 px.
    //
    // The inks sit a step deeper than the house inks on every surface, and
    // each line's brightness is capped below the darkest value of the
    // material it edges, so a contour never reads as a halo around pale skin
    // or white cloth.
    outline: Object.freeze({
      ink: Object.freeze({
        cloth: [0.19, 0.18, 0.25],
        face: [0.53, 0.28, 0.28],
        hair: [0.65, 0.62, 0.64],
        skin: [0.53, 0.29, 0.28],
      }),
      lighting: Object.freeze({
        cloth: Object.freeze({ max: 0.43 }),
        face: Object.freeze({ max: 0.61 }),
        hair: Object.freeze({ max: 0.48 }),
        metal: Object.freeze({ max: 0.46 }),
        skin: Object.freeze({ max: 0.58 }),
      }),
      width: Object.freeze({
        cloth: 0.009,
        face: 0.0038,
        hair: 0.0105,
        metal: 0.008,
        skin: 0.0052,
      }),
    }),

    // Deeper shadow tones than the house look, so the terminator splits the
    // frame into two decisive values. Cloth shades to a cool grey, so the
    // white jacket reads as white cloth in shade; hair and metal go a step
    // deeper than the house tones, skin a touch deeper and redder, and the
    // face a touch warmer. The terminator band keeps the preset's colours.
    ramp: Object.freeze({
      tone: Object.freeze({
        cloth: [0.69, 0.72, 0.78],
        face: [0.91, 0.7, 0.64],
        hair: [0.63, 0.65, 0.78],
        metal: [0.59, 0.59, 0.68],
        skin: [0.9, 0.76, 0.71],
      }),
    }),

    // The hair terminator runs through the hair mass rather than around it:
    // under the launch key the whole head of hair faces the light with N·L
    // above the preset's terminator, so the split never crosses it and the
    // only tonal variation comes from the texture's painted strands. At 0.5
    // the ponytail and the underside of the fringe become one dark shape
    // against a lit crown. Cloth and skin keep the preset's terminator, so the
    // white jacket keeps its lit side; faces keep their own face-map shading
    // (`face.*`), so the eyes are not dragged into shadow. Every edge is
    // tighter than the preset's.
    shading: Object.freeze({
      softness: 0.022,
      terminator: Object.freeze({ hair: 0.5 }),
    }),

    // A visible fringe shadow on the forehead and occlusion under the collar
    // and cuffs: the character's own shadow map reaches the face harder than
    // the house default, and the screen-space shadow (sleeve on the arm, hair
    // on the neck) is raised on the body. Both need the character render
    // passes; see the README.
    shadows: Object.freeze({
      character: Object.freeze({
        strength: Object.freeze({ face: 0.72 }),
      }),
      hairOnFace: Object.freeze({
        strength: Object.freeze({ body: 0.78 }),
      }),
    }),
  }),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Field-wise merge in the same way `createToonSettings` merges (nested objects
// merge, arrays replace).
function mergeSettings(base, overrides) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) continue;
    merged[key] = isPlainObject(value) && isPlainObject(merged[key]) ? mergeSettings(merged[key], value) : value;
  }
  return merged;
}

/**
 * The override in the shape `applyToonShader` / `createToonSettings` take
 * (`{ preset, ...groups }`).
 *
 * @param {object} [overrides] Extra settings, merged field by field on top.
 * @returns {object}
 */
export function resolveYuaToonOptions(overrides = null) {
  return mergeSettings(
    { preset: YUA_LAUNCH_TOON_STYLE.preset, ...YUA_LAUNCH_TOON_STYLE.settings },
    overrides,
  );
}
