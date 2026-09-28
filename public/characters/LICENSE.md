# Bundled character assets

## mannequin.glb, mannequin.vrm, and mannequin.fbx

Mannequin + 45 animations from the **Universal Animation Library (Standard)**
by [Quaternius](https://quaternius.com/packs/universalanimationlibrary.html).

License: **CC0 1.0 Universal** (public domain dedication)
https://creativecommons.org/publicdomain/zero/1.0/

Source download: https://opengameart.org/content/universal-animation-library

- `mannequin.glb` is the Godot GLB export, renamed.
- `mannequin.fbx` is the Unity FBX export, renamed without modifying its
  embedded skeleton, mesh, or 45 animation clips.
- `mannequin.vrm` is generated from `mannequin.glb` by
  `scripts/generate-mannequin-vrm.mjs`. The script adds VRM 1.0 humanoid and
  CC0 metadata; mesh, skeleton, materials, and embedded animations remain the
  Quaternius source data.

GLB/VRM local modification: the two material base colors (`M_Main`, `M_Joints`) were
changed from the original orange/purple to neutral grays so the mannequin
reads as a lighting/shader test card.

Consider supporting the artist: https://www.patreon.com/quaternius
