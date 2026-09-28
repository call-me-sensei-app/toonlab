// First-party style identities are repository-owned invariants. Authoring
// tools may create editable copies, but must never shadow or delete these ids.
// A downstream OSS fork can deliberately change this policy in its own source;
// the canonical ToonLab repository keeps it enforced and verified.

export const CALL_ME_SENSEI_SYSTEM_STYLE_ID = 'call_me_sensei';

const PROTECTED_SYSTEM_STYLE_IDS = new Set([
  CALL_ME_SENSEI_SYSTEM_STYLE_ID,
  'call_me_sensei_clump',
]);

function canonicalId(value) {
  return String(value ?? '').trim().toLowerCase().replaceAll('-', '_');
}

export function isProtectedSystemStyleId(value) {
  return PROTECTED_SYSTEM_STYLE_IDS.has(canonicalId(value));
}

export function assertUserStyleId(value) {
  if (isProtectedSystemStyleId(value)) {
    throw new Error(
      'Call Me Sensei is a protected system style. Use Save As to create an editable copy.',
    );
  }
  return value;
}

export function systemStyleLabel(label, id) {
  return isProtectedSystemStyleId(id) ? `${label} · system` : label;
}
