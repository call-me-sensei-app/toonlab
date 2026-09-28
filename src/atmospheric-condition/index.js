// Preferred product namespace. The historical /climate entry remains a
// compatibility alias while Climate, Seasons & Time keeps its separate
// long-running timeline responsibility.

export {
  ATMOSPHERIC_CONDITION_DOCUMENT_TYPE,
  ATMOSPHERIC_CONDITION_DOCUMENT_VERSION,
  ATMOSPHERIC_CONDITION_FIELD_COUNT,
  ATMOSPHERIC_CONDITION_FIELD_SCHEMA,
  ATMOSPHERIC_CONDITION_GROUPS,
  ATMOSPHERIC_CONDITION_SETS,
  CLIMATE_RUNTIME_LIMITS as ATMOSPHERIC_CONDITION_RUNTIME_LIMITS,
  ClimateDirector as AtmosphericConditionDirector,
  DEFAULT_ATMOSPHERIC_CONDITION_SET,
  DEFAULT_CLIMATE_SEQUENCE as DEFAULT_ATMOSPHERIC_CONDITION_SEQUENCE,
  cloneAtmosphericCondition,
  createAtmosphericConditionDocument,
  createAtmosphericConditionSettings,
  createClimateDirector as createAtmosphericConditionDirector,
  createClimateSequence as createAtmosphericConditionSequence,
  getAtmosphericConditionOptions,
  getAtmosphericConditionSetOptions,
  parseAtmosphericConditionDocument,
  resolveAtmosphericCondition,
  resolveAtmosphericConditionSet,
  serializeAtmosphericConditionDocument,
} from '../climate/index.js';
