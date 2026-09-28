# Coastal landform and cliff formation

Use this reference before authoring or reviewing a rocky coast, cliff, pocket
beach, headland, sea stack, or submerged cliff continuation.

## Research translated into production rules

The sources converge on a hybrid, multi-scale pipeline:

- Ubisoft's [Procedural World Generation of Far Cry 5](https://www.gdcvault.com/play/1025215/Procedural-World-Generation-of-Far)
  separates large-scale automatic world filling from local artist tuning and
  includes dedicated tools for terrain, biomes, texturing, water networks, and
  cliff rocks. Translate this into ToonLab as deterministic macro generation
  plus explicit local assemblies; never treat one scatter pass as the finished
  coast.
- Epic's [PCG Biome Core](https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine)
  uses a fixed data-driven pipeline, layered priorities, local blending,
  root/child filtering, recursive hierarchical transforms, accurate bounds,
  and per-asset shadow overrides. Translate this into ordered coast zones,
  nested rock assemblies, exclusion masks, overlap checks, and cast/receive
  shadow defaults.
- Epic's [Electric Dreams environment](https://dev.epicgames.com/documentation/unreal-engine/electric-dreams-environment-in-unreal-engine)
  exposes the large cliff as an assembly and combines procedural and
  hand-crafted areas. Treat a cliff as an assembly-level landform, not an
  array of unrelated meshes.
- Adobe Research's [Terrain Amplification using Multi-scale Erosion](https://research.adobe.com/publication/terrain-amplification-using-multi-scale-erosion/)
  applies thermal, stream-power, and hillslope processes at several scales.
  Translate this into macro planform, primary masses, secondary fractures,
  and tertiary debris with coherent direction and parent geology.
- The U.S. National Park Service's [Rocky Coast Landforms](https://home.nps.gov/articles/rocky-coast-landforms.htm)
  relates coast profile to lithology and structure, identifies headlands and
  protected pocket beaches, and distinguishes massive-rock versus layered-rock
  erosion. A beach belongs inside a protected embayment; a massive granite
  coast should not randomly switch to sandstone steps.
- The U.S. Geological Survey's [Northern Monterey Bay field guide](https://pubs.usgs.gov/of/2000/0438/)
  describes seacliffs, shore platforms, pocket beaches, and headland/embayment
  morphology as one connected coastal system governed by geology, orientation,
  and wave exposure. Author all of those zones together.
- SideFX's [terrain workflow](https://www.sidefx.com/products/houdini/world-building/terrain/)
  uses layered noise, masks, erosion, and hierarchical scattering. Drive
  vegetation, rock, wetness, sediment, and underwater dressing from the same
  coast/height/slope/exposure fields.

## Required ToonLab workflow

1. Define one parent geology and its structural behavior: massive, layered,
   jointed, volcanic, or karst. Set slope profile, strata direction, fracture
   family, erosion resistance, and material palette before choosing assets.
2. Author the continuous terrain planform with at least two scales of
   variation. Use broad headlands and embayments first, then smaller notches.
   A noisy line with constant amplitude is still uniform.
3. Make the terrain volume own the land silhouette, cliff top, and underwater
   continuation. Extend topsoil and grass to selected rims and shoulders.
4. Reserve sheltered embayments between headlands for pocket beaches. Blend
   backshore, dry sand, wet sand, swash, shallow bed, and deep bed; do not paste
   sand between exposed cliff modules.
5. Place primary rocks only at structural events: headland noses, cove turns,
   terrace breaks, fault zones, face recesses, and terminations. Build each
   event as a nested 3D assembly with crown, mid-face, toe, and submerged depth.
6. Bury 30–65 percent of large module depth into terrain. Crop repeated
   silhouettes differently. Terrain or overlapping neighbors must hide backs,
   bases, and bounding edges.
7. Add secondary ledges, buttresses, crevice wedges, and slabs that bridge
   seams. Add talus below plausible fracture/failure zones, not at a uniform
   density everywhere.
8. Apply ground adoption or compatible grass/soil caps to upward crown
   surfaces. Taper grass using slope, exposure, substrate, and distance to the
   rim. The terrain grass field and the asset cap must read as one surface.
9. Continue parent geology underwater with a visible bed, submerged boulders,
   plants, and depth/shore water response. Never leave a hollow underside.
10. Enable cast and receive shadows on terrain, rock, tree, character, beach,
    and relevant water passes. Inspect contact, long cast shadows, and shaded
    cliff value separation before grading.

ToonLab does not ship an approved automatic cliff-formation API in this
release. Keep the connected landform and local assemblies project-owned, and
record that custom work as a custom integration note. Numeric checks can reject obvious
uniformity, but no instance-count, transform-range, spacing, or role-count
metric can approve a cliff without visual review.

## Rejection gates

Reject immediately when any of these are visible in gameplay, shore, flyover,
or top-down views:

- one constant-width row of rocks following the coast;
- primary assets at regular intervals, even with random jitter;
- thin walls, blades, teeth, mushrooms, stepping stones, or repeated twins;
- rocks defining the land silhouette while terrain stops behind them;
- grass ending before the rim when the geology supports a grass cap;
- isolated cap colors that do not join the terrain material;
- empty terrain triangles, visible module backs/bases, or unshadowed seams;
- beach outside a protected embayment or sediment inserted between cliff rocks;
- no toe/talus, shore platform, or submerged continuation;
- passing based on instance count alone. Hundreds of badly organized rocks
  still fail.

Record the landform profile, geology, coast range, assembly sites, role counts,
asset IDs, per-ID instance counts, burial range, transform range, exclusion
masks, shadow state, material state, and screenshots for all inspection views.
