export const APPROVED_CATALOG_SPDX_LICENSES = Object.freeze([
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'MIT',
]);

// Custom terms are deny-by-default. Every shipped entry needs a checked-in,
// authoritative approval URL and explicit redistribution scopes.
export const REVIEWED_CATALOG_LICENSES = Object.freeze({
  'LicenseRef-PLATEAU-PDL-1.0': Object.freeze({
    approvalEvidence: 'https://www.mlit.go.jp/plateau/site-policy/',
    approved: true,
    canonicalUrl: 'https://www.mlit.go.jp/plateau/site-policy/',
    extractedFileRedistribution: true,
    id: 'LicenseRef-PLATEAU-PDL-1.0',
    originalArchiveRedistribution: true,
    spdx: false,
    status: 'approved',
  }),
});

/**
 * Classification for a license field that carries no value.
 *
 * First-party ToonLab catalog records ship `license: null` — there is no
 * third-party grant to record because the asset is owned. That is a different
 * situation from a third-party asset whose license is unknown, and collapsing
 * the two produced a misleading failure: every first-party rock record hit
 * "(missing license) is not in the reviewed-license registry", which reads as
 * an unreviewed third-party license rather than an absent field.
 *
 * Absence is still never an approval. It is reported as its own state so a
 * caller can decide, and so the error text points at the real problem.
 */
export const CATALOG_LICENSE_UNSPECIFIED = 'unspecified';

export function resolveCatalogLicense(id) {
  const licenseId = String(id ?? '').trim();
  if (APPROVED_CATALOG_SPDX_LICENSES.includes(licenseId)) {
    return {
      approved: true,
      extractedFileRedistribution: true,
      id: licenseId,
      originalArchiveRedistribution: true,
      spdx: true,
      status: 'approved',
    };
  }
  return REVIEWED_CATALOG_LICENSES[licenseId] ?? null;
}

/**
 * Classifies a license id without throwing, so callers can branch on the
 * outcome instead of using exceptions for control flow.
 *
 * `not-approved` is a distinct state from `unrecognized`: the registry exists to
 * hold rejected policies too (see the `!policy.approved` branch below), so
 * collapsing "reviewed and refused" into "approved" would let a caller that
 * branches on the state ship an asset the review explicitly rejected.
 *
 * @returns {{state: 'approved'|'not-approved'|'unspecified'|'unrecognized', id: string|null, policy: object|null}}
 */
export function describeCatalogLicense(id) {
  const licenseId = String(id ?? '').trim();
  if (!licenseId) {
    return { id: null, policy: null, state: CATALOG_LICENSE_UNSPECIFIED };
  }
  const policy = resolveCatalogLicense(licenseId);
  if (!policy) return { id: licenseId, policy: null, state: 'unrecognized' };
  return {
    id: licenseId,
    policy,
    state: policy.approved ? 'approved' : 'not-approved',
  };
}

export function assertCatalogLicenseRelease({ id, redistributionScope, evidence } = {}) {
  const described = describeCatalogLicense(id);
  if (described.state === CATALOG_LICENSE_UNSPECIFIED) {
    throw new Error(
      'catalog license is unspecified: the record carries no license value. '
      + 'First-party assets still need an explicit license id before release — '
      + 'absence is not an approval.',
    );
  }
  const policy = described.policy;
  if (!policy) throw new Error(`${id} is not in the reviewed-license registry`);
  if (!policy.approved) throw new Error(`${id}: reviewed-license policy is ${policy.status ?? 'not approved'}`);
  if (redistributionScope !== 'external-only' && !policy.originalArchiveRedistribution) {
    throw new Error(`${id}: original-archive redistribution is not approved`);
  }
  if (redistributionScope === 'archive-and-files' && !policy.extractedFileRedistribution) {
    throw new Error(`${id}: extracted-file redistribution is not approved`);
  }
  if (!policy.spdx && !(evidence ?? policy.approvalEvidence)) {
    throw new Error(`${id}: custom licenses require checked-in approval evidence`);
  }
  return policy;
}
