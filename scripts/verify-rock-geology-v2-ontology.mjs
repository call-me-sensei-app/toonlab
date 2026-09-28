import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot = path.join(repoRoot, 'src/rockgen/experimental/geology-v2')
const ontology = readJson(path.join(dataRoot, 'ontology.v1.json'))
const compatibility = readJson(path.join(dataRoot, 'compatibility.v1.json'))
const sourceRegister = readJson(path.join(dataRoot, 'source-register.v1.json'))
const referenceIndex = readJson(path.join(dataRoot, 'reference-index.v1.json'))

const failures = []
const checks = []

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function check(id, condition, details = {}) {
  const passed = Boolean(condition)
  checks.push({ id, passed, ...details })
  if (!passed) failures.push({ id, ...details })
}

function duplicateIds(items, value = (item) => item.id) {
  const seen = new Set()
  const duplicates = new Set()
  for (const item of items) {
    const id = value(item)
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates]
}

function idSet(items) {
  return new Set(items.map((item) => (typeof item === 'string' ? item : item.id)))
}

const collections = {
  lithology: ontology.lithologies,
  fabric: ontology.fabrics,
  process: ontology.processes,
  environment: ontology.environments,
  landform: ontology.landforms,
  scale: ontology.scales,
}
const ids = Object.fromEntries(
  Object.entries(collections).map(([key, items]) => [key, idSet(items)]),
)
const lithologyById = new Map(ontology.lithologies.map((item) => [item.id, item]))
const landformById = new Map(ontology.landforms.map((item) => [item.id, item]))
const sourceIds = idSet(sourceRegister.sources)

check('schema.ontology', ontology.schema === 'toonlab/rock-geology-ontology')
check('schema.compatibility', compatibility.schema === 'toonlab/rock-geology-compatibility')
check('schema.sources', sourceRegister.schema === 'toonlab/rock-geology-source-register')
check('schema.references', referenceIndex.schema === 'toonlab/rock-geology-reference-index')
check('source-policy.no-copied-code', sourceRegister.policy.copiedCodeAllowed === false)
check('source-policy.no-external-assets', sourceRegister.policy.externalAssetsBundled === false)
check('reference-policy.no-external-media', referenceIndex.policy.externalMediaBundled === false)
check('reference-policy.no-fab-downloads', referenceIndex.policy.fabAssetsDownloaded === false)

for (const [name, items] of Object.entries(collections)) {
  const duplicates = duplicateIds(items, (item) => (typeof item === 'string' ? item : item.id))
  check(`ontology.${name}.unique`, duplicates.length === 0, { duplicates })
  check(`ontology.${name}.nonempty`, items.length > 0, { count: items.length })
}

for (const source of sourceRegister.sources) {
  check(`source.${source.id}.identity`, Boolean(source.url && source.revision && source.license))
  check(`source.${source.id}.decision`, Boolean(source.licenseStatus && source.use && source.adapt?.length && source.reject?.length))
  check(`source.${source.id}.no-copy`, source.codeCopied === false)
}

const referenceIds = idSet(referenceIndex.references)
check('reference.unique', duplicateIds(referenceIndex.references).length === 0)
for (const reference of referenceIndex.references) {
  check(`reference.${reference.id}.locator`, Boolean(reference.url || reference.path))
  check(`reference.${reference.id}.rights`, Boolean(reference.rightsStatus && reference.use))
}
for (const basis of referenceIndex.basisCoverage) {
  check(`reference-basis.${basis.basis}.nonempty`, basis.referenceIds.length > 0)
  check(`reference-basis.${basis.basis}.resolved`, basis.referenceIds.every((reference) => referenceIds.has(reference)), { references: basis.referenceIds })
}
check('reference-basis.required-count', referenceIndex.basisCoverage.length >= 9, { count: referenceIndex.basisCoverage.length })

for (const rockClass of ontology.classes) {
  const classMembers = ontology.lithologies.filter((item) => item.class === rockClass.id)
  check(`class.${rockClass.id}.covered`, classMembers.length > 0, { count: classMembers.length })
  check(`class.${rockClass.id}.dimensions`, rockClass.requiredRecipeFields.includes('targetDimensionsMetres'))
}

