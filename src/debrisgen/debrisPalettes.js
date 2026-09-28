// Curated three-tone palettes (primary base / secondary mid / accent
// highlight-or-detail) per debris family — one-click combinations that
// read well under the toon shader, mirroring Tree Lab's leaf palettes.
// Values are linear 0-1 RGB triplets matching surface.*Color.

const palette = (id, label, primaryColor, secondaryColor, accentColor) => Object.freeze({
  accentColor: Object.freeze(accentColor),
  id,
  label,
  primaryColor: Object.freeze(primaryColor),
  secondaryColor: Object.freeze(secondaryColor),
});

export const DEBRIS_PALETTES = Object.freeze({
  ash: Object.freeze([
    palette('cold-ash', 'Cold ash', [0.035, 0.03, 0.025], [0.16, 0.15, 0.14], [0.55, 0.06, 0.01]),
    palette('warm-embers', 'Warm embers', [0.05, 0.03, 0.02], [0.2, 0.16, 0.13], [0.85, 0.28, 0.04]),
    palette('white-ash', 'White ash', [0.22, 0.21, 0.2], [0.42, 0.41, 0.39], [0.65, 0.6, 0.52]),
    palette('sawdust', 'Fresh sawdust', [0.58, 0.47, 0.32], [0.78, 0.66, 0.47], [0.55, 0.4, 0.24]),
    palette('volcanic', 'Volcanic', [0.06, 0.05, 0.06], [0.18, 0.16, 0.18], [0.9, 0.35, 0.12]),
  ]),
  bone: Object.freeze([
    palette('bleached', 'Bleached ivory', [0.78, 0.71, 0.56], [0.93, 0.87, 0.7], [0.42, 0.31, 0.19]),
    palette('aged-tan', 'Aged tan', [0.62, 0.52, 0.38], [0.8, 0.7, 0.52], [0.34, 0.24, 0.15]),
    palette('fossil', 'Fossil brown', [0.42, 0.33, 0.24], [0.6, 0.5, 0.38], [0.24, 0.18, 0.12]),
    palette('museum', 'Museum white', [0.85, 0.83, 0.78], [0.96, 0.95, 0.9], [0.55, 0.5, 0.42]),
    palette('swamp-bone', 'Swamp stained', [0.45, 0.44, 0.3], [0.66, 0.63, 0.44], [0.25, 0.26, 0.14]),
  ]),
  metal: Object.freeze([
    palette('steel-rust', 'Steel & rust', [0.25, 0.31, 0.32], [0.49, 0.54, 0.52], [0.72, 0.26, 0.08]),
    palette('galvanized', 'Galvanized', [0.36, 0.42, 0.45], [0.62, 0.68, 0.7], [0.3, 0.34, 0.38]),
    palette('painted-red', 'Painted red', [0.5, 0.12, 0.08], [0.72, 0.24, 0.16], [0.32, 0.36, 0.38]),
    palette('copper', 'Copper verdigris', [0.45, 0.26, 0.15], [0.68, 0.42, 0.25], [0.2, 0.55, 0.45]),
    palette('gunmetal', 'Gunmetal', [0.12, 0.13, 0.16], [0.3, 0.32, 0.36], [0.55, 0.45, 0.2]),
  ]),
  organic: Object.freeze([
    palette('autumn', 'Autumn litter', [0.34, 0.18, 0.05], [0.64, 0.43, 0.12], [0.66, 0.23, 0.06]),
    palette('fresh-fall', 'Fresh fall', [0.25, 0.3, 0.08], [0.55, 0.52, 0.14], [0.72, 0.4, 0.08]),
    palette('dried', 'Sun dried', [0.42, 0.32, 0.18], [0.66, 0.55, 0.34], [0.5, 0.3, 0.12]),
    palette('shoreline', 'Shoreline', [0.68, 0.58, 0.48], [0.92, 0.81, 0.67], [0.79, 0.46, 0.39]),
    palette('deep-forest', 'Deep forest', [0.12, 0.16, 0.07], [0.3, 0.34, 0.14], [0.5, 0.36, 0.1]),
  ]),
  stone: Object.freeze([
    palette('concrete', 'Concrete', [0.39, 0.4, 0.38], [0.58, 0.56, 0.51], [0.53, 0.3, 0.19]),
    palette('red-brick', 'Red brick', [0.45, 0.18, 0.11], [0.68, 0.31, 0.18], [0.32, 0.19, 0.14]),
    palette('slate', 'Slate blue', [0.12, 0.16, 0.18], [0.3, 0.36, 0.38], [0.2, 0.25, 0.26]),
    palette('sandstone', 'Sandstone', [0.55, 0.42, 0.27], [0.76, 0.62, 0.42], [0.42, 0.28, 0.16]),
    palette('basalt', 'Basalt', [0.08, 0.08, 0.09], [0.22, 0.22, 0.24], [0.4, 0.38, 0.35]),
    palette('mossy', 'Mossy stone', [0.3, 0.33, 0.28], [0.5, 0.52, 0.44], [0.28, 0.42, 0.2]),
  ]),
  wood: Object.freeze([
    palette('bark-brown', 'Bark brown', [0.34, 0.2, 0.11], [0.55, 0.36, 0.2], [0.7, 0.46, 0.24]),
    palette('bleached-drift', 'Bleached driftwood', [0.52, 0.43, 0.31], [0.78, 0.68, 0.5], [0.52, 0.39, 0.25]),
    palette('silver-grey', 'Silvered grey', [0.38, 0.37, 0.34], [0.6, 0.58, 0.53], [0.45, 0.4, 0.33]),
    palette('redwood', 'Redwood', [0.32, 0.12, 0.07], [0.55, 0.25, 0.13], [0.72, 0.4, 0.2]),
    palette('charred', 'Charred', [0.06, 0.05, 0.045], [0.2, 0.17, 0.15], [0.5, 0.2, 0.06]),
    palette('mossy-log', 'Mossy log', [0.22, 0.17, 0.1], [0.4, 0.34, 0.2], [0.3, 0.45, 0.18]),
  ]),
});

function nearly(a, b) {
  return Math.abs(a - b) < 0.012;
}

/** Finds the palette matching the current surface colors, if any. */
export function matchDebrisPalette(type, surface) {
  const palettes = DEBRIS_PALETTES[type] ?? [];
  return palettes.find((entry) => ['primaryColor', 'secondaryColor', 'accentColor'].every(
    (key) => entry[key].every((channel, index) => nearly(channel, surface[key][index])),
  )) ?? null;
}
