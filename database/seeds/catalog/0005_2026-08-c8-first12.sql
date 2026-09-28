-- Generated from release-manifest.json.
-- Release: 2026-08-c8-first12-v1
-- Asset count: 12
-- R2 objects must be uploaded and verified before this seed is committed.
insert into catalog_assets (
  id, release, source, source_id, kind, name, description, license, attribution,
  source_url, download_url, thumbnail_url, sha256, byte_size, content_type, tags, metadata,
  license_url, attribution_required, redistribution_scope, license_reviewed_at, availability_status
) values
(
  'rock-c8-hoodoo-caprock', '2026-08-c8-first12-v1', 'toonlab-rock',
  'hoodoo-caprock', 'model', 'Caprock hoodoo',
  'Editable ToonLab caprock hoodoo with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-hoodoo-caprock', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/thumbnail.png',
  '3099bc3ac6f1b33097e70186e96ef41b1ac877fe44a91d92a73af688ed61d012', 33329348, 'model/gltf-binary',
  array['rock','stone','hoodoo-caprock','fins-spires-and-hoodoos','limestone/dolostone caprock and weaker carbonate beds','claron-carbonate-bedded','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":3.2,"height":0.65,"width":0.7},"editor":{"preset":"karst-spire","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"fins-spires-and-hoodoos","lineage":{"geometryClassification":"retained-high-or-current-credible-shape","geometrySha256":"3099bc3ac6f1b33097e70186e96ef41b1ac877fe44a91d92a73af688ed61d012","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"claron-carbonate-bedded","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81017,"unit":"metre"},"geometry":{"classification":"retained-high-or-current-credible-shape","sha256":"3099bc3ac6f1b33097e70186e96ef41b1ac877fe44a91d92a73af688ed61d012"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"claron-carbonate-bedded","projection":{"axisScaleMetres":[1.025,1.025,1.025],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[0.7,0.65,3.2],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"54ed548a","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":0.8907228273338396,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.025,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.9756097560975611,0.9756097560975611,0.9756097560975611],"tileSpan":[0.6829268292682927,0.6341463414634148,3.1219512195121957],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81017,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"fe438be45d4ab0b88a30a75f7c5d2ec6f09ab2cc23c29bd043f8994c021e854e","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"hoodoo-caprock","geometrySha256":"3099bc3ac6f1b33097e70186e96ef41b1ac877fe44a91d92a73af688ed61d012","mapResolution":1024,"profileId":"claron-carbonate-bedded","projection":{"axisScaleMetres":[1.025,1.025,1.025],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[0.7,0.65,3.2],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"54ed548a","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":0.8907228273338396,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.025,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.9756097560975611,0.9756097560975611,0.9756097560975611],"tileSpan":[0.6829268292682927,0.6341463414634148,3.1219512195121957],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81017,"version":1},"taxonomy":{"geology":"limestone/dolostone caprock and weaker carbonate beds","morphology":"hoodoo-caprock","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"hoodoo-caprock","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-tor-block-pile', '2026-08-c8-first12-v1', 'toonlab-rock',
  'tor-block-pile', 'model', 'Block-pile tor',
  'Editable ToonLab block-pile tor with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-tor-block-pile', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/thumbnail.png',
  '855101b0b3e29bad5378f0a667e1155f51574503c294d211443e160d05c69f5b', 7782812, 'model/gltf-binary',
  array['rock','stone','tor-block-pile','residuals-and-outcrops','coarse granite/monzogranite','coarse-granite-jointed','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":8.562262,"height":8.878307,"width":9.879972},"editor":{"preset":"granite-boulder","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"residuals-and-outcrops","lineage":{"geometryClassification":"retained-high-or-current-credible-shape","geometrySha256":"855101b0b3e29bad5378f0a667e1155f51574503c294d211443e160d05c69f5b","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"coarse-granite-jointed","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81031,"unit":"metre"},"geometry":{"classification":"retained-high-or-current-credible-shape","sha256":"855101b0b3e29bad5378f0a667e1155f51574503c294d211443e160d05c69f5b"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"coarse-granite-jointed","projection":{"axisScaleMetres":[2.691963253472622,2.691963253472622,2.691963253472622],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[9.879972,8.878307,8.562262],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"2493f880","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":8.983470443859796,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":2.691963253472622,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[0.371476096009113,0.371476096009113,0.371476096009113],"tileSpan":[3.670173427239349,3.29807882353038,3.1806756607671804],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81031,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"f85a42652247ff089be8bae10f51ef656282bdbe6cd9ebb26b30ccec8cdfcfd5","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"tor-block-pile","geometrySha256":"855101b0b3e29bad5378f0a667e1155f51574503c294d211443e160d05c69f5b","mapResolution":1024,"profileId":"coarse-granite-jointed","projection":{"axisScaleMetres":[2.691963253472622,2.691963253472622,2.691963253472622],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[9.879972,8.878307,8.562262],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"2493f880","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":8.983470443859796,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":2.691963253472622,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[0.371476096009113,0.371476096009113,0.371476096009113],"tileSpan":[3.670173427239349,3.29807882353038,3.1806756607671804],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81031,"version":1},"taxonomy":{"geology":"coarse granite/monzogranite","morphology":"tor-block-pile","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"tor-block-pile","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-boulder-rounded', '2026-08-c8-first12-v1', 'toonlab-rock',
  'boulder-rounded', 'model', 'Rounded boulder',
  'Editable ToonLab rounded boulder with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-boulder-rounded', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/thumbnail.png',
  '495e97678faf063ace40fdb240916aa70d7db0f895e9c3f310c993bac1695413', 5742940, 'model/gltf-binary',
  array['rock','stone','boulder-rounded','detached-clasts','granite/monzogranite with granular weathering','weathered-monzogranite','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":0.94,"height":1.18,"width":1.55},"editor":{"preset":"river-boulder","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"detached-clasts","lineage":{"geometryClassification":"retained-high-or-current-credible-shape","geometrySha256":"495e97678faf063ace40fdb240916aa70d7db0f895e9c3f310c993bac1695413","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"weathered-monzogranite","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81043,"unit":"metre"},"geometry":{"classification":"retained-high-or-current-credible-shape","sha256":"495e97678faf063ace40fdb240916aa70d7db0f895e9c3f310c993bac1695413"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"weathered-monzogranite","projection":{"axisScaleMetres":[0.7300464967541606,0.7300464967541606,0.7300464967541606],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[1.55,1.18,0.94],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"249a4963","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":1.188952753025779,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":0.7300464967541606,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[1.3697757669491906,1.3697757669491906,1.3697757669491906],"tileSpan":[2.1231524387712453,1.6163354050000447,1.287589220932239],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81043,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"89aed9250d300a1848886d58f428f895f1402adbb64b31aae2d22003d86402d3","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"boulder-rounded","geometrySha256":"495e97678faf063ace40fdb240916aa70d7db0f895e9c3f310c993bac1695413","mapResolution":1024,"profileId":"weathered-monzogranite","projection":{"axisScaleMetres":[0.7300464967541606,0.7300464967541606,0.7300464967541606],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[1.55,1.18,0.94],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"249a4963","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":1.188952753025779,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":0.7300464967541606,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[1.3697757669491906,1.3697757669491906,1.3697757669491906],"tileSpan":[2.1231524387712453,1.6163354050000447,1.287589220932239],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81043,"version":1},"taxonomy":{"geology":"granite/monzogranite with granular weathering","morphology":"boulder-rounded","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"boulder-rounded","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-block-jointed', '2026-08-c8-first12-v1', 'toonlab-rock',
  'block-jointed', 'model', 'Joint-bounded block',
  'Editable ToonLab joint-bounded block with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-block-jointed', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/thumbnail.png',
  '7c855412b4c2b0af047b0c93e7487d6c84097286df625d49b0a5a2a1a0d43235', 46556788, 'model/gltf-binary',
  array['rock','stone','block-jointed','detached-clasts','coarse granite/monzogranite','coarse-granite-jointed','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":0.72,"height":0.78,"width":0.95},"editor":{"preset":"granite-boulder","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"detached-clasts","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"7c855412b4c2b0af047b0c93e7487d6c84097286df625d49b0a5a2a1a0d43235","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"coarse-granite-jointed","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81059,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"7c855412b4c2b0af047b0c93e7487d6c84097286df625d49b0a5a2a1a0d43235"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"coarse-granite-jointed","projection":{"axisScaleMetres":[0.902,0.902,0.902],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[0.95,0.78,0.72],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"63782993","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":0.795375883664966,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":0.902,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[1.1086474501108647,1.1086474501108647,1.1086474501108647],"tileSpan":[1.0532150776053215,0.8647450110864745,0.7982261640798226],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81059,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"1a8cc02d50951c76639b07d059edfa6cb81713a203b88a52b85527e009e9e346","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"block-jointed","geometrySha256":"7c855412b4c2b0af047b0c93e7487d6c84097286df625d49b0a5a2a1a0d43235","mapResolution":1024,"profileId":"coarse-granite-jointed","projection":{"axisScaleMetres":[0.902,0.902,0.902],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[0.95,0.78,0.72],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"63782993","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":0.795375883664966,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":0.902,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[1.1086474501108647,1.1086474501108647,1.1086474501108647],"tileSpan":[1.0532150776053215,0.8647450110864745,0.7982261640798226],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81059,"version":1},"taxonomy":{"geology":"coarse granite/monzogranite","morphology":"block-jointed","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"block-jointed","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-boulder-river-worn', '2026-08-c8-first12-v1', 'toonlab-rock',
  'boulder-river-worn', 'model', 'River-worn boulder',
  'Editable ToonLab river-worn boulder with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-boulder-river-worn', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/thumbnail.png',
  '70e7aa91cabc33a7f64d34ff77a3cc715859d57d04aab1c478baee0a8da79063', 47919164, 'model/gltf-binary',
  array['rock','stone','boulder-river-worn','detached-clasts','quartz sandstone with transport abrasion','river-abraded-sandstone','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":0.7,"height":0.82,"width":1.1},"editor":{"preset":"river-boulder","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"detached-clasts","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"70e7aa91cabc33a7f64d34ff77a3cc715859d57d04aab1c478baee0a8da79063","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"river-abraded-sandstone","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81071,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"70e7aa91cabc33a7f64d34ff77a3cc715859d57d04aab1c478baee0a8da79063"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"river-abraded-sandstone","projection":{"axisScaleMetres":[0.5903999999999999,0.5903999999999999,0.5903999999999999],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[1.1,0.82,0.7],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"5b434f54","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":0.8387342072057902,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":0.5903999999999999,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[1.693766937669377,1.693766937669377,1.693766937669377],"tileSpan":[1.8631436314363148,1.388888888888889,1.1856368563685638],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81071,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"83bc8fc5350a242c65accbd935fafa490055318d3e494d2c4f36e61ea15a5585","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"boulder-river-worn","geometrySha256":"70e7aa91cabc33a7f64d34ff77a3cc715859d57d04aab1c478baee0a8da79063","mapResolution":1024,"profileId":"river-abraded-sandstone","projection":{"axisScaleMetres":[0.5903999999999999,0.5903999999999999,0.5903999999999999],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[1.1,0.82,0.7],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"5b434f54","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":0.8387342072057902,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":0.5903999999999999,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[1.693766937669377,1.693766937669377,1.693766937669377],"tileSpan":[1.8631436314363148,1.388888888888889,1.1856368563685638],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81071,"version":1},"taxonomy":{"geology":"quartz sandstone with transport abrasion","morphology":"boulder-river-worn","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"boulder-river-worn","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-slab-bedded', '2026-08-c8-first12-v1', 'toonlab-rock',
  'slab-bedded', 'model', 'Bedding-controlled slab',
  'Editable ToonLab bedding-controlled slab with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-slab-bedded', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/thumbnail.png',
  '6168f99f626636e0b0a6e54c0ef43821b15c5415c269d3c33d9efe8c064acb1a', 47682708, 'model/gltf-binary',
  array['rock','stone','slab-bedded','detached-clasts','cross-bedded quartz sandstone','red-sandstone-bedded','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":0.18,"height":0.7,"width":0.95},"editor":{"preset":"cliff-wall","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"detached-clasts","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"6168f99f626636e0b0a6e54c0ef43821b15c5415c269d3c33d9efe8c064acb1a","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"red-sandstone-bedded","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81083,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"6168f99f626636e0b0a6e54c0ef43821b15c5415c269d3c33d9efe8c064acb1a"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"red-sandstone-bedded","projection":{"axisScaleMetres":[0.861,0.861,0.861],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[0.95,0.7,0.18],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"924401f1","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":0.5873514497811948,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":0.861,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[1.1614401858304297,1.1614401858304297,1.1614401858304297],"tileSpan":[1.1033681765389083,0.8130081300813008,0.20905923344947736],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81083,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"e24cf05a81ebbb06b5c6804d093617cb389ed41d0f3268ed40aa156e2bf6f3a9","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"slab-bedded","geometrySha256":"6168f99f626636e0b0a6e54c0ef43821b15c5415c269d3c33d9efe8c064acb1a","mapResolution":1024,"profileId":"red-sandstone-bedded","projection":{"axisScaleMetres":[0.861,0.861,0.861],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[0.95,0.7,0.18],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"924401f1","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":0.5873514497811948,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":0.861,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[1.1614401858304297,1.1614401858304297,1.1614401858304297],"tileSpan":[1.1033681765389083,0.8130081300813008,0.20905923344947736],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81083,"version":1},"taxonomy":{"geology":"cross-bedded quartz sandstone","morphology":"slab-bedded","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"slab-bedded","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-outcrop-jointed', '2026-08-c8-first12-v1', 'toonlab-rock',
  'outcrop-jointed', 'model', 'Jointed outcrop',
  'Editable ToonLab jointed outcrop with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-outcrop-jointed', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/thumbnail.png',
  '1d9eedeed50889c42acfa1239dc96a529e845149d812b4ec2ddca410ee35beca', 45485216, 'model/gltf-binary',
  array['rock','stone','outcrop-jointed','residuals-and-outcrops','coarse granite/monzogranite','coarse-granite-jointed','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":1.8,"height":1.6,"width":2.4},"editor":{"preset":"granite-boulder","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"residuals-and-outcrops","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"1d9eedeed50889c42acfa1239dc96a529e845149d812b4ec2ddca410ee35beca","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"coarse-granite-jointed","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81097,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"1d9eedeed50889c42acfa1239dc96a529e845149d812b4ec2ddca410ee35beca"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"coarse-granite-jointed","projection":{"axisScaleMetres":[1.222171520369423,1.222171520369423,1.222171520369423],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[2.4,1.6,1.8],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"0684ebe9","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":1.8516982130604627,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.222171520369423,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[0.8182157604995838,0.8182157604995838,0.8182157604995838],"tileSpan":[1.963717825199001,1.309145216799334,1.472788368899251],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81097,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"a24ca8845759d9ae51ed881d47d1b54f4750b7cb1cfaa725d5940ccf395fda54","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"outcrop-jointed","geometrySha256":"1d9eedeed50889c42acfa1239dc96a529e845149d812b4ec2ddca410ee35beca","mapResolution":1024,"profileId":"coarse-granite-jointed","projection":{"axisScaleMetres":[1.222171520369423,1.222171520369423,1.222171520369423],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[2.4,1.6,1.8],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"0684ebe9","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":1.8516982130604627,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.222171520369423,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[0.8182157604995838,0.8182157604995838,0.8182157604995838],"tileSpan":[1.963717825199001,1.309145216799334,1.472788368899251],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81097,"version":1},"taxonomy":{"geology":"coarse granite/monzogranite","morphology":"outcrop-jointed","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"outcrop-jointed","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-outcrop-bedded', '2026-08-c8-first12-v1', 'toonlab-rock',
  'outcrop-bedded', 'model', 'Bedded outcrop',
  'Editable ToonLab bedded outcrop with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-outcrop-bedded', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/thumbnail.png',
  '31b6d0d4aa34fca8371899850fa41c9a8153de4bfa44c11d7cde3f534299ee6e', 46841828, 'model/gltf-binary',
  array['rock','stone','outcrop-bedded','residuals-and-outcrops','cross-bedded quartz sandstone','red-sandstone-bedded','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":3,"height":3.6654,"width":3.6652},"editor":{"preset":"eroded-mesa","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"residuals-and-outcrops","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"31b6d0d4aa34fca8371899850fa41c9a8153de4bfa44c11d7cde3f534299ee6e","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"red-sandstone-bedded","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81109,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"31b6d0d4aa34fca8371899850fa41c9a8153de4bfa44c11d7cde3f534299ee6e"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"red-sandstone-bedded","projection":{"axisScaleMetres":[1.614159505811299,1.614159505811299,1.614159505811299],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[3.6652,3.6654,3],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"69922f16","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":3.544912802994526,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.614159505811299,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.6195174618120445,0.6195174618120445,0.6195174618120445],"tileSpan":[2.2706554010335056,2.2707793045258677,1.8585523854361334],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81109,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"84e6dc91d1ff348e77eb80c0e5804e91692f451ba93d7653c1b7408c3f096a97","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"outcrop-bedded","geometrySha256":"31b6d0d4aa34fca8371899850fa41c9a8153de4bfa44c11d7cde3f534299ee6e","mapResolution":1024,"profileId":"red-sandstone-bedded","projection":{"axisScaleMetres":[1.614159505811299,1.614159505811299,1.614159505811299],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[3.6652,3.6654,3],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"69922f16","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":3.544912802994526,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.614159505811299,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.6195174618120445,0.6195174618120445,0.6195174618120445],"tileSpan":[2.2706554010335056,2.2707793045258677,1.8585523854361334],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81109,"version":1},"taxonomy":{"geology":"cross-bedded quartz sandstone","morphology":"outcrop-bedded","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"outcrop-bedded","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-ledge-resistant', '2026-08-c8-first12-v1', 'toonlab-rock',
  'ledge-resistant', 'model', 'Resistant rock ledge',
  'Editable ToonLab resistant rock ledge with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-ledge-resistant', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/thumbnail.png',
  '4cb26bdc9ab6ff2f76074d2881b4db594d1fabf2d7a972a970b75e936403635d', 47700360, 'model/gltf-binary',
  array['rock','stone','ledge-resistant','rock-surfaces-and-steps','massive to bedded limestone/dolostone','kaibab-limestone-ledge','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":2.4,"height":3.07,"width":3.36},"editor":{"preset":"cliff-face","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"rock-surfaces-and-steps","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"4cb26bdc9ab6ff2f76074d2881b4db594d1fabf2d7a972a970b75e936403635d","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"kaibab-limestone-ledge","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81121,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"4cb26bdc9ab6ff2f76074d2881b4db594d1fabf2d7a972a970b75e936403635d"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"kaibab-limestone-ledge","projection":{"axisScaleMetres":[2.188826831003296,2.188826831003296,2.188826831003296],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[3.36,3.07,2.4],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"e5f6ca87","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":2.9912359393048478,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":2.188826831003296,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.45686574462431473,0.45686574462431473,0.45686574462431473],"tileSpan":[1.5350689019376975,1.402577835996646,1.0964777870983553],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81121,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"6034356aca01091d0bddc7f713254bbc69df8502679487b2a331a97b917de5b0","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"ledge-resistant","geometrySha256":"4cb26bdc9ab6ff2f76074d2881b4db594d1fabf2d7a972a970b75e936403635d","mapResolution":1024,"profileId":"kaibab-limestone-ledge","projection":{"axisScaleMetres":[2.188826831003296,2.188826831003296,2.188826831003296],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[3.36,3.07,2.4],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"e5f6ca87","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":2.9912359393048478,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":2.188826831003296,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.45686574462431473,0.45686574462431473,0.45686574462431473],"tileSpan":[1.5350689019376975,1.402577835996646,1.0964777870983553],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81121,"version":1},"taxonomy":{"geology":"massive to bedded limestone/dolostone","morphology":"ledge-resistant","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"ledge-resistant","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-pillar-residual', '2026-08-c8-first12-v1', 'toonlab-rock',
  'pillar-residual', 'model', 'Residual pillar',
  'Editable ToonLab residual pillar with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-pillar-residual', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/thumbnail.png',
  'c9da410131c09ad74c6aff505b4fe3746c00cff66f8a45f51634e5f2098bb97d', 45898188, 'model/gltf-binary',
  array['rock','stone','pillar-residual','fins-spires-and-hoodoos','quartz sandstone with iron-stained bedding and joints','quartz-sandstone-pillar','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":4.7,"height":1,"width":1.35},"editor":{"preset":"karst-spire","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"fins-spires-and-hoodoos","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"c9da410131c09ad74c6aff505b4fe3746c00cff66f8a45f51634e5f2098bb97d","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"quartz-sandstone-pillar","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81131,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"c9da410131c09ad74c6aff505b4fe3746c00cff66f8a45f51634e5f2098bb97d"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"quartz-sandstone-pillar","projection":{"axisScaleMetres":[1.4885900680609476,1.4885900680609476,1.4885900680609476],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[1.35,1,4.7],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"606a64fa","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":1.580903964848773,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.4885900680609476,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.6717766169853666,0.6717766169853666,0.6717766169853666],"tileSpan":[0.906898432930245,0.6717766169853666,3.157350099831223],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81131,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"9eaf36ffcb28ee6480a9f3d31b058ee38da938b7e98711b22e8a4bd54ca294d2","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"pillar-residual","geometrySha256":"c9da410131c09ad74c6aff505b4fe3746c00cff66f8a45f51634e5f2098bb97d","mapResolution":1024,"profileId":"quartz-sandstone-pillar","projection":{"axisScaleMetres":[1.4885900680609476,1.4885900680609476,1.4885900680609476],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[1.35,1,4.7],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"606a64fa","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":1.580903964848773,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.4885900680609476,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.6717766169853666,0.6717766169853666,0.6717766169853666],"tileSpan":[0.906898432930245,0.6717766169853666,3.157350099831223],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81131,"version":1},"taxonomy":{"geology":"quartz sandstone with iron-stained bedding and joints","morphology":"pillar-residual","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"pillar-residual","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-sea-stack', '2026-08-c8-first12-v1', 'toonlab-rock',
  'sea-stack', 'model', 'Sea stack',
  'Editable ToonLab sea stack with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-sea-stack', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/thumbnail.png',
  '3f65765c1c3fe58cbce306b9fc55b06bebd782282634d70bc81a9b87b1d6b322', 47088744, 'model/gltf-binary',
  array['rock','stone','sea-stack','coastal-residuals','bedded coastal sandstone','coastal-sandstone-stack','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":4.5,"height":1.05,"width":1.35},"editor":{"preset":"sea-stack","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"coastal-residuals","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"3f65765c1c3fe58cbce306b9fc55b06bebd782282634d70bc81a9b87b1d6b322","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"coastal-sandstone-stack","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81143,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"3f65765c1c3fe58cbce306b9fc55b06bebd782282634d70bc81a9b87b1d6b322"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"coastal-sandstone-stack","projection":{"axisScaleMetres":[1.6638498258184076,1.6638498258184076,1.6638498258184076],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[1.35,1.05,4.5],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"360919d7","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":1.5823023793301008,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.6638498258184076,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.6010157794788505,0.6010157794788505,0.6010157794788505],"tileSpan":[0.8113713022964484,0.6310665684527932,2.7045710076548275],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81143,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"582dcaa6087b37429394cbbc0411ba0e585402c1ca8097a88292d59300f29a21","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"sea-stack","geometrySha256":"3f65765c1c3fe58cbce306b9fc55b06bebd782282634d70bc81a9b87b1d6b322","mapResolution":1024,"profileId":"coastal-sandstone-stack","projection":{"axisScaleMetres":[1.6638498258184076,1.6638498258184076,1.6638498258184076],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[1.35,1.05,4.5],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"360919d7","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":1.5823023793301008,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.6638498258184076,"structuralFabricProjection":{"coherentBedPlaneRequired":true,"directGenericSymmetricTriplanarAllowed":false,"directionalFabricHandoff":"Bake from an object-local 3D bedding scalar into UV0 or use an axis-conditioned sampler that preserves one bed plane and suppresses false top-axis stripes.","genericSymmetricTriplanarCannotApproveBeddedAssets":true},"textureCoordinateScalePerMetre":[0.6010157794788505,0.6010157794788505,0.6010157794788505],"tileSpan":[0.8113713022964484,0.6310665684527932,2.7045710076548275],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81143,"version":1},"taxonomy":{"geology":"bedded coastal sandstone","morphology":"sea-stack","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"sea-stack","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
),
(
  'rock-c8-volcanic-neck', '2026-08-c8-first12-v1', 'toonlab-rock',
  'volcanic-neck', 'model', 'Volcanic neck',
  'Editable ToonLab volcanic neck with independent metre-scale realistic geology maps and optional Call Me Sensei stylization.', 'CC0-1.0', 'Created by ToonLab / Call Me Sensei.',
  'https://toonlab.dev/gallery/rock-c8-volcanic-neck', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/rock.glb', 'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/thumbnail.png',
  'f743ea08ea87b0e86296c2db4de9359fb07cb63c54e148a7939b6f4c68a74d29', 47429768, 'model/gltf-binary',
  array['rock','stone','volcanic-neck','volcanic-and-cooling-forms','phonolite porphyry / resistant intrusive volcanic rock','phonolite-porphyry-cooling','realistic-geology','pbr','editable','rock-lab','call-me-sensei']::text[], '{"catalog":"rocks","dimensionsMeters":{"depth":4,"height":2.5,"width":3},"editor":{"preset":"basalt-columns","reapplySurface":true,"sourceMode":"mesh-template"},"familyId":"volcanic-and-cooling-forms","lineage":{"geometryClassification":"retained-provider-visual-candidate","geometrySha256":"f743ea08ea87b0e86296c2db4de9359fb07cb63c54e148a7939b6f4c68a74d29","natureEvidenceNotRedistributed":true,"providerTextureContribution":0},"profileId":"phonolite-porphyry-cooling","recipe":{"schema":"toonlab/rock-gallery-recipe","version":1,"generator":{"kind":"source-mesh-variation","seed":81157,"unit":"metre"},"geometry":{"classification":"retained-provider-visual-candidate","sha256":"f743ea08ea87b0e86296c2db4de9359fb07cb63c54e148a7939b6f4c68a74d29"},"material":{"pipeline":"c8-first12-realistic-geology-v1","profileId":"phonolite-porphyry-cooling","projection":{"axisScaleMetres":[1.926024869300171,1.926024869300171,1.926024869300171],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[3,2.5,4],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"2041e7e1","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":3.0531455120680993,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.926024869300171,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[0.5192040954088791,0.5192040954088791,0.5192040954088791],"tileSpan":[1.5576122862266375,1.2980102385221979,2.0768163816355165],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"seed":81157,"legacyEmbeddedMapContribution":0,"legacySixtyTextureLibraryContribution":0},"editing":{"boundedProceduralVariation":true,"manualVertexSculpt":true,"reapplySurfaceAfterEdit":true,"deterministicReprojection":true},"output":{"mapResolution":1024,"maps":["ao","baseColor","heightMicro","normalGL","orm","roughness","smoothness"],"lod4Included":false}},"recipeHash":"5c8fd47083f83cde879a544fbaec4876b43b16626b29afc026a8730d11edd9ab","releaseWave":62,"revision":1,"surfacePackage":{"assetId":"volcanic-neck","geometrySha256":"f743ea08ea87b0e86296c2db4de9359fb07cb63c54e148a7939b6f4c68a74d29","mapResolution":1024,"profileId":"phonolite-porphyry-cooling","projection":{"axisScaleMetres":[1.926024869300171,1.926024869300171,1.926024869300171],"bounds":{"axisOrder":"x-y-z","dimensionsMetres":[3,2.5,4],"maximumMetres":null,"minimumMetres":null,"upAxis":"y"},"boundsFingerprint":"2041e7e1","boundsRole":"derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin","characteristicMetres":3.0531455120680993,"coordinateFrame":"absolute-world-position-y-up","mode":"world-metre-triplanar-isotropic","recalculatedFromEditedBounds":true,"scaleMetres":1.926024869300171,"structuralFabricProjection":{"coherentBedPlaneRequired":false,"directGenericSymmetricTriplanarAllowed":true,"directionalFabricHandoff":"Generic world-space triplanar is permitted after normal/tangent integrity review.","genericSymmetricTriplanarCannotApproveBeddedAssets":false},"textureCoordinateScalePerMetre":[0.5192040954088791,0.5192040954088791,0.5192040954088791],"tileSpan":[1.5576122862266375,1.2980102385221979,2.0768163816355165],"translationChangesWorldAnchoredPhase":true,"triplanarAxisUv":{"xProjection":"u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres","yProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres","zProjection":"u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres"}},"schema":"toonlab/c8-first12-geology-surface","seed":81157,"version":1},"taxonomy":{"geology":"phonolite porphyry / resistant intrusive volcanic rock","morphology":"volcanic-neck","surface":"c8-realistic-geology"},"technicalLimitations":{"cleanIndependentControlTopologyForEveryAsset":false,"collisionIncluded":false,"completeLod0ThroughLod4":false,"signedHighToLodResidualIncluded":false},"variation":{"id":"volcanic-neck","material":"material-config.json"}}'::jsonb,
  'https://creativecommons.org/publicdomain/zero/1.0/', false,
  'archive-and-files', '2026-08-31', 'active'
)
on conflict (id) do update set
  release = excluded.release,
  source = excluded.source,
  source_id = excluded.source_id,
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  license = excluded.license,
  attribution = excluded.attribution,
  source_url = excluded.source_url,
  download_url = excluded.download_url,
  thumbnail_url = excluded.thumbnail_url,
  sha256 = excluded.sha256,
  byte_size = excluded.byte_size,
  content_type = excluded.content_type,
  tags = excluded.tags,
  metadata = excluded.metadata,
  license_url = excluded.license_url,
  attribution_required = excluded.attribution_required,
  redistribution_scope = excluded.redistribution_scope,
  license_reviewed_at = excluded.license_reviewed_at,
  availability_status = 'active',
  withdrawal_reason = null;
delete from catalog_asset_files where asset_id in ('rock-c8-hoodoo-caprock', 'rock-c8-tor-block-pile', 'rock-c8-boulder-rounded', 'rock-c8-block-jointed', 'rock-c8-boulder-river-worn', 'rock-c8-slab-bedded', 'rock-c8-outcrop-jointed', 'rock-c8-outcrop-bedded', 'rock-c8-ledge-resistant', 'rock-c8-pillar-residual', 'rock-c8-sea-stack', 'rock-c8-volcanic-neck');
insert into catalog_asset_files (
  asset_id, relative_path, kind, download_url, sha256, byte_size, content_type, notice, compatibility
) values
(
  'rock-c8-hoodoo-caprock', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/rock.glb', '3099bc3ac6f1b33097e70186e96ef41b1ac877fe44a91d92a73af688ed61d012',
  33329348, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/thumbnail.png', 'e515e3c4c74aa2f61b0213b25956e114161690bfb5bc62816e05f63b1bcf4034',
  206072, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/realistic-preview.png', '00697fa820040d5019712d0c8410a8183eae8813326a148938764f8eabe27ef6',
  206040, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/material-config.json', '29f8438de603ab2a92cfeee9d10a9fcbee5b1560888b4429caa09a214e91502f',
  4270, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/recipe.json', 'fe438be45d4ab0b88a30a75f7c5d2ec6f09ab2cc23c29bd043f8994c021e854e',
  2657, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/manifest.json', 'c3a107e73af3fbfd3d4eda6d2187c721e725d479a1864021525a877f60c1b768',
  2630, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/ao.png', '56a0fb4a85cdde53121cd3bac4009c07c78e0865ae1a993bf015421f1784514d',
  150516, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/baseColor.png', '8fe72946c3af4029d8f912811f9cb8f28ac6cd29a6e7201c14a5e3f847662ca3',
  229308, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/heightMicro.png', '812630dfc7e23a7beef441c87c3afe4094324d05c60c597de893b1f4111a5be7',
  295319, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/normalGL.png', '6bbeadb6ac4acfba9b6189dc1c20b5b5f39fbb98db0cabd0a77deb4bda1651ff',
  900966, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/orm.png', '65631d99c87f02469f51234093af64423e1de5f15df8530c58d3dcf7f3a2a7db',
  406297, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/roughness.png', 'c945a46327dca3a2185a6628b49a4fc22335a886e5e9ba1ff8d69597b9e9889f',
  190354, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-hoodoo-caprock', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-hoodoo-caprock/smoothness.png', 'ae6f90de319ef934f9d06058eb6b6c5e0eb0c5839442f76a5a628c2a80d2998a',
  190354, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/rock.glb', '855101b0b3e29bad5378f0a667e1155f51574503c294d211443e160d05c69f5b',
  7782812, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/thumbnail.png', '8ff7701a99433d60f0337318ada26ef1a7abfdeaae624ce538fec3ea1e9c850a',
  209219, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/realistic-preview.png', 'fc46cf102b9367bd35aa0aad70f36c4dc6463b1ee0f55b4b50db283cb3eca24d',
  208835, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/material-config.json', '54960b88e7fc28eaa78c70fab4b51d39c3035e4b20e8a5dbc83b90457ebc620c',
  4235, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/recipe.json', 'f85a42652247ff089be8bae10f51ef656282bdbe6cd9ebb26b30ccec8cdfcfd5',
  2638, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/manifest.json', '7852084c9fc8c8191e6873d85c8cdc9f0029985edf998399f8a95cde846f6660',
  2608, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/ao.png', '54eb8919b97dead6bbea598a1ab2670f803b99a0c1807ae466e0beccdf4b714c',
  147679, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/baseColor.png', '430c437e0b9fa787fe9bde08a6a0e780e94933858cf9378bae3d7c9c8bf46432',
  210671, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/heightMicro.png', 'fbea0a8c745f18b8badc6c390cbb1897aee2fd321e9fde7ac41241a1e956aa88',
  377270, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/normalGL.png', '7d9bd9b7454d42284ffec12efa63b762f5db9165ef9f518a61ff60ac099e0cf8',
  385576, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/orm.png', '6901c43e0c75f3587a5c7f17889241e59db344826f02d10650dfcd639ade2b5e',
  384800, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/roughness.png', '1fa82faf7ee877e1c9645ec21ce06170b1b2a5ed9ffa59d06aff4f89e3f6cd56',
  197531, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-tor-block-pile', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-tor-block-pile/smoothness.png', 'cf15285adb8004eb5eb27bcb5de996989d988dc4a00b2576c095626ba01e9fa3',
  197532, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/rock.glb', '495e97678faf063ace40fdb240916aa70d7db0f895e9c3f310c993bac1695413',
  5742940, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/thumbnail.png', 'a3eeb38fd632a7ad4e56b40a4f0be3144b98a3c78d9028663ee47a46c1a55407',
  195560, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/realistic-preview.png', '7787c867a96f5a871e12e4537c2615d02eb914085e031f90c6a81fe6e8580665',
  195280, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/material-config.json', 'fd892bc78ef98aace39488c177820d42f25fb48be5325c3df3685cc81fcd7f08',
  4263, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/recipe.json', '89aed9250d300a1848886d58f428f895f1402adbb64b31aae2d22003d86402d3',
  2635, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/manifest.json', '19c1ca882a4fb91a3d62ad3fbbd59adb78307618197d8c28e6937f0393c480c6',
  2600, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/ao.png', '5837a528dc49f333bf87201a37a27335d9fc4bd03ad10b32e8548e42536a2b5f',
  135721, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/baseColor.png', '58f60b6725095c728d07b8c1fa322ca9a850a0eef878b1f5e67d3ed50978d300',
  198519, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/heightMicro.png', '444b459b63caea6e91fc8baf4abd2080a809f25ee383e0c5e34c333eb535b741',
  341060, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/normalGL.png', '9ed058d2ede4fba823e8a8eee8a62dd5330c822fcdf2cf6c20e8415013fd2e1d',
  693531, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/orm.png', 'a54b0db764d4529ec1b1c72f9a95cbce3014663651155145c26c2a535b871541',
  370494, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/roughness.png', '175ae3c532bb925d8fd44d8ba1dc9bb0e319c9d3c3e4c3e45bff092e18e03fc4',
  192774, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-rounded', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-rounded/smoothness.png', '2ee05d2ee33a18edbadd9a1d970ae46cfc0285112df14cee65833f7b41374868',
  192773, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/rock.glb', '7c855412b4c2b0af047b0c93e7487d6c84097286df625d49b0a5a2a1a0d43235',
  46556788, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/thumbnail.png', 'ea1f2e1b92a25fba15cade4dd61410e10d18baf011fc6ade8e33b30ba9fc3f78',
  186588, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/realistic-preview.png', 'b3f6d23be1a1ae154d42bd5fa00bf0a89c6517d4f706ca525ee43600dc811e19',
  189608, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/material-config.json', 'd584e1e7610b5710a2d49fd135388884f0b949722691dce777e21e3f61a1eb2b',
  4159, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/recipe.json', '1a8cc02d50951c76639b07d059edfa6cb81713a203b88a52b85527e009e9e346',
  2579, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/manifest.json', '074a397ffbeea72f48e7fe82c58bee8bf0f7195e9e3efd6fbcdaaf1e712afaf4',
  2546, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/ao.png', '3b250fe510954aa0afd3acb52b86df790ddeb86c04d774dfa0f7a0a33daab55a',
  136476, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/baseColor.png', '96414af66aea5d48bd051a82445c1768743062c678671bc1f5a200bc450f8567',
  183030, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/heightMicro.png', 'a153b88f93552a252ea3b62cd31d60c274a8e5514e5cb8c359c9ded18a4d84e2',
  321931, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/normalGL.png', '6e8ac27f18da226e805c56d7a22f2e775faaa15db9b1419001f11f70d8e7c764',
  783126, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/orm.png', '2b0a1a0cb34aa7bc3781512738a3e5df9f896fe1096864e87718a3b8e05dee01',
  372216, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/roughness.png', '46e45ce6dd3bc000b6e2fa2d9cb2af23b94c52488f6a8db4efcd9cc82682b334',
  192395, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-block-jointed', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-block-jointed/smoothness.png', 'dd19f583c3aed9589195131aada823184562b46d13d34e93602d3ff8e5d9c4cc',
  192395, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/rock.glb', '70e7aa91cabc33a7f64d34ff77a3cc715859d57d04aab1c478baee0a8da79063',
  47919164, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/thumbnail.png', 'b32eabb03b8abb569c9d7cce10f6351394a622da567053ec69e7e6b4918d05ff',
  187096, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/realistic-preview.png', '04f1562b858db70678b402df7b702ecc4667dadba88e020301e3125bbc799364',
  186234, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/material-config.json', 'bb3b686e296c628a57149d762ea6906647f6159262d9815b79188f4ee8e07f6c',
  4356, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/recipe.json', '83bc8fc5350a242c65accbd935fafa490055318d3e494d2c4f36e61ea15a5585',
  2700, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/manifest.json', 'd79648290e94a241e49dd0024b87035314e2eacaecc4ca9ff75290d42b478b03',
  2678, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/ao.png', '6efdf01b4d3d599f61f3bd5d5747f9b2eadc142ae23985b83e33ba1239d4d593',
  144155, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/baseColor.png', '8ef0a548a65e0eceb7d340b5d644900962b255b9fbc400fd75c7c9c387eb40df',
  215360, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/heightMicro.png', '2476287ac5596ea2358c13a3cff7f5e1232cf710ad3b07020b4c2c98116382cc',
  342960, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/normalGL.png', '568f0d9a36b4eeacd7fad265fe78269851b0bae821889ad4ec0ee7988a183ed0',
  590097, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/orm.png', '019d823e03aa8008b047bf9ad8cb3c2600ca324a19bb2bbc3410f9536c079695',
  407754, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/roughness.png', 'e830a1a1edf18ffb93c4b3bb7f33ca53fa8964402a1281b28989bf97d3bed906',
  198603, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-boulder-river-worn', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-boulder-river-worn/smoothness.png', '5b35ccddef4e5bd2610798828d7c9d45350aada235f56a58a31663b6e1d36fed',
  198603, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/rock.glb', '6168f99f626636e0b0a6e54c0ef43821b15c5415c269d3c33d9efe8c064acb1a',
  47682708, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/thumbnail.png', '0a1fcc3fdf601b15bf19e9ad6e897adf2a4a3e7d7fca8f247911b2cb184237ef',
  235999, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/realistic-preview.png', 'd1771dfa98ed609a9f05d2703835dc8a7cb00a52e22f1bcced5aa205396e22e1',
  235636, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/material-config.json', '24a69004e1301382e09716b6bba766ac9f096941e0a1518dfda6d87882624e64',
  4216, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/recipe.json', 'e24cf05a81ebbb06b5c6804d093617cb389ed41d0f3268ed40aa156e2bf6f3a9',
  2651, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/manifest.json', 'f9ffee88101d09845f05c39d4dd2f433b129c6517361e0da9d26b538a8d8f092',
  2612, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/ao.png', '4e652419ec8c80a9ecf8a326d17ec150f7399556f3c245c0dfe10e4b1433ebeb',
  163530, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/baseColor.png', 'bf1d1bff16799e871a5903923050af308962d2cf71dfa43f7c38d3ca8479cfa2',
  297504, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/heightMicro.png', 'ca643334b0386bf1bbd8f006a16603cd556da0b8e836b17832d778342d45ae74',
  351623, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/normalGL.png', '1feec90f3a3ff3b5d4385b7b802c82a61cb29da76af12a134580423752511c00',
  814873, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/orm.png', '48441ed926337801ebc3e8f7679b5f06b6d085e2d3202d888f2913570864734f',
  422915, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/roughness.png', '329828e154bfcaade98f23d2e536631284f2688ceae3ba39975017b6a05b629a',
  189020, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-slab-bedded', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-slab-bedded/smoothness.png', '323f409e371ddd723107e4b3bc47ff3eba51bd9005edda6d1007ea3022e055e3',
  189021, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/rock.glb', '1d9eedeed50889c42acfa1239dc96a529e845149d812b4ec2ddca410ee35beca',
  45485216, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/thumbnail.png', '8e1a30b35093fa5c7358cffb50a2fec52e9e4fcf298c03d885cb8d3cd00127a0',
  204811, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/realistic-preview.png', 'b1abca1b6a579f97242cfc4d5f66c2548a95cc625b28d206107d215b59193dd1',
  206162, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/material-config.json', '75b4cb7e926bf5d6f0bf3b52f1f7d3e295a8435f0aaa38e39ea34e64f907ca47',
  4230, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/recipe.json', 'a24ca8845759d9ae51ed881d47d1b54f4750b7cb1cfaa725d5940ccf395fda54',
  2622, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/manifest.json', '26b3b8c2f3223e7dc5276d19e95e1786a03de07acc1980a8639a8f7fff31ad8f',
  2600, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/ao.png', '7f83fb960f7601047a3ecde309d036f62284c1041c55aeb021f2607001cfad4e',
  144399, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/baseColor.png', 'dc59e4aa6436d349a2b5b886059a4071f73b8fb95a9b296dca0ad673126b60da',
  177859, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/heightMicro.png', '50425954f4958b82e9c5a76501806955ba43d77c9ee89d23d9b3e6146466bff5',
  327580, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/normalGL.png', '8054b5d5a5677be6b615a04d1fb85807a63ef91625c38a6ff45ba5f5b434e360',
  605738, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/orm.png', '252d7a915027e26c9d317c63ce7c09fa7c7ac3115871694bb8a4aca40b76900a',
  391280, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/roughness.png', 'd8b0ca901319b6f6eb7e6bd320b2a897dfd68d86197782694fcaf83d59da994e',
  196793, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-jointed', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-jointed/smoothness.png', 'b847b84fa191940d84f4b71ab7c50adb154a0119262b63f4e6f856b40a73c68f',
  196794, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/rock.glb', '31b6d0d4aa34fca8371899850fa41c9a8153de4bfa44c11d7cde3f534299ee6e',
  46841828, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/thumbnail.png', '585423645f47454222f66e439801bbc99f239f0b2e144ad1035b353fba4249e1',
  235639, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/realistic-preview.png', 'a24da15f500ad04b864a5687707ad44800d5734889b1e5175b2c59574da3574d',
  235267, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/material-config.json', 'a05b214c2086c95114a7f84fc8e5bea0efadb67fc8a9817daf2a9569ab01539d',
  4297, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/recipe.json', '84e6dc91d1ff348e77eb80c0e5804e91692f451ba93d7653c1b7408c3f096a97',
  2699, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/manifest.json', '242953e55737d3d5cf3a6d05f6b2e24619992d17d8fa5975d47507bdebcdca9a',
  2673, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/ao.png', 'ee75e0c5d1e7e7409ad70a955b8538a16c5822e0f737883e9b547cc12561562b',
  157752, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/baseColor.png', '43f304ae94072151a863d97d63834abc62faa5b7d9c23f541ea4af45252b812d',
  306813, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/heightMicro.png', 'd007fb3609d5e0fdf3fe7d23368798048177c83b7d929a829cb30ba4ce5dc1f3',
  358946, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/normalGL.png', '3bd07aba217c7825a674d9e67e79a7329eb441a21b719dc80ae20268b58a5fa6',
  516416, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/orm.png', '8039e9b9ae92f57e2d248ad93109cee9b8e1dc90e28f7f189c1e722bf3b85efd',
  411593, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/roughness.png', 'b0d0eb5d95bbd87f5fc7225b9984bd91b3e4834d3e20d5e67a8a8b4da209f4ae',
  190476, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-outcrop-bedded', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-outcrop-bedded/smoothness.png', '2b8ccdc97b7ba6e67ffe3777d894b00db57b01b04992a8a3a1202ed4cf3af1b2',
  190479, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/rock.glb', '4cb26bdc9ab6ff2f76074d2881b4db594d1fabf2d7a972a970b75e936403635d',
  47700360, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/thumbnail.png', 'b30952cc3b57ad94f2a800fbb3251f327a4992efcd8042c3384f48fb8efbf3f6',
  213352, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/realistic-preview.png', 'd3e85c10ce0987598065138a59f79c55dd735c3ec958f3a2eb45b977e7fec87b',
  213236, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/material-config.json', '460734335babdee205960e49bfe2c7e45361ba775719f904ee06eb84b6e6690a',
  4326, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/recipe.json', '6034356aca01091d0bddc7f713254bbc69df8502679487b2a331a97b917de5b0',
  2702, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/manifest.json', '5da793282ea7b3072016bb96605673a55ace6e43e2eefb7a3a5726e930185cd0',
  2681, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/ao.png', '2243ee9471b8040e56bc2d50f730aeca5fcce8381a6bb5298cd85ea574010ca0',
  161807, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/baseColor.png', '362e28b10e23559abe5943204c6ab122dc69947908fd9d62a8243ca86738cc59',
  218185, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/heightMicro.png', '225808c517935ed7e8fd019ffb6bd7588587c5afbbb92e5b41f565e224c397fa',
  330629, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/normalGL.png', 'b08a7d92ec106a2aee5e07ace760c88c51486e642ff03dcc4a0b20fea87588c5',
  499107, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/orm.png', 'd416fc4f59ed6cc0bd3958aa16fa32308cdf84eb2dcca4b319db58d825802a20',
  410027, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/roughness.png', '1b704bacfb5c52cec20369b55fe0a158466c76a1c681f5df78c95ddd4b00e4bc',
  188838, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-ledge-resistant', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-ledge-resistant/smoothness.png', 'cbcf23e6f8b8c705deded97e4886038aaee0173b89529782816eaff3b493119e',
  188840, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/rock.glb', 'c9da410131c09ad74c6aff505b4fe3746c00cff66f8a45f51634e5f2098bb97d',
  45898188, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/thumbnail.png', 'c4ee528381b8b869f16724369a1befe42d3c48154dc8573312e6885255965875',
  208825, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/realistic-preview.png', 'ad1e2300059ce7ead35703a7634e94c8351c1aa8f1f92c310ea639fb57129365',
  208525, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/material-config.json', '7366249042a87e97f803ce6f030d935e10ba78b36de9ccb9f3009c737a50aaec',
  4336, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/recipe.json', '9eaf36ffcb28ee6480a9f3d31b058ee38da938b7e98711b22e8a4bd54ca294d2',
  2699, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/manifest.json', '4931cbee98d85a0dd6d60af71d7b03cb7eac7a08c2e21ed1db1995566a09dee5',
  2679, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/ao.png', '5c83f11e5660f5e1721cd11ddca554603dd9bc053346ef7f972cb50edac5bb14',
  167151, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/baseColor.png', 'df1e60ac575d60cf961748413edf90464264a3c9550cfb500f4943a975a4d093',
  256730, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/heightMicro.png', 'fff291bbfeaaf235f82f63f3fbf316c0932fcc709cc114c392a8fb8a2ab11002',
  338541, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/normalGL.png', 'f038b6dc3003f3210c132810b225dac710b2b6ede810a5ba9831e9fae830aa2a',
  701183, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/orm.png', 'b117d6bd5ab94fd455e594809e36aa185298509954f27622686f92ce250d7e6b',
  449948, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/roughness.png', 'ac71267e99d82b96cfa84eb4be0d05f504a88c8db94f2920e4ee23c5c6e19513',
  197765, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-pillar-residual', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-pillar-residual/smoothness.png', 'fc5ee4cbe731a3b72b9c798d6c2534e0afbbe55ff2b9ed192cf0591dfdf10a7b',
  197766, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/rock.glb', '3f65765c1c3fe58cbce306b9fc55b06bebd782282634d70bc81a9b87b1d6b322',
  47088744, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/thumbnail.png', '321b4fc1caa797cc559c40914ad8b3f4b1f3c29806d60e3bb45b69574771f5f5',
  212691, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/realistic-preview.png', '31b54181a2bce7584da5a48a9628e06624a38d6921bf771851568c804b83456c',
  212613, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/material-config.json', '33ce1c795108a5edb2ec9d10eda161eda89d045a5d52ac99a538d61c59eef4ab',
  4247, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/recipe.json', '582dcaa6087b37429394cbbc0411ba0e585402c1ca8097a88292d59300f29a21',
  2705, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/manifest.json', '0b1dc5d64419471128ad8cdd05eaad9ddff8ac6f7323311b896e40f4a9978242',
  2667, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/ao.png', '5862f1e8e201e66d8c1650d88feff6e231366694351487302a5197096325b65c',
  152584, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/baseColor.png', 'fae1c0cd1f5a0032d001acb97badbe0c1c73df0c34524501bfc2826d0fec5a50',
  228397, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/heightMicro.png', '231c5242c8e7aaf1a355122a93abd8c1b7173d0346e44b170dd10d747b4513de',
  361597, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/normalGL.png', '0a89577b80fa034074cbe3767414bb86b8c2c91e96cc6d4837187ba3d5abacef',
  1022424, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/orm.png', '39f6dadc7ed70eadd98850484fb3fb2b31f3469357489130f823ea8c77997a16',
  422044, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/roughness.png', 'aac10b11bd3b0bc30225dec64ad4768e7461848c1c329d4c8d866711a031843a',
  201473, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-sea-stack', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-sea-stack/smoothness.png', '03fd82d4108fa1ab133944e14eff9405c75436b267ddf63aea0e7cd977b66404',
  201474, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'rock.glb', 'primary',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/rock.glb', 'f743ea08ea87b0e86296c2db4de9359fb07cb63c54e148a7939b6f4c68a74d29',
  47429768, 'model/gltf-binary', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'thumbnail.png', 'thumbnail',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/thumbnail.png', '187963d28a642ad42809ef3cef9a31693b2e7df1439fe1bedf4bea46f18e0f5f',
  212765, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'realistic-preview.png', 'preview',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/realistic-preview.png', 'a704fa82b14f7fd308d40edb3efe17471913b683e2eb32231e06c27f438bfb48',
  212760, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'material-config.json', 'material',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/material-config.json', '048aa4198cc77eedecc999c41cb90d7bada7085cf461c1e193335a94da5f0eda',
  4243, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'recipe.json', 'recipe',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/recipe.json', '5c8fd47083f83cde879a544fbaec4876b43b16626b29afc026a8730d11edd9ab',
  2625, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'manifest.json', 'manifest',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/manifest.json', 'ab66826bb13ee960379434969fbc6cbb2621a1902cf57aafca472eaf09615b2c',
  2607, 'application/json', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'ao.png', 'ao',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/ao.png', 'f4aeab7d33ab45f5a648dee9bd7762132f14a9e47cbd6af6b9033ad586c08757',
  165079, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'baseColor.png', 'baseColor',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/baseColor.png', '961a178b82ac463cacff33908520a68ca08837615d537681a7290da75fc7f6ec',
  201353, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'heightMicro.png', 'heightMicro',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/heightMicro.png', 'cc3c522da398d6c40f89a473e5d38054ffad44a4b9eda6cecabaff671dd8513f',
  324788, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'normalGL.png', 'normalGL',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/normalGL.png', 'c8ef7e5921207d0a0a4b1c021039661258b6c30cb960166d5c7974e7555ead1a',
  476471, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'orm.png', 'orm',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/orm.png', '15eab558b95aa79c2a45d96cc7c8c142c734d219961e7b7e404f12b4620ef666',
  424142, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'roughness.png', 'roughness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/roughness.png', 'd7f483955ac25ab6dedd43b6f05cb4621594d9076234c19a819813450c2986e2',
  205127, 'image/png', null,
  '{}'::jsonb
),
(
  'rock-c8-volcanic-neck', 'smoothness.png', 'smoothness',
  'https://assets.toonlab.io/official/2026-08-c8-first12-v1/rock-c8-volcanic-neck/smoothness.png', 'd156e5fc6adf98a292ec9c4337c4189a71ab041d5555e0f23e84adebeed220cd',
  205128, 'image/png', null,
  '{}'::jsonb
)
on conflict (asset_id, relative_path) do update set
  kind = excluded.kind,
  download_url = excluded.download_url,
  sha256 = excluded.sha256,
  byte_size = excluded.byte_size,
  content_type = excluded.content_type,
  notice = excluded.notice,
  compatibility = excluded.compatibility;