const heroIds = []
for (const lithology of ontology.lithologies) {
  const hero = lithology.hero
  heroIds.push(hero?.id)
  check(`lithology.${lithology.id}.signature`, Boolean(lithology.signature?.trim()))
  check(`lithology.${lithology.id}.hero`, Boolean(hero?.id && hero.fabrics?.length && hero.processes?.length))
  check(`lithology.${lithology.id}.hero-environment`, ids.environment.has(hero?.environment), { value: hero?.environment })
  check(`lithology.${lithology.id}.hero-landform`, ids.landform.has(hero?.landform), { value: hero?.landform })
  check(`lithology.${lithology.id}.hero-scale`, ids.scale.has(hero?.scale), { value: hero?.scale })
  check(`lithology.${lithology.id}.hero-host`, !hero?.hostLithology || ids.lithology.has(hero.hostLithology), { value: hero?.hostLithology })
  for (const fabric of hero?.fabrics ?? []) {
    check(`lithology.${lithology.id}.hero-fabric.${fabric}`, ids.fabric.has(fabric))
  }
  for (const process of hero?.processes ?? []) {
    check(`lithology.${lithology.id}.hero-process.${process}`, ids.process.has(process))
  }
}
check('ontology.hero.unique', duplicateIds(heroIds, (item) => item).length === 0)

check('scale.authoritative-dimensions', ontology.scaleContract.authoritativeInput === 'targetDimensionsMetres')
check('scale.provisional-envelope', ontology.scaleContract.qualificationStatus === 'provisional-pending-scale-matrix')
check('scale.editor-rebuild', ontology.scaleContract.toonLabEditor?.commitBehavior === 'debounced-regenerate-and-rebake')
check('scale.external-static', ontology.scaleContract.externalScene?.automaticRebake === false)

function matchesSelector(lithology, selector) {
  if (selector.any === true) return true
  if (selector.classes && !selector.classes.includes(lithology.class)) return false
  if (selector.lithologies && !selector.lithologies.includes(lithology.id)) return false
  if (selector.tagsAny && !selector.tagsAny.some((tag) => lithology.tags.includes(tag))) return false
  return Boolean(selector.classes || selector.lithologies || selector.tagsAny)
}

function profileIndex(profiles, universe, axis) {
  const memberToProfile = new Map()
  const duplicateMembers = []
  for (const profile of profiles) {
    for (const member of profile.members) {
      if (memberToProfile.has(member)) duplicateMembers.push(member)
      memberToProfile.set(member, profile)
    }
  }
  const missing = [...universe].filter((member) => !memberToProfile.has(member))
  const unknown = [...memberToProfile.keys()].filter((member) => !universe.has(member))
  check(`matrix.${axis}.profile-coverage`, missing.length === 0 && unknown.length === 0 && duplicateMembers.length === 0, {
    missing,
    unknown,
    duplicateMembers,
  })
  return memberToProfile
}

const fabricProfiles = profileIndex(compatibility.profiles.fabric, ids.fabric, 'fabric')
const processProfiles = profileIndex(compatibility.profiles.process, ids.process, 'process')
const landformProfiles = profileIndex(compatibility.profiles.landform, ids.landform, 'landform')

function classifyLithologyPair(lithologyId, memberId, index) {
  const lithology = lithologyById.get(lithologyId)
  const profile = index.get(memberId)
  if (!lithology || !profile) return 'invalid'
  if (profile.validWhen?.some((selector) => matchesSelector(lithology, selector))) return 'valid'
  if (profile.uncommonWhen?.some((selector) => matchesSelector(lithology, selector))) return 'valid-but-uncommon'
  return 'invalid'
}

const environmentLandformIndex = profileIndex(
  compatibility.environmentLandformProfiles,
  ids.landform,
  'environment-landform',
)

function classifyEnvironmentLandform(environment, landform) {
  const profile = environmentLandformIndex.get(landform)
  if (!profile || !ids.environment.has(environment)) return 'invalid'
  if (profile.validEnvironments.includes(environment)) return 'valid'
  if (profile.uncommonEnvironments?.includes(environment)) return 'valid-but-uncommon'
  return 'invalid'
}

