// Landscape Lab guide content — structured so the in-lab full-screen guide
// and (later) the hosted /docs section render the same source of truth.
// Sections are ordered as a learning path: modes → tools → water → assets →
// preview → projects → recipes.

export const LANDSCAPE_GUIDE_SECTIONS = Object.freeze([
  {
    id: 'overview',
    title: 'Overview',
    blocks: [
      { p: 'Landscape Lab is a ToonLab-style terrain editor: a tiled heightfield you sculpt with brushes, paint with surface materials, and dress with foliage — your own generated assets included. Everything is undoable (⌘Z), autosaves to this browser, and exports as a single project file.' },
      { p: 'The left rail picks what you are doing: Camera (navigate safely, nothing edits), then the three edit modes — Sculpt, Paint, and Foliage (keys 1/2/3). Each mode shows its tools in the floating strip beside the rail; clicking the active tool puts it down again.' },
      { list: ['[ and ] resize the brush', 'Shift inverts most tools (lower / erase / restore)', 'Right-drag orbits while a tool is armed', 'Esc cancels the Ramp gesture'] },
    ],
  },
  {
    id: 'camera',
    title: 'Camera & Navigation',
    blocks: [
      { p: 'The camera bar above the viewport decides what an unarmed left-drag does: Rotate, Pan, or Zoom. The wheel always zooms; right-drag pans (or rotates while a brush is armed). Reset, Top, and Low are one-click framings.' },
      { p: 'The lab opens with the Camera entry armed so a stray first click never edits the terrain.' },
    ],
  },
  {
    id: 'sculpt',
    title: 'Sculpt Tools',
    blocks: [
      { list: [
        'Sculpt — raise terrain under the brush; hold Shift to dig. Dig below the Water Level and the basin fills: that is how you make lakes and rivers.',
        'Smooth — relaxes bumps toward the local average; great after Noise or rough digging.',
        'Flatten — pulls terrain toward the height sampled where the stroke started; build plateaus and building pads.',
        'Ramp — two clicks: start point, end point. Cuts a walkable slope of Ramp Width between them.',
        'Noise — world-anchored fractal detail; re-strokes are stable, so it never “boils”.',
        'Terrace — quantizes slopes into stepped bands of Terrace Step meters (rice-field look).',
        'Hole — punches THROUGH the surface (see Caves below).',
        'Dry — paints zones where the stage water is suppressed (see Water below).',
      ] },
      { p: 'The Brush Size / Tool Strength / Brush Falloff triplet applies to every brush; Brush Shape switches between a round and a square footprint. Falloff 0 is a soft feathered brush; 1 is hard-edged.' },
      { p: 'All brushes work in MAP VIEW: a stroke affects the vertical column under the footprint, wherever you aim from. The cursor outline drapes over the terrain to show exactly that — on a cliff face it stretches down the wall, marking the column a stroke will carve (there is no sideways sculpting on a heightfield; see Holes & Caves for how tunnels work).' },
      { img: '/landscape-guide/sculpt.png', caption: 'Sculpt mode: the tool strip floats beside the rail; brush settings live in the inspector.' },
    ],
  },
  {
    id: 'holes',
    title: 'Holes, Caves & Tunnels',
    blocks: [
      { p: 'A heightfield stores ONE height per spot, so it cannot fold into overhangs by itself. The Hole tool removes the surface per-quad instead: openings you can walk through, with dark shaft walls so they read as real pits. Shift restores punched terrain.' },
      { p: '“Hole fills” picks what a new opening contains: Dry cave also suppresses the stage water inside the opening (one undo removes both); Water-filled leaves the water plane showing through — instant wells and lake pits.' },
      { p: 'The TUNNEL tool bores horizontally with a real swept tube: click the ENTRANCE, click the END point, and the planner opens. Doodle the CROSS-SECTION (or pick Arch / Round / Box and set width + height), doodle the ROUTE on the map to curve the bore (straight by default), and set Bore % — 100% drills through to the far side, less stops short as a dead-end cave with a closed back wall. Esc cancels between clicks.' },
      { p: 'The terrain is punched only at the portals where the tube crosses the surface — the hill above the passage stays real, sculptable terrain. The bore floor renders with the terrain material and is fully walkable; the passage stays dry even below the waterline.' },
      { img: '/landscape-guide/tunnel-planner.png', caption: 'The tunnel planner: doodle the cross-section (or pick a preset), doodle the route between your two clicked points, and choose how far to bore.' },
      { img: '/landscape-guide/tunnel.png', caption: 'The result: portals punched only where the tube crosses the surface — the hill above stays real, sculptable terrain.' },
      { p: 'Cave interiors are built from placed meshes: sculpt a dome hill, punch a dry entrance (or Tunnel straight through), then use the Foliage Single tool to line the inside with rocks — floor, walls, stalactites on the ceiling. For hand-carved shapes the Rock Lab route still works: carve an arch or tube rock there (its carve tool drills real through-holes), save it, and place it here from “Saved in Labs”.' },
      { p: 'While walking, hole openings ground you on the placed meshes below; walk off an unfloored opening and you fall and respawn.' },
      { img: '/landscape-guide/cave.png', caption: 'A dome hill with a punched dry entrance: rock floor placed inside, stalactites hung from the terrain ceiling.' },
    ],
  },
  {
    id: 'water',
    title: 'Water, Dry Zones & Groundwater',
    blocks: [
      { p: 'The stage water is a world-level plane (Preview bar: Water toggle + Level). Any terrain below it is flooded — dig a basin and it becomes a lake.' },
      { p: 'The Dry tool paints zones where that plane is suppressed: caves that dig below the waterline stay dry. Shift re-wets. Groundwater Depth (Environment settings) is the exception — dig deeper than that below the water level even inside a dry zone and water reappears: underground pools and rivers.' },
      { p: 'Foliage interacts with water per palette entry (the Water rule): Avoid water · Ignore water · Riverbed only (plants only on submerged ground — kelp, reeds) · Float on surface (placed on the water plane — lily pads).' },
      { img: '/landscape-guide/lake.png', caption: 'Dig below the Water Level and the basin fills — a lake with a planted shoreline.' },
    ],
  },
  {
    id: 'paint',
    title: 'Paint — Surface Types',
    blocks: [
      { p: 'The terrain material blends four paintable surface types (Grass, Dirt, Rock, Sand). Select one and paint; Shift erases it (weights rebalance to the others). Each surface has a tint and an optional tileable texture — the picker suggests textures that fit the selected surface, plus your own generated textures and imported images.' },
      { p: 'Macro Variation breaks up flat color at world scale so large areas do not read as a single tone.' },
      { img: '/landscape-guide/surfaces.png', caption: 'Paint mode: rock, dirt, and sand painted over the base grass; the Surface Types list picks the brush target.' },
    ],
  },
  {
    id: 'foliage',
    title: 'Foliage — Painting Assets',
    blocks: [
      { p: 'The palette lists the assets your brush scatters. Checked entries paint together; select a tile to tune its rules: density, spacing, scale range, slope limits, slope alignment, and the Water rule. Shift-drag erases. The Single tool places ONE instance of the selected asset exactly where you click — on terrain or on placed meshes, aligned to the surface, which is how stalactites hang from cave ceilings. Shift-click removes one.' },
      { p: 'Manage palette… opens the full-screen browser with four sources:' },
      { list: [
        'Built-in — procedural trees, boulders, and meadow grass that ship with the lab.',
        'Saved in Labs — presets you saved in Tree Lab, Grass Lab, and Rock Lab in this browser. No export/import: save there, paint here.',
        'My Library — your saved generated assets on toonlab.io (sign in): AI-generated trees, rocks, props.',
        'Gallery — public creations from every ToonLab creator plus the Poly Haven CC0 model catalog, searchable by name.',
      ] },
      { p: 'Grass is special: it paints through the real blade system (wind and all), so grass strokes are dense clumps, not mesh copies. Removing a palette entry also erases its painted instances — both undoable.' },
      { img: '/landscape-guide/palette-manager.png', caption: 'The palette manager: your palette on the left, the searchable Built-in / Saved in Labs / My Library / Gallery browser on the right.' },
    ],
  },
  {
    id: 'walk',
    title: 'Walk Preview',
    blocks: [
      { p: 'Toggle Walk in the Preview bar: WASD/arrows move, Shift runs, Space jumps. The walker follows the sculpted ground and collides with painted foliage. Your tools STAY armed — you can stand inside a cave in first person and keep sculpting, painting, or placing.' },
      { p: 'Camera modes: Free (orbit as usual; only follows while you move) · Follow (locked third-person: the character stays centered, drag orbits around them) · 1st (through the walker’s eyes). While walking you can look fully up and down.' },
      { img: '/landscape-guide/walk-first.png', caption: 'First person at a cave mouth — tools stay armed, so you can keep editing from inside.' },
    ],
  },
  {
    id: 'size',
    title: 'Terrain Size',
    blocks: [
      { p: 'Project menu → Terrain size… works like Photoshop’s Canvas Size, generalized: pick the new tile grid (1–8 per axis, 64 m per tile), then drag the highlighted block — your existing terrain — to wherever it should sit. Growing adds flat tiles; shrinking crops (dim cells show what gets cut). Everything you built keeps its exact world position, and the whole resize is one undo entry.' },
      { img: '/landscape-guide/terrain-size.png', caption: 'Expanding 2×2 → 5×4 with the existing block dragged to its new position.' },
    ],
  },
  {
    id: 'generate',
    title: 'Generate Tiles',
    blocks: [
      { p: 'Project menu → Generate tiles… is controlled procedural generation for exactly the tiles you pick. The left side is a live map of your terrain — click or drag tiles to select; everything outside the selection is untouched, and the region edges feather into the surroundings so there is never a seam.' },
      { p: 'The right side is the control panel: terrain type (plains, rolling hills, mountains, desert dunes, canyon), min/max elevation (crank the max for real peaks), roughness, a seed (same seed = same terrain), optional features the generator best-effort fits in (Lake, River, Plateau, Cliff Steps), and an amount slider (0–100) for every palette asset — the surfaces repaint to match the type and the chosen assets are planted automatically, still honoring their slope/water/spacing rules.' },
      { img: '/landscape-guide/generate.png', caption: 'Generate tiles: map-view tile selection on the left, the full control panel on the right.' },
      { p: 'The generation lands as one undo entry (plus one for planted foliage) — experiment freely.' },
    ],
  },
  {
    id: 'project',
    title: 'Projects, Undo & Saving',
    blocks: [
      { p: 'Every stroke is one undo entry — sculpting, holes, dry zones, splat, foliage, seeding, even a full resize. The project autosaves to this browser a moment after each change and restores on reload.' },
      { p: 'Export project JSON writes one portable file (terrain, surfaces, holes, water zones, palette, every painted instance); Import restores it anywhere. Seed from archetype bakes a procedural terrain (rolling plains, karst, lakeland…) as a starting point — also just one undo entry. Reset lab returns to a flat start.' },
    ],
  },
  {
    id: 'recipes',
    title: 'Recipes',
    blocks: [
      { h: 'A lake with a planted shoreline' },
      { list: [
        'Sculpt + Shift: dig a basin below the Water Level (watch it fill).',
        'Smooth the banks; Paint the rim with Sand.',
        'Foliage: set a grass/reed entry to Water: Riverbed only and paint the shallows; trees with Avoid water take the shore automatically.',
        'Lily pads: any flat asset with Water: Float on surface.',
      ] },
      { h: 'A dry cave with an underground pool' },
      { list: [
        'Raise a large dome with Sculpt, then Smooth it.',
        'Hole tool, “Hole fills: Dry cave” — punch an entrance strip into the side. The opening stays dry even below the waterline.',
        'Foliage Single: build the floor and walls from boulders; click the ceiling to hang stalactites (they align to the surface).',
        'Set Groundwater Depth (Environment) to taste, then Sculpt + Shift a pit inside the cave — dig deep enough and the underground pool appears.',
        'Walk (1st person) into the cave and keep editing from inside.',
      ] },
      { h: 'A tunnel through a hill' },
      { list: [
        'Sculpt mode → Tunnel tool: click the entrance at the foot of one side, then the exit on the far side. The planner opens with both points pinned.',
        'Pick Arch (or doodle your own cross-section — a keyhole, a tall crack, anything closed) and set its width and height.',
        'Doodle the route on the map if you want the bore to curve through the hill; leave it straight otherwise. Bore tunnel — one undo entry.',
        'For a cave instead of a through-tunnel, drop Bore % below 100 — the passage stops short with a closed back wall.',
        'Walk (1st person) straight through, and dress the inside with the Foliage Single tool — props on the walls, stalactites on the roof.',
      ] },
      { h: 'Bigger world, same content' },
      { list: [
        'Terrain size… → choose a larger grid, drag your existing block where it belongs (e.g. 1 tile into slot 3,2 of a 4×4), Expand.',
        'Seed from archetype only fills flat terrain where you have not sculpted — or leave the new tiles flat and sculpt on.',
      ] },
    ],
  },
]);
