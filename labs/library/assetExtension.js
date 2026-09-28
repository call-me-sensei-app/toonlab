import { normalizeCreationTags } from '../../database/creation-tags.mjs';
import './library.css';
import {
  isLibraryModel,
  libraryEntryInfo,
  libraryFormat,
  libraryLivePreview,
  libraryResultFile,
  rawLibraryDocument,
  stageLibraryLivePreview,
} from './libraryEntry.js';

const REVISION_PAGE_SIZE = 25;

function button(label, className = 'tl-btn') {
  const node = document.createElement('button');
  node.className = className;
  node.type = 'button';
  node.textContent = label;
  return node;
}

function field(label, control, hint = '') {
  const wrapper = document.createElement('label');
  wrapper.className = 'lib-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  if (hint) {
    const small = document.createElement('small');
    small.textContent = ` ${hint}`;
    caption.append(small);
  }
  wrapper.append(caption, control);
  return wrapper;
}

function input(name, { maxlength, placeholder = '', required = false } = {}) {
  const control = document.createElement('input');
  control.className = 'tl-input';
  control.name = name;
  control.placeholder = placeholder;
  control.required = required;
  if (maxlength) control.maxLength = maxlength;
  return control;
}

function textarea(name, rows = 4, maxlength = 2000) {
  const control = document.createElement('textarea');
  control.className = 'tl-input';
  control.name = name;
  control.rows = rows;
  control.maxLength = maxlength;
  return control;
}

function modal({ eyebrow, id, title }) {
  const root = document.createElement('div');
  root.className = 'lib-modal';
  root.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'lib-modal-panel';
  panel.role = 'dialog';
  panel.ariaModal = 'true';
  panel.setAttribute('aria-labelledby', id);
  const header = document.createElement('div');
  header.className = 'lib-modal-header';
  const copy = document.createElement('div');
  const overline = document.createElement('span');
  overline.className = 'lib-eyebrow';
  overline.textContent = eyebrow;
  const heading = document.createElement('h2');
  heading.id = id;
  heading.textContent = title;
  const close = button('×', 'lib-modal-close');
  close.setAttribute('aria-label', `Close ${title.toLowerCase()} dialog`);
  copy.append(overline, heading);
  header.append(copy, close);
  panel.append(header);
  root.append(panel);
  document.body.append(root);
  return { close, heading, panel, root };
}

function setModal(openModal, allModals) {
  for (const candidate of allModals) candidate.root.hidden = candidate !== openModal;
  document.body.classList.toggle('lib-modal-open', Boolean(openModal));
}

