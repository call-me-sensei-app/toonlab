// All-Controls power drawer: every settings group flat (advanced fields
// inline), fuzzy label filter, and the live recipe JSON editor.

import { useMemo, useState } from 'react';
import {
  TREE_SETTING_FIELD_SCHEMA, TREE_SETTING_GROUPS, TREE_SPECIES_PROFILE_BY_ID,
} from '../../../../src/vegetation/experimental.js';
import { readFieldValueFromSettings } from '../../../../src/debug/fieldValues.js';
import {
  Button, SchemaGroup, TextField, toast,
} from '../../../shared/ui/index.js';
import { fieldsForLab, groupForLab, isFieldDisabled } from '../fieldRules.js';
import { WoodyBaselinePanel } from './WoodyBaselinePanel.jsx';
import { PlantSections } from './StagePanel.jsx';

function RecipeJsonEditor({ actions, state }) {
  // Re-derive on every document change; local draft only while editing.
  const liveJson = useMemo(
    () => JSON.stringify(actions.getRecipeDocument(), null, 2),
    [actions, state.docRevision],
  );
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');

  return (
    <section className="tk-section">
      <div className="tk-section-title">Recipe (JSON)</div>
      <textarea
        className="td-json"
        data-testid="recipe-json"
        spellCheck={false}
        value={draft ?? liveJson}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="td-json-actions">
        <Button
          kind="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(draft ?? liveJson);
            toast('Recipe JSON copied', { tone: 'success' });
          }}
        >
          Copy
        </Button>
        <Button
          disabled={draft === null}
          kind="secondary"
          onClick={() => {
            const result = actions.importRecipe(draft);
            if (!result.ok) {
              setError(result.errors.join(' '));
              return;
            }
            setDraft(null);
            setError('');
            toast('Recipe applied', { tone: 'success' });
          }}
          testId="recipe-apply"
        >
          Apply
        </Button>
        {draft !== null && (
          <Button kind="ghost" onClick={() => { setDraft(null); setError(''); }}>Discard</Button>
        )}
      </div>
      {error && <div className="td-json-error">{error}</div>}
    </section>
  );
}

export function PowerDrawer({ actions, labKind = 'tree', state }) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const profile = state.settings.plant.speciesProfileId
    ? TREE_SPECIES_PROFILE_BY_ID[state.settings.plant.speciesProfileId]
    : null;
  const baselineSpecies = ['woody-axis', 'whorled-conifer'].includes(profile?.engine);
  const fieldFilter = (field) => !needle
    || field.label.toLowerCase().includes(needle)
    || field.group.toLowerCase().includes(needle);

  return (
    <>
      <div className="td-inspector-header">
        {labKind === 'tree' ? 'All controls · woody baseline 131' : 'All controls'}
      </div>
      <div className="td-drawer-filter">
        <TextField
          onCommit={setFilter}
          placeholder="Filter fields…"
          testId="drawer-filter"
          value={filter}
        />
      </div>
      <WoodyBaselinePanel
        actions={actions}
        filter={filter}
        labKind={labKind}
        state={state}
      />
      {TREE_SETTING_GROUPS
        .filter((group) => labKind === 'flower' || group.id !== 'flower')
        .filter((group) => !baselineSpecies || ['plant', 'color'].includes(group.id))
        .map((group) => {
          if (group.id === 'plant' && labKind === 'tree') {
            return (
              <PlantSections
                key={group.id}
                actions={actions}
                fieldFilter={fieldFilter}
                state={state}
              />
            );
          }
          return (
            <SchemaGroup
              key={group.id}
              fieldFilter={fieldFilter}
              fields={fieldsForLab(TREE_SETTING_FIELD_SCHEMA[group.id], labKind, state)}
              flat
              getValue={(field) => readFieldValueFromSettings(state.settings, field)}
              group={groupForLab(group, labKind)}
              isDisabled={(field) => isFieldDisabled(state, field)}
              onChange={(field, value, interaction) => actions.setField(field, value, {
                snapshot: interaction ? Boolean(interaction.gestureStart) : true,
                transient: Boolean(interaction?.transient),
              })}
              showCaption={false}
            />
          );
        })}
      <RecipeJsonEditor actions={actions} state={state} />
    </>
  );
}
