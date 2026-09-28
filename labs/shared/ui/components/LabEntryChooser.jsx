import { useMemo, useState } from 'react';

import { BrandLockup, labsHomeHref } from './LabChrome.jsx';
import { Modal } from './overlays.jsx';
import { Button, SearchSelect } from './primitives.jsx';
import { getCopy, localizeEditorText } from '../../../../src/i18n/locales.js';

/**
 * The shared front door for editor-first Labs. It deliberately requires an
 * explicit choice: silently restoring a draft makes New and Open impossible
 * to discover. Labs with a real gallery/home screen should use that instead.
 */
export function LabEntryChooser({
  currentDescription = 'Keep working with the values restored from this browser.',
  currentName = 'Current draft',
  entries = [],
  labName,
  newDescription = 'Start from the Lab default and make a separate entry.',
  newLabel = 'Create new',
  onContinue,
  onCreate,
  onOpenEntry,
  openLabel = 'Open saved',
}) {
  const copy = getCopy();
  const options = useMemo(
    () => entries.map((entry) => ({ label: entry.label, value: entry.value ?? entry.id })),
    [entries],
  );
  const [selectedId, setSelectedId] = useState(options[0]?.value ?? '');

  return (
    <Modal
      dismissible={false}
      onClose={() => {}}
      testId="lab-entry-chooser"
      title={<span className="tk-entry-chooser__brand"><BrandLockup labName={labName} /></span>}
      width={760}
    >
      <div className="tk-entry-chooser">
        <header className="tk-entry-chooser__header">
          <span className="tk-entry-chooser__eyebrow">{copy.chooseHowToBegin}</span>
          <h1>{copy.whatWouldYouLikeToWorkOn}</h1>
          <p>{copy.draftSafe}</p>
        </header>

        <div className="tk-entry-chooser__actions">
          <button className="tk-entry-chooser__card" type="button" onClick={onContinue}>
            <span className="tk-entry-chooser__card-kicker">{copy.continue}</span>
            <strong>{currentName || copy.currentDraft}</strong>
            <span>{localizeEditorText(currentDescription)}</span>
          </button>
          <button className="tk-entry-chooser__card" data-primary="true" type="button" onClick={onCreate}>
            <span className="tk-entry-chooser__card-kicker">{copy.newEntry}</span>
            <strong>{localizeEditorText(newLabel)}</strong>
            <span>{localizeEditorText(newDescription)}</span>
          </button>
        </div>

        <section className="tk-entry-chooser__library" aria-label={copy.openExistingEntry}>
          <div>
            <strong>{copy.openExistingEntry}</strong>
            <span>{copy.searchSavedEntries}</span>
          </div>
          {options.length > 0 ? (
            <div className="tk-entry-chooser__open-row">
              <SearchSelect
                onChange={setSelectedId}
                options={options}
                placeholder={copy.searchSavedEntriesPlaceholder}
                testId="lab-entry-search"
                value={selectedId}
              />
              <Button
                disabled={!selectedId}
                kind="primary"
                onClick={() => onOpenEntry?.(selectedId)}
                testId="lab-entry-open"
              >
                {localizeEditorText(openLabel)}
              </Button>
            </div>
          ) : (
            <p className="tk-entry-chooser__empty">{copy.noSavedEntries}</p>
          )}
        </section>

        <footer className="tk-entry-chooser__footer">
          <a className="tk-button" data-kind="secondary" href={labsHomeHref()}>
            {copy.backToLabs}
          </a>
          <span>{copy.leaveLab}</span>
        </footer>
      </div>
    </Modal>
  );
}
