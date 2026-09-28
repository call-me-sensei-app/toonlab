// Per-branch foliage inspector as a kit Popover, driven by store.selection
// (written by engine/picking.js). The anchored-popover-with-standard-fields
// anatomy here is the template for future direct-manipulation editors.

import { useRef } from 'react';
import {
  Badge, Button, Popover, Slider,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';

const FIELDS = [
  {
    defaultFrom: () => 1,
    key: 'densityScale',
    label: 'Density ×',
    max: 2,
    min: 0,
    step: 0.05,
    title: "Multiplies this branch's leaf card count. 0 = bare branch.",
  },
  {
    defaultFrom: (defaults) => defaults.cardsPerCluster,
    key: 'cardsPerCluster',
    label: 'Cards/Tuft',
    max: 14,
    min: 0,
    step: 1,
    title: 'Replaces the whole-tree cards-per-cluster for this branch.',
  },
  {
    defaultFrom: (defaults) => defaults.clusterRadius,
    key: 'clusterRadius',
    label: 'Tuft Radius',
    max: 1.5,
    min: 0.1,
    step: 0.02,
    title: 'Replaces the whole-tree cluster radius for this branch.',
  },
];

export function BranchInspectorPopover({ actions, state }) {
  const snapshotTaken = useRef(false);
  const { selection } = state;
  if (!selection) return null;

  const index = selection.branchIndex;
  const override = state.sketch.branchOverrides[index] ?? null;
  const defaults = {
    cardsPerCluster: state.settings.leaves.cardsPerCluster,
    clusterRadius: state.settings.leaves.clusterRadius,
  };

  function commitField(key, value) {
    actions.mutateBranchOverrides((overrides) => {
      if (!overrides[index]) overrides[index] = {};
      overrides[index][key] = value;
    }, { snapshot: !snapshotTaken.current });
    snapshotTaken.current = true;
  }

  return (
    <Popover
      anchor={selection.screen}
      onClose={() => {
        snapshotTaken.current = false;
        actions.clearSelection();
      }}
      testId="branch-inspector"
      title={(
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Branch #{index + 1}
          {override && <Badge tone="accent">Overridden</Badge>}
        </span>
      )}
    >
      <div style={{ color: 'var(--text-tertiary)', font: 'var(--type-caption)', marginBottom: 8 }}>
        Overrides this branch only — reroll/skeleton changes regrow branches.
      </div>
      {FIELDS.map((field) => {
        const value = override?.[field.key] ?? field.defaultFrom(defaults);
        const inherited = !override || override[field.key] === undefined;
        return (
          <div key={field.key} className="tk-field" style={{ gridTemplateColumns: '78px 1fr 44px' }} title={field.title}>
            <span
              className="tk-field-label"
              style={inherited ? { fontStyle: 'italic', opacity: 0.75 } : undefined}
            >
              {field.label}
            </span>
            <Slider
              defaultValue={field.defaultFrom(defaults)}
              max={field.max}
              min={field.min}
              onChange={(next) => commitField(field.key, next)}
              step={field.step}
              testId={`branch-${field.key}`}
              value={value}
            />
            <ScrubValue
              max={field.max}
              min={field.min}
              onChange={(next) => commitField(field.key, next)}
              step={field.step}
              value={value}
            />
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <Button
          disabled={!override}
          kind="danger"
          onClick={() => {
            actions.mutateBranchOverrides((overrides) => {
              delete overrides[index];
            }, { snapshot: true });
          }}
          testId="branch-reset"
        >
          Reset branch
        </Button>
      </div>
    </Popover>
  );
}
