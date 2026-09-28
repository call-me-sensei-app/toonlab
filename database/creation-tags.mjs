const MAX_CREATION_TAGS = 10;
const MAX_CREATION_TAG_LENGTH = 32;

export function normalizeCreationTag(tag) {
  return String(tag)
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_CREATION_TAG_LENGTH)
    .replace(/-+$/g, '');
}

export function normalizeCreationTags(tags) {
  if (tags == null) return [];
  if (!Array.isArray(tags)) {
    throw Object.assign(new Error('Creation tags must be an array.'), { statusCode: 400 });
  }
  return [...new Set(tags.map(normalizeCreationTag).filter(Boolean))]
    .slice(0, MAX_CREATION_TAGS);
}
