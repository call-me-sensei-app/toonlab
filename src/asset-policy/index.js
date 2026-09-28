export const ASSET_SOURCING_POLICY_DOCUMENT_TYPE = 'toonlab/asset-sourcing-policy';
export * from './catalogLicenses.js';
export const ASSET_SOURCING_POLICY_SCHEMA_VERSION = 1;
export const ASSET_GAP_DOCUMENT_TYPE = 'toonlab/asset-gap';
export const ASSET_GAP_SCHEMA_VERSION = 1;

export const ASSET_POLICY_MODES = Object.freeze([
  'strict',
  'advisory',
  'open',
]);

export const ASSET_SOURCE_CLASSES = Object.freeze([
  'project-library',
  'toonlab-library',
  'toonlab-gallery',
  'external-cc0',
  'procedural',
  'custom',
]);

export const DEFAULT_ASSET_SOURCE_ORDER = Object.freeze([
  'project-library',
  'toonlab-library',
  'toonlab-gallery',
  'procedural',
  'external-cc0',
  'custom',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values, allowed = null) {
  if (!Array.isArray(values)) return [];
  const result = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized || result.includes(normalized)) continue;
    if (allowed && !allowed.includes(normalized)) continue;
    result.push(normalized);
  }
  return result;
}

function cloneRule(rule = {}) {
  const preferredSources = uniqueStrings(
    rule.preferredSources,
    ASSET_SOURCE_CLASSES,
  );
  const allowedSources = uniqueStrings(
    rule.allowedSources,
    ASSET_SOURCE_CLASSES,
  );
  return {
    allowedSources,
    preferredSources: preferredSources.length
      ? preferredSources
      : [...allowedSources],
  };
}

export function validateAssetSourcingPolicy(input) {
  const errors = [];
  let document = input;
  if (typeof input === 'string') {
    try {
      document = JSON.parse(input);
    } catch {
      return { errors: ['Asset-sourcing policy is not valid JSON.'], ok: false };
    }
  }
  if (!isPlainObject(document)) {
    return { errors: ['Asset-sourcing policy must be an object.'], ok: false };
  }
  if (document.schema !== ASSET_SOURCING_POLICY_DOCUMENT_TYPE) {
    errors.push(`Expected schema "${ASSET_SOURCING_POLICY_DOCUMENT_TYPE}".`);
  }
  if (document.version !== ASSET_SOURCING_POLICY_SCHEMA_VERSION) {
    errors.push(`Unsupported asset-sourcing policy version ${document.version}.`);
  }
  const mode = String(document.mode ?? '').trim();
  if (!ASSET_POLICY_MODES.includes(mode)) {
    errors.push(`Asset-sourcing policy mode must be one of ${ASSET_POLICY_MODES.join(', ')}.`);
  }
  const rulesInput = isPlainObject(document.rules) ? document.rules : {};
  const rules = {};
  for (const [domain, rule] of Object.entries(rulesInput)) {
    if (!String(domain).trim() || !isPlainObject(rule)) {
      errors.push(`Asset-sourcing rule "${domain}" must be an object.`);
      continue;
    }
    const normalized = cloneRule(rule);
    if (mode === 'strict' && normalized.allowedSources.length === 0) {
      errors.push(`Strict asset-sourcing rule "${domain}" needs allowedSources.`);
    }
    rules[String(domain).trim()] = normalized;
  }
  if (errors.length) return { errors, ok: false };
  return {
    ok: true,
    value: {
      description: String(document.description ?? ''),
      id: String(document.id ?? 'asset-sourcing-policy').trim() || 'asset-sourcing-policy',
      mode,
      rules,
      schema: ASSET_SOURCING_POLICY_DOCUMENT_TYPE,
      version: ASSET_SOURCING_POLICY_SCHEMA_VERSION,
    },
  };
}

