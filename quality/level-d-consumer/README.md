# Level D clean consumer source

This fixture deliberately imports only published package entry points plus
`three`. `scripts/prepare-level-d-review.mjs` installs the packed npm candidate
into a new standalone project, builds this source there, records the exact
tarball checksum, and emits reviewer instructions.

The scene is not a package showcase or a Lab dependency. It is an external
consumer used to decide the independent Level D release gate.

Every manually authored renderable target in this fixture carries a stable
target ID. Every material slot carries a stable material ID and a semantic
role in the versioned ToonLab material contract. Strict bundle application is
therefore also a clean-consumer test of the same labeling contract required of
agents and developers.

The fixture excludes `three` and ToonLab from Vite dependency prebundling so
`three`, `three/webgpu`, `three/tsl`, package modules, and addons share the same
`three.core.js` identity. Loading the supplied original Quaternius FBX emits
two source-normalization warnings (more than four skin weights and Z-up to
Y-up conversion); these are recorded in the review manifest and must not be
confused with duplicate-runtime or ToonLab errors.

`scene-two.html` is a separate clean-room scene rather than a query-string
branch of the original fixture. It independently constructs a new ground,
meadow, river, bridge, rock formation, trees, collision field, walkable
character, sky, water, and strict style runtime from public package APIs. It
exists to catch hidden dependencies on the original scene's layout or setup.