function downloadJson(documentValue, filename) {
  const blob = new Blob([`${JSON.stringify(documentValue, null, 2)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function slug(value) {
  return String(value || 'creation').replace(/[^a-z0-9._-]+/gi, '-');
}

function formatUpdatedAt(entry) {
  const date = new Date(entry?._local?.updatedAt ?? entry?.updatedAt ?? '');
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export async function bootLibraryAsset({ assetId, el, els, setupEmbeddedStage, setupStage, stat }) {
  document.body.classList.add('asset-library');
  document.querySelector('toonlab-site-header')?.setAttribute('active', 'library');
  const crumb = document.getElementById('assetCrumbLink');
  if (crumb) {
    crumb.href = '/library/';
    crumb.textContent = 'Library';
  }

  const response = await fetch('/api/toonlab/library');
  if (!response.ok) throw new Error(`Library unavailable: HTTP ${response.status}`);
  const entries = (await response.json()).entries ?? [];
  let activeEntry = entries.find((entry) => entry.id === assetId);
  if (!activeEntry) throw new Error('That local creation no longer exists.');

  const info = libraryEntryInfo(activeEntry);
  const file = libraryResultFile(activeEntry);
  const livePreview = libraryLivePreview(activeEntry);

  if ((isLibraryModel(activeEntry) || livePreview?.mode === 'model') && file?.url) {
    setupStage('model', {
      download: { url: file.url },
      thumbnailUrl: null,
    }, { scanStylize: false });
  } else if (livePreview?.mode === 'lab') {
    stageLibraryLivePreview(activeEntry);
    setupEmbeddedStage({
      kind: livePreview.kind,
      labUrl: livePreview.labUrl,
      supportsCompare: livePreview.supportsCompare,
      thumbnailUrl: null,
    });
  } else if (livePreview?.mode === 'image' && file?.url) {
    els.stage.style.backgroundImage = `url("${String(file.url).replaceAll('"', '%22')}")`;
  } else {
    els.stage.classList.add('asset-stage--pack');
    els.stage.append(el('div', 'lib-preview-unavailable', 'This creation type has no live preview surface'));
  }

  const panel = document.querySelector('.asset-panel');
  const details = document.createElement('section');
  details.className = 'lib-panel-section';
  const detailsHead = document.createElement('div');
  detailsHead.className = 'lib-panel-heading';
  const detailsCopy = document.createElement('div');
  const detailsEyebrow = el('span', 'lib-eyebrow', 'Local metadata');
  const detailsTitle = el('h2', null, 'Asset details');
  const edit = button('Edit');
  const detailStatus = el('span', 'lib-status mono');
  detailStatus.role = 'status';
  detailsCopy.append(detailsEyebrow, detailsTitle);
  detailsHead.append(detailsCopy, edit);
  details.append(detailsHead, el('p', null, 'Edit the name, description, and searchable tags for this local creation.'), detailStatus);

  const history = document.createElement('section');
  history.className = 'lib-history';
  const historyHead = document.createElement('div');
  historyHead.className = 'lib-history-heading';
  const historyCopy = document.createElement('div');
  historyCopy.append(el('span', 'lib-eyebrow', 'Version history'), el('h2', null, 'Revisions'),
    el('p', null, 'Restoring creates a new revision; history is never rewritten.'));
  historyHead.append(historyCopy);
  const revisionList = el('div', 'lib-revision-list');
  const revisionStatus = el('p', 'lib-status mono');
  revisionStatus.role = 'status';
  history.append(historyHead, revisionList, revisionStatus);

  const json = document.createElement('details');
  json.className = 'lib-json';
  const jsonSummary = document.createElement('summary');
  jsonSummary.textContent = 'Document JSON';
  const jsonCode = el('pre', 'mono');
  json.append(jsonSummary, jsonCode);
  panel.append(details, history, json);

  const editDialog = modal({ eyebrow: 'Metadata', id: 'editModalTitle', title: 'Edit details' });
  const editForm = document.createElement('form');
  editForm.className = 'lib-card';
  const labelInput = input('label', { maxlength: 120, required: true });
  const descriptionInput = textarea('description');
  const tagsInput = input('tags', { maxlength: 329, placeholder: 'forest, hero-prop, village' });
  const editActions = el('div', 'lib-form-actions');
  const remove = button('Delete', 'tl-btn lib-danger');
  const save = button('Save changes', 'tl-btn tl-btn--primary');
  save.type = 'submit';
  editActions.append(remove, save);
  editForm.append(
    field('Name', labelInput),
    field('Description', descriptionInput),
    field('Tags', tagsInput, 'Comma-separated, up to 10. Tags make this creation searchable.'),
    editActions,
  );
  editDialog.panel.append(editForm);

  const revisionDialog = modal({ eyebrow: 'Version details', id: 'revisionModalTitle', title: 'Name this version' });
  const revisionForm = document.createElement('form');
  revisionForm.className = 'lib-card';
  const revisionId = input('revisionId');
  revisionId.type = 'hidden';
  const revisionName = input('name', { maxlength: 120, placeholder: 'Client-approved lighting' });
  const revisionTags = input('tags', { maxlength: 329, placeholder: 'approved, milestone' });
  const revisionNote = textarea('note');
  const pinLabel = document.createElement('label');
  pinLabel.className = 'lib-revision-pin';
  const pinned = input('pinned');
  pinned.type = 'checkbox';
  pinLabel.append(pinned, 'Pin this version');
  const revisionActions = el('div', 'lib-form-actions');
  const saveRevision = button('Save version details', 'tl-btn tl-btn--primary');
  saveRevision.type = 'submit';
  revisionActions.append(saveRevision);
  revisionForm.append(
    revisionId,
    field('Name', revisionName, 'Optional, and unique within this creation.'),
    field('Version tags', revisionTags, 'Separate from the creation’s searchable tags.'),
    field('Note', revisionNote),
    pinLabel,
    revisionActions,
  );
  revisionDialog.panel.append(revisionForm);
  const dialogs = [editDialog, revisionDialog];

  let revisions = [];
  let revisionTotal = 0;

  function renderMetadata() {
    const currentInfo = libraryEntryInfo(activeEntry);
    document.title = `${activeEntry.label ?? activeEntry.name ?? activeEntry.id} — ToonLab Library`;
    els.crumbSource.textContent = currentInfo.label;
    els.name.textContent = activeEntry.label ?? activeEntry.name ?? activeEntry.id;
    els.desc.textContent = activeEntry.description || 'A ToonLab creation saved in this local workspace.';
    els.stats.replaceChildren(
      stat('Source', 'Your Library'),
      stat('Type', currentInfo.label),
      stat('Updated', formatUpdatedAt(activeEntry)),
      stat('Format', libraryFormat(activeEntry)),
      stat('Scope', 'Local workspace'),
    );
    els.tags.replaceChildren(...(activeEntry.tags ?? []).map((tag) => {
      const link = el('a', null, `#${tag}`);
      link.href = `/library/?tag=${encodeURIComponent(tag)}`;
      return link;
    }));
    els.actions.replaceChildren();
    const styleBundle = activeEntry.type === 'style-bundle'
      || rawLibraryDocument(activeEntry)?.schema === 'toonlab/style-bundle';
    const href = styleBundle
      ? `/styles/?bundle=${encodeURIComponent(activeEntry.id)}`
      : livePreview?.labUrl ?? currentInfo.href;
    if (href) {
      const action = el('a', 'pill', styleBundle ? 'Open style bundle' : currentInfo.actionLabel ?? 'Open in lab');
      action.href = href;
      els.actions.append(action);
    }
    labelInput.value = activeEntry.label ?? activeEntry.name ?? activeEntry.id;
    descriptionInput.value = activeEntry.description ?? '';
    tagsInput.value = Array.isArray(activeEntry.tags) ? activeEntry.tags.join(', ') : '';
    jsonCode.textContent = JSON.stringify(rawLibraryDocument(activeEntry), null, 2);
  }

  function openRevision(revision) {
    revisionId.value = revision.id;
    revisionName.value = revision.name ?? '';
    revisionTags.value = (revision.versionTags ?? []).join(', ');
    revisionNote.value = revision.note ?? '';
    pinned.checked = revision.pinned === true;
    revisionDialog.heading.textContent = `Version ${revision.number}`;
    setModal(revisionDialog, dialogs);
    revisionName.focus();
  }

  async function downloadRevision(revision) {
    revisionStatus.textContent = `Preparing version ${revision.number}…`;
    const result = await fetch(`/api/toonlab/library/${encodeURIComponent(activeEntry._local.creationId)}/revisions/${encodeURIComponent(revision.id)}`);
    if (!result.ok) throw new Error('Version download failed.');
    const snapshot = (await result.json()).revision;
    downloadJson(snapshot.document, `${slug(activeEntry.label)}-v${revision.number}.toonlab.json`);
    revisionStatus.textContent = `${revisionTotal} ${revisionTotal === 1 ? 'version' : 'versions'}`;
  }

  function renderRevisions() {
    revisionList.replaceChildren(...revisions.map((revision) => {
      const item = el('article', `lib-revision${revision.isCurrent ? ' lib-revision--current' : ''}`);
      const copy = el('div', 'lib-revision-copy');
      const heading = el('div', 'lib-revision-title');
      heading.append(el('strong', null, revision.name || `Version ${revision.number}`), el('span', 'lib-revision-badges', [
        `v${revision.number}`, revision.isCurrent ? 'Current' : null, revision.pinned ? 'Pinned' : null,
        revision.restoredFromRevisionId ? 'Restored' : null,
      ].filter(Boolean).join(' · ')));
      const created = new Date(revision.createdAt);
      const meta = el('p', null, `${Number.isNaN(created.getTime()) ? 'Unknown date' : created.toLocaleString()} · ${revision.saveSource}`);
      const tagRow = el('div', 'lib-revision-tags');
      tagRow.append(...(revision.versionTags ?? []).map((tag) => el('span', 'gal-badge', `#${tag}`)));
      copy.append(heading, meta, tagRow);
      if (revision.note) copy.append(el('p', 'lib-revision-note', revision.note));
      const actions = el('div', 'lib-revision-actions');
      const annotate = button('Name & tag');
      annotate.addEventListener('click', () => openRevision(revision));
      const download = button('Download');
      download.addEventListener('click', () => downloadRevision(revision).catch((error) => { revisionStatus.textContent = error.message; }));
      actions.append(annotate, download);
      if (!revision.isCurrent) {
        const restore = button('Restore');
        restore.addEventListener('click', async () => {
          if (!confirm(`Restore version ${revision.number}? Your current version will remain in history.`)) return;
          revisionStatus.textContent = 'Restoring…';
          const result = await fetch(`/api/toonlab/library/${encodeURIComponent(activeEntry._local.creationId)}/revisions/${encodeURIComponent(revision.id)}/restore`, { method: 'POST' });
          if (!result.ok) {
            revisionStatus.textContent = (await result.json()).error ?? 'Restore failed.';
            return;
          }
          window.location.reload();
        });
        actions.append(restore);
      }
      item.append(copy, actions);
      return item;
    }));
    if (revisions.length < revisionTotal) {
      const more = button(`Load more versions (${revisionTotal - revisions.length} remaining)`);
      more.addEventListener('click', () => loadRevisions(false).catch((error) => { revisionStatus.textContent = error.message; }));
      revisionList.append(more);
    }
  }

  async function loadRevisions(reset = true) {
    const offset = reset ? 0 : revisions.length;
    revisionStatus.textContent = 'Loading history…';
    const result = await fetch(`/api/toonlab/library/${encodeURIComponent(activeEntry._local.creationId)}/revisions?limit=${REVISION_PAGE_SIZE}&offset=${offset}`);
    if (!result.ok) throw new Error('Version history unavailable.');
    const payload = await result.json();
    revisions = reset ? payload.revisions ?? [] : [...revisions, ...(payload.revisions ?? [])];
    revisionTotal = Number(payload.total ?? revisions.length);
    renderRevisions();
    revisionStatus.textContent = `Showing ${revisions.length} of ${revisionTotal} ${revisionTotal === 1 ? 'version' : 'versions'}`;
  }

  edit.addEventListener('click', () => { setModal(editDialog, dialogs); labelInput.focus(); });
  editDialog.close.addEventListener('click', () => setModal(null, dialogs));
  revisionDialog.close.addEventListener('click', () => setModal(null, dialogs));
  for (const dialog of dialogs) {
    dialog.root.addEventListener('mousedown', (event) => {
      if (event.target === dialog.root) setModal(null, dialogs);
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setModal(null, dialogs);
  });
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    detailStatus.textContent = 'Saving…';
    const next = {
      ...activeEntry,
      description: descriptionInput.value.trim(),
      label: labelInput.value.trim(),
      tags: normalizeCreationTags(tagsInput.value.split(',')),
    };
    const result = await fetch(`/api/toonlab/library/${encodeURIComponent(next.id)}`, {
      body: JSON.stringify(next), headers: { 'content-type': 'application/json' }, method: 'PUT',
    });
    if (!result.ok) {
      detailStatus.textContent = 'Save failed.';
      return;
    }
    activeEntry = (await result.json()).entry ?? next;
    renderMetadata();
    await loadRevisions();
    setModal(null, dialogs);
    detailStatus.textContent = 'Saved';
  });
  remove.addEventListener('click', async () => {
    if (!confirm(`Delete “${activeEntry.label}” from the local Library?`)) return;
    const result = await fetch(`/api/toonlab/library/${encodeURIComponent(activeEntry.id)}`, { method: 'DELETE' });
    if (!result.ok) {
      detailStatus.textContent = 'Delete failed.';
      return;
    }
    window.location.assign('/library/');
  });
  revisionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    revisionStatus.textContent = 'Saving version details…';
    const result = await fetch(`/api/toonlab/library/${encodeURIComponent(activeEntry._local.creationId)}/revisions/${encodeURIComponent(revisionId.value)}`, {
      body: JSON.stringify({
        name: revisionName.value,
        note: revisionNote.value,
        pinned: pinned.checked,
        tags: normalizeCreationTags(revisionTags.value.split(',')),
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    if (!result.ok) {
      revisionStatus.textContent = (await result.json()).error ?? 'Save failed.';
      return;
    }
    setModal(null, dialogs);
    await loadRevisions();
    revisionStatus.textContent = 'Version details saved.';
  });

  els.download.hidden = false;
  els.download.href = '#';
  els.download.textContent = 'Download JSON ↓';
  els.download.addEventListener('click', (event) => {
    event.preventDefault();
    downloadJson(rawLibraryDocument(activeEntry), `${slug(activeEntry.label ?? activeEntry.id)}.toonlab.json`);
  });

  renderMetadata();
  await loadRevisions();
  document.body.dataset.libraryAssetReady = 'true';
}
