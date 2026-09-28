export class RockGeologyError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'RockGeologyError';
    this.code = code;
    this.path = options.path ?? '$';
    this.suggestion = options.suggestion ?? null;
    this.details = deepFreezePlain(options.details ?? {});
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      suggestion: this.suggestion,
      details: this.details,
    };
  }
}

export function validationIssue(code, path, message, suggestion = null, details = {}) {
  return Object.freeze({
    code,
    path,
    message,
    suggestion,
    details: deepFreezePlain(details),
  });
}

export function throwForValidationIssues(issues, message = 'RockRecipe validation failed.') {
  if (issues.length === 0) return;
  throw new RockGeologyError('ROCK_RECIPE_INVALID', message, {
    path: '$',
    suggestion: 'Correct every listed issue and submit the recipe again; values are never silently repaired.',
    details: { issues },
  });
}

function deepFreezePlain(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezePlain(child);
  return Object.freeze(value);
}