const landformScalePairs = new Set()
for (const profile of compatibility.landformScaleProfiles) {
  check(`matrix.landform-scale.profile.${profile.id}.scale`, ids.scale.has(profile.scale), { value: profile.scale })
  for (const landform of profile.members) {
    check(`matrix.landform-scale.profile.${profile.id}.${landform}`, ids.landform.has(landform))
    landformScalePairs.add(`${landform}:${profile.scale}`)
  }
}
for (const landform of ids.landform) {
  check(`matrix.landform-scale.${landform}.covered`, ontology.scales.some((scale) => landformScalePairs.has(`${landform}:${scale.id}`)))
}

for (const lithology of ontology.lithologies) {
  for (const fabric of lithology.hero.fabrics) {
    const status = classifyLithologyPair(lithology.id, fabric, fabricProfiles)
    check(`hero-matrix.${lithology.id}.fabric.${fabric}`, status !== 'invalid', { status })
  }
  for (const process of lithology.hero.processes) {
    const status = classifyLithologyPair(lithology.id, process, processProfiles)
    check(`hero-matrix.${lithology.id}.process.${process}`, status !== 'invalid', { status })
  }
  const landformStatus = classifyLithologyPair(lithology.id, lithology.hero.landform, landformProfiles)
  check(`hero-matrix.${lithology.id}.landform.${lithology.hero.landform}`, landformStatus !== 'invalid', { status: landformStatus })
  const environmentStatus = classifyEnvironmentLandform(lithology.hero.environment, lithology.hero.landform)
  check(`hero-matrix.${lithology.id}.environment-landform`, environmentStatus !== 'invalid', { status: environmentStatus })
  check(
    `hero-matrix.${lithology.id}.landform-scale`,
    landformScalePairs.has(`${lithology.hero.landform}:${lithology.hero.scale}`),
    { landform: lithology.hero.landform, scale: lithology.hero.scale },
  )
}

const bedding = new Set(['laminated', 'thin-bedding', 'medium-bedding', 'thick-bedding', 'cross-bedding', 'graded-bedding', 'folded-bedding'])
const metamorphicFabrics = new Set(['slaty-cleavage', 'phyllitic-foliation', 'schistosity', 'crenulation', 'gneissic-banding', 'migmatitic-banding', 'folded-foliation', 'lineation', 'boudinage', 'shear-foliation', 'mylonitic-foliation'])
const jointFabrics = new Set(['orthogonal-joints', 'polyhedral-joints', 'tabular-joints', 'cooling-columns', 'entablature'])
const detachedLandforms = new Set(ontology.landforms.filter((item) => item.tags.includes('detached')).map((item) => item.id))
const stabilityLandforms = new Set(['overhang', 'cave-mouth', 'arch', 'natural-bridge'])
const scaleEnvelope = ontology.scaleContract.uniformRuntimeScaleEnvelope
const maximumAxisRatio = ontology.scaleContract.maximumRuntimeAxisRatio

function hasAny(values = [], candidates) {
  return values.some((value) => candidates.has(value))
}

function runtimeScaleIsQualified(recipe) {
  const values = recipe.runtimeScale
  if (!Array.isArray(values) || values.length !== 3 || values.some((value) => !Number.isFinite(value) || value <= 0)) return false
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  return minimum >= scaleEnvelope[0] && maximum <= scaleEnvelope[1] && maximum / minimum <= maximumAxisRatio
}

