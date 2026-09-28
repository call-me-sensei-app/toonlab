# Asset-Sourcing Policy

Import from `@call-me-sensei/toonlab/asset-policy`.

Policies use one of three modes:

- `strict`: a candidate is usable only when its domain rule explicitly lists
  the candidate's source class.
- `advisory`: preferred sources are ranked first; other registered sources
  remain usable with a warning.
- `open`: every registered source class is allowed, with provenance retained.

Registered source classes are `project-library`, `toonlab-library`,
`toonlab-gallery`, `external-cc0`, `procedural`, and `custom`.

No policy means “ask, then advisory.” It never means strict and it never gives
an agent permission to claim that a sourcing requirement was satisfied.

The strict Call Me Sensei acceptance fixture allows rocks only from the
project library, ToonLab library, or ToonLab gallery. Trees may also use the
package's supported procedural legacy set or `BranchTree`. Other custom trees must be
reviewed and admitted to one of the approved libraries before that fixture can
use them.