export function createAssetSourcingPolicy(id, {
  description = '',
  mode = 'advisory',
  rules = {},
} = {}) {
  const result = validateAssetSourcingPolicy({
    description,
    id,
    mode,
    rules,
    schema: ASSET_SOURCING_POLICY_DOCUMENT_TYPE,
    version: ASSET_SOURCING_POLICY_SCHEMA_VERSION,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

function resolveRule(policy, domain) {
  return policy.rules[domain] ?? policy.rules['*'] ?? null;
}

/**
 * Evaluate a discovered candidate without hiding disallowed results. Import
 * and generation tools use `allowed` as the authoritative gate.
 */
export function evaluateAssetCandidate(policyInput, candidate = {}) {
  const sourceClass = String(candidate.sourceClass ?? '').trim();
  const domain = String(candidate.domain ?? '').trim();
  if (!ASSET_SOURCE_CLASSES.includes(sourceClass)) {
    return {
      allowed: false,
      decision: 'deny',
      needsDeveloperDecision: !policyInput,
      reason: `Unknown asset source class "${sourceClass || '(missing)'}".`,
    };
  }
  if (!policyInput) {
    return {
      allowed: true,
      decision: 'warn',
      needsDeveloperDecision: true,
      reason: 'No asset-sourcing policy is declared; ask the developer and use library-first advisory discovery.',
      sourceRank: DEFAULT_ASSET_SOURCE_ORDER.indexOf(sourceClass),
    };
  }
  const validated = validateAssetSourcingPolicy(policyInput);
  if (!validated.ok) {
    return {
      allowed: false,
      decision: 'deny',
      needsDeveloperDecision: true,
      reason: validated.errors.join(' '),
    };
  }
  const policy = validated.value;
  const rule = resolveRule(policy, domain);
  if (policy.mode === 'open') {
    return {
      allowed: true,
      decision: 'allow',
      needsDeveloperDecision: false,
      reason: 'Open policy permits every registered source class.',
    };
  }
  if (!rule) {
    return policy.mode === 'strict'
      ? {
        allowed: false,
        decision: 'deny',
        needsDeveloperDecision: true,
        reason: `Strict policy has no rule for asset domain "${domain || '(missing)'}".`,
      }
      : {
        allowed: true,
        decision: 'warn',
        needsDeveloperDecision: true,
        reason: `Advisory policy has no rule for asset domain "${domain || '(missing)'}".`,
      };
  }
  if (policy.mode === 'strict') {
    const allowed = rule.allowedSources.includes(sourceClass);
    return {
      allowed,
      decision: allowed ? 'allow' : 'deny',
      needsDeveloperDecision: !allowed,
      reason: allowed
        ? `Source class "${sourceClass}" is allowed for "${domain}".`
        : `Strict policy forbids source class "${sourceClass}" for "${domain}".`,
    };
  }
  const preferred = rule.preferredSources.includes(sourceClass);
  return {
    allowed: true,
    decision: preferred ? 'allow' : 'warn',
    needsDeveloperDecision: false,
    reason: preferred
      ? `Source class "${sourceClass}" is preferred for "${domain}".`
      : `Source class "${sourceClass}" is permitted but not preferred for "${domain}".`,
  };
}

export const CALL_ME_SENSEI_STRICT_ASSET_POLICY = Object.freeze(
  createAssetSourcingPolicy('call-me-sensei-strict', {
    description: 'Strict acceptance fixture: rocks must come from an approved library or ToonLab gallery; the supported ToonLab BranchTree generator is allowed for trees.',
    mode: 'strict',
    rules: {
      'natural.rock': {
        allowedSources: ['project-library', 'toonlab-library', 'toonlab-gallery'],
      },
      'vegetation.tree': {
        allowedSources: ['project-library', 'toonlab-library', 'toonlab-gallery', 'procedural'],
      },
    },
  }),
);

export function createAssetGapRecord({
  approvedBy = null,
  attempts = [],
  bundleSlot = null,
  customImplementation = null,
  domain,
  feedbackNeeded = '',
  id,
  kind,
  provenance = null,
  reason,
  status = 'open',
  targetId = null,
} = {}) {
  const normalizedId = String(id ?? '').trim();
  const normalizedDomain = String(domain ?? '').trim();
  const normalizedKind = String(kind ?? '').trim();
  const normalizedReason = String(reason ?? '').trim();
  if (!normalizedId || !normalizedDomain || !normalizedKind || !normalizedReason) {
    throw new Error('Asset gap needs id, domain, kind, and reason.');
  }
  return {
    approvedBy: approvedBy == null ? null : String(approvedBy),
    attempts: Array.isArray(attempts) ? attempts.map((attempt) => ({ ...attempt })) : [],
    bundleSlot: bundleSlot == null ? null : String(bundleSlot),
    customImplementation: isPlainObject(customImplementation)
      ? { ...customImplementation }
      : customImplementation,
    domain: normalizedDomain,
    feedbackNeeded: String(feedbackNeeded ?? ''),
    id: normalizedId,
    kind: normalizedKind,
    provenance: isPlainObject(provenance) ? { ...provenance } : provenance,
    reason: normalizedReason,
    schema: ASSET_GAP_DOCUMENT_TYPE,
    status: String(status ?? 'open'),
    targetId: targetId == null ? null : String(targetId),
    version: ASSET_GAP_SCHEMA_VERSION,
  };
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

export function renderAssetGapReport(recordsInput, {
  title = 'ToonLab Asset and Shader Gaps',
} = {}) {
  const records = (Array.isArray(recordsInput) ? recordsInput : [recordsInput])
    .filter(Boolean);
  const lines = [
    `# ${title}`,
    '',
    'Custom work is listed because the approved library, gallery, or permitted generation routes were insufficient.',
    '',
    '| ID | Domain | Kind | Reason | Status | Feedback needed |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const record of records) {
    lines.push(`| ${[
      record.id,
      record.domain,
      record.kind,
      record.reason,
      record.status,
      record.feedbackNeeded,
    ].map(markdownCell).join(' | ')} |`);
  }
  if (records.length === 0) {
    lines.push('| None | — | — | No custom gaps recorded. | closed | — |');
  }
  for (const record of records) {
    lines.push('', `## ${record.id}`, '');
    lines.push(`- Target: ${record.targetId ?? 'not specified'}`);
    lines.push(`- Bundle slot: ${record.bundleSlot ?? 'not specified'}`);
    lines.push(`- Approved by: ${record.approvedBy ?? 'pending'}`);
    lines.push(`- Discovery attempts: ${record.attempts?.length ?? 0}`);
    if (record.provenance) {
      lines.push(`- Provenance: \`${JSON.stringify(record.provenance)}\``);
    }
    if (record.customImplementation) {
      lines.push(`- Custom implementation: \`${JSON.stringify(record.customImplementation)}\``);
    }
  }
  return `${lines.join('\n')}\n`;
}