const evaluators = {
  beddingRequiresDepositedUnit(recipe) {
    if (!hasAny(recipe.fabrics, bedding)) return true
    const lithology = lithologyById.get(recipe.lithology)
    return lithology?.class === 'sedimentary' || ['tuff', 'ignimbrite', 'volcanic-breccia'].includes(recipe.lithology)
  },
  coolingColumnsRequireCoolingBody(recipe) {
    if (!hasAny(recipe.fabrics, new Set(['cooling-columns', 'entablature']))) return true
    return lithologyById.get(recipe.lithology)?.tags.includes('cooling-joint-capable') && Boolean(recipe.coolingBoundary)
  },
  metamorphicFabricRequiresMetamorphism(recipe) {
    if (!hasAny(recipe.fabrics, metamorphicFabrics)) return true
    return lithologyById.get(recipe.lithology)?.class === 'metamorphic'
  },
  crossCuttingNeedsChronology(recipe) {
    if (!(hasAny(recipe.fabrics, bedding) && hasAny(recipe.fabrics, jointFabrics))) return true
    const deposition = recipe.chronology?.indexOf('deposition') ?? -1
    const jointing = recipe.chronology?.indexOf('jointing') ?? -1
    return deposition >= 0 && jointing > deposition
  },
  karstRequiresSolubilityWaterExposureTime(recipe) {
    if (!recipe.processes?.includes('karst-dissolution') && !['karst-spire', 'cave-mouth'].includes(recipe.landform)) return true
    const tags = lithologyById.get(recipe.lithology)?.tags ?? []
    return tags.includes('soluble-carbonate') && recipe.waterRouting === true && recipe.exposureYears > 0
  },
  tafoniNeedsMaterialClimateExposure(recipe) {
    if (!recipe.processes?.includes('salt-weathering')) return true
    return recipe.porosity >= 0.05 && recipe.saltExposure > 0 && recipe.exposureYears >= 100
  },
  transportRoundingRequiresDetachment(recipe) {
    if (!recipe.processes?.includes('transport-rounding')) return true
    return recipe.detached === true && detachedLandforms.has(recipe.landform) && recipe.transportDistanceMetres > 0
  },
  talusInheritsSource(recipe) {
    if (!['talus-fan', 'scree'].includes(recipe.landform)) return true
    return Boolean(recipe.sourceFormationId) && recipe.sourceLithology === recipe.lithology
  },
  seaStackRequiresCoastalHistory(recipe) {
    if (recipe.landform !== 'sea-stack') return true
    return recipe.environment === 'coastal' && recipe.processes?.includes('marine-abrasion') && Boolean(recipe.parentCoastId && recipe.collapseStage)
  },
  overhangRequiresStability(recipe) {
    if (!stabilityLandforms.has(recipe.landform)) return true
    return recipe.stability?.passed === true && Boolean(recipe.stability.mode)
  },
  runtimeScaleOutsideEnvelopeRebuilds(recipe) {
    if (recipe.scaleAction !== 'transform') return true
    return runtimeScaleIsQualified(recipe)
  },
  outOfEnvelopeDimensionRequestRebakes(recipe) {
    if (recipe.scaleAction === 'recompile-and-rebake') return true
    return runtimeScaleIsQualified(recipe)
  },
}

const contextualResults = []
for (const rule of compatibility.contextualRules) {
  const evaluator = evaluators[rule.evaluator]
  check(`rule.${rule.id}.sources`, rule.sources?.length > 0 && rule.sources.every((source) => sourceIds.has(source)), { sources: rule.sources })
  check(`rule.${rule.id}.claim-strength`, ['empirical-constraint', 'approximated-process', 'technical-contract', 'artistic'].includes(rule.claimStrength), { value: rule.claimStrength })
  check(`rule.${rule.id}.evaluator`, typeof evaluator === 'function', { value: rule.evaluator })
  check(`rule.${rule.id}.fixtures`, rule.accept?.length > 0 && rule.reject?.length > 0, { accept: rule.accept?.length ?? 0, reject: rule.reject?.length ?? 0 })
  if (!evaluator) continue
  const accepted = rule.accept.map((fixture) => ({ name: fixture.name, passed: evaluator(fixture.recipe) === true }))
  const rejected = rule.reject.map((fixture) => ({ name: fixture.name, passed: evaluator(fixture.recipe) === false }))
  for (const fixture of accepted) check(`rule.${rule.id}.accept.${fixture.name}`, fixture.passed)
  for (const fixture of rejected) check(`rule.${rule.id}.reject.${fixture.name}`, fixture.passed)
  contextualResults.push({ id: rule.id, claimStrength: rule.claimStrength, accepted, rejected })
}

function matrixCounts(rowIds, columnIds, classify) {
  const counts = { valid: 0, 'valid-but-uncommon': 0, invalid: 0 }
  for (const row of rowIds) {
    for (const column of columnIds) counts[classify(row, column)] += 1
  }
  return { cells: rowIds.length * columnIds.length, counts }
}

