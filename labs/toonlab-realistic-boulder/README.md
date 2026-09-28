# ToonLab Realistic Boulder Compiler Lab

> Repository-only research surface. This is not a public package entry point.

This lab is the first ToonLab-owned vertical slice of the high-to-low rock
methodology. It does not import the Vibe3D generator, extractor, baker,
artifact format, or runtime material.

The reusable compiler accepts a low signed-distance source, a detailed source,
and a semantic-region sampler. It keeps ToonLab's existing QEF surface-nets
mesh and writes two packed UV pages:

- `normal-ao.png`: object-space normal XYZ + ambient occlusion;
- `surface.png`: signed height + signed curvature + semantic region + coverage.

The first qualified family is `toonlab/jointed-granite-boulder-v1`. Its seed
variation is deliberately narrow. Other geologies—including sandstone—reuse
the compiler but supply their own silhouette, fracture/strata, erosion, region,
and material profiles.

Compile the three review seeds:

```bash
node scripts/compile-realistic-boulder.mjs --seeds 11,29,53 --atlas 1024 --mesh 52
```

Generated artifacts remain under the gitignored
`assets-local/labs/toonlab-realistic-boulder/` tree.

Useful URLs while Vite is running:

```text
/labs/toonlab-realistic-boulder/?seed=11&look=realistic&view=hero
/labs/toonlab-realistic-boulder/?seed=11&look=stylized&view=hero
/labs/toonlab-realistic-boulder/?seed=29&look=realistic&view=ortho
/labs/toonlab-realistic-boulder/?seed=47&look=wire&view=hero
/labs/toonlab-realistic-boulder/?seed=11&look=channels&view=close
```

No family is approved by one attractive seed. Every admitted seed must pass
the structural family gate and realistic/stylized hero, close, orthographic,
wireframe, and channel inspection. The compiler contract is reusable across
rock types; each geology still needs its own visual qualification.

See [RESULTS.md](./RESULTS.md) for the multi-seed and every-family verdict.
