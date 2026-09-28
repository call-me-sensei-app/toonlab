# Custom integration records

Custom work should be traceable instead of becoming an invisible fallback. Before adding it, use
`record_asset_gap` or `createAssetGapRecord()` and record:

- Target and rendering domain.
- Relevant style-bundle slot.
- MCP searches, queries, candidate IDs, and rejection reasons.
- Why permitted library, gallery, external, or procedural routes failed.
- What custom model, texture, shader, or adapter was introduced.
- Provenance, license, generator/recipe/seed where relevant, and the decision owner.
- Why the customization exists and what your team may want to revisit later.

The MCP server maintains `.toonlab/reports/style-asset-gaps.json` and the
workspace report `.toonlab/reports/asset-gaps.md`. These are local review records; exclude
them from source control when working with custom rendering or content.