const matrixSummary = {
  lithologyFabric: matrixCounts([...ids.lithology], [...ids.fabric], (a, b) => classifyLithologyPair(a, b, fabricProfiles)),
  lithologyProcess: matrixCounts([...ids.lithology], [...ids.process], (a, b) => classifyLithologyPair(a, b, processProfiles)),
  lithologyLandform: matrixCounts([...ids.lithology], [...ids.landform], (a, b) => classifyLithologyPair(a, b, landformProfiles)),
  environmentLandform: matrixCounts([...ids.environment], [...ids.landform], classifyEnvironmentLandform),
  landformScale: matrixCounts([...ids.landform], [...ids.scale], (landform, scale) => landformScalePairs.has(`${landform}:${scale}`) ? 'valid' : 'invalid'),
}

const result = {
  schema: 'toonlab/rock-geology-v2-ontology-verification',
  version: 1,
  passed: failures.length === 0,
  counts: {
    sources: sourceRegister.sources.length,
    references: referenceIndex.references.length,
    referenceBasisSets: referenceIndex.basisCoverage.length,
    lithologies: ontology.lithologies.length,
    fabrics: ontology.fabrics.length,
    processes: ontology.processes.length,
    environments: ontology.environments.length,
    landforms: ontology.landforms.length,
    scales: ontology.scales.length,
    heroRecipes: heroIds.length,
    contextualRules: compatibility.contextualRules.length,
    fixtures: compatibility.contextualRules.reduce((sum, rule) => sum + rule.accept.length + rule.reject.length, 0),
    checks: checks.length,
    failures: failures.length,
  },
  classCounts: Object.fromEntries(ontology.classes.map((rockClass) => [rockClass.id, ontology.lithologies.filter((item) => item.class === rockClass.id).length])),
  scaleContract: ontology.scaleContract,
  matrixSummary,
  contextualResults,
  failures,
  checks,
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function renderFabricHeatmap() {
  const rows = ontology.lithologies
  const columns = ontology.fabrics
  const cell = 13
  const left = 178
  const top = 210
  const width = left + columns.length * cell + 36
  const height = top + rows.length * cell + 80
  const colors = { valid: '#37b26c', 'valid-but-uncommon': '#e6b94a', invalid: '#253149' }
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, '<rect width="100%" height="100%" fill="#101726"/>', '<style>text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;fill:#e9eef8}.label{font-size:9px}.title{font-size:19px;font-weight:700}.sub{font-size:11px;fill:#aebbd0}</style>', '<text class="title" x="18" y="28">Geology v2 lithology × fabric compatibility</text>', '<text class="sub" x="18" y="49">65 lithologies × 55 fabrics; strict unmatched default = invalid</text>']
  const legend = [['valid', 18], ['valid-but-uncommon', 112], ['invalid', 278]]
  for (const [status, x] of legend) {
    parts.push(`<rect x="${x}" y="65" width="12" height="12" fill="${colors[status]}"/><text class="sub" x="${x + 18}" y="75">${status}</text>`)
  }
  columns.forEach((column, index) => {
    const x = left + index * cell + 9
    parts.push(`<text class="label" transform="translate(${x} ${top - 8}) rotate(-62)" text-anchor="start">${escapeXml(column.id)}</text>`)
  })
  rows.forEach((row, rowIndex) => {
    const y = top + rowIndex * cell
    parts.push(`<text class="label" x="${left - 7}" y="${y + 10}" text-anchor="end">${escapeXml(row.id)}</text>`)
    columns.forEach((column, columnIndex) => {
      const status = classifyLithologyPair(row.id, column.id, fabricProfiles)
      parts.push(`<rect x="${left + columnIndex * cell}" y="${y}" width="11" height="11" rx="1" fill="${colors[status]}"/>`)
    })
  })
  parts.push('</svg>')
  return parts.join('')
}

const outputFlag = process.argv.indexOf('--output-dir')
if (outputFlag >= 0) {
  const outputDir = path.resolve(process.cwd(), process.argv[outputFlag + 1])
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'ontology-verification.json'), `${JSON.stringify(result, null, 2)}\n`)
  fs.writeFileSync(path.join(outputDir, 'compatibility-heatmap.svg'), `${renderFabricHeatmap()}\n`)
}

console.log(JSON.stringify({ passed: result.passed, counts: result.counts, classCounts: result.classCounts, matrixSummary: result.matrixSummary, failures }, null, 2))
if (!result.passed) process.exitCode = 1
