import { useMemo, useRef, useState } from 'react';

import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  IconButton,
  LabEditorHeader,
  PreviewBar,
  RendererToggle,
  toast,
  ToastStack,
} from '../../shared/ui/index.js';
import { downloadBlob, pickFile } from '../../shared/download.js';
import {
  DEFAULT_TRANSPARENT_PROFILE,
  createTransparentProfile,
  parseTransparentProfile,
  serializeTransparentProfile,
} from '../transparentProfile.js';
import {
  deleteTransparentProfile,
  loadTransparentProfiles,
  saveTransparentProfile,
} from '../transparentProjectStore.js';

const FIELDS = Object.freeze([
  ['roughness', 'Roughness', 0, 1, 0.01],
  ['transmission', 'Transmission', 0, 1, 0.01],
  ['opacity', 'Fallback opacity', 0.05, 1, 0.01],
  ['thickness', 'Thickness', 0, 5, 0.01],
  ['ior', 'Index of refraction', 1, 2.5, 0.01],
  ['attenuationDistance', 'Absorption distance', 0.1, 50, 0.1],
  ['clearcoat', 'Clearcoat', 0, 1, 0.01],
  ['clearcoatRoughness', 'Clearcoat roughness', 0, 1, 0.01],
  ['envMapIntensity', 'Reflection response', 0, 4, 0.01],
]);

function slug(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'transparent_profile';
}

export function App({ engine }) {
  const [profile, setProfile] = useState(() => createTransparentProfile(DEFAULT_TRANSPARENT_PROFILE));
  const [saved, setSaved] = useState(() => loadTransparentProfiles());
  const [backdrop, setBackdrop] = useState('dark');
  const [spin, setSpin] = useState(true);
  const importRef = useRef(false);
  const settings = profile.settings;

  function updateProfile(next) {
    const normalized = createTransparentProfile(next);
    setProfile(normalized);
    engine.apply(normalized);
  }

  function updateSetting(key, value) {
    updateProfile({ ...profile, settings: { ...settings, [key]: value } });
  }

  function save() {
    const savedProfile = saveTransparentProfile({ ...profile, id: slug(profile.label) });
    setSaved(loadTransparentProfiles());
    setProfile(savedProfile);
    toast(`Saved “${savedProfile.label}” to your profiles.`);
  }

  async function importProfile() {
    if (importRef.current) return;
    importRef.current = true;
    try {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      const result = parseTransparentProfile(await file.text());
      if (!result.ok) throw new Error(result.errors.join(' '));
      updateProfile(result.value);
      toast(`Imported “${result.value.label}”.`);
    } catch (error) {
      toast(error.message, { tone: 'danger' });
    } finally {
      importRef.current = false;
    }
  }

  const savedOptions = useMemo(() => saved.map((entry) => ({ id: entry.id, label: entry.label })), [saved]);
  const menus = createLabEditorMenus({
    fileItems: [
      { icon: 'plus', label: 'New Profile', onSelect: () => updateProfile(DEFAULT_TRANSPARENT_PROFILE) },
      { label: 'Import Profile…', onSelect: () => { void importProfile(); } },
      { icon: 'download', label: 'Export Profile', onSelect: () => downloadBlob(serializeTransparentProfile(profile), `${profile.id}.transparent-profile.json`, 'application/json') },
      { icon: 'save', label: 'Save Profile', onSelect: save },
    ],
  });

  return (
    <div className="tl-transparent-app tk">
      <LabEditorHeader className="tl-transparent-topbar" menus={menus}>
        <BrandLockup labName="Glass & Transparent Shader Lab" />
        <div className="tl-transparent-title">
          <strong>Transparent material profile</strong>
          <span>First-party procedural glass fixtures</span>
        </div>
        <div className="tl-transparent-actions">
          <RendererToggle supportedKinds={['webgl']} unsupportedReason="This portable material preview currently uses WebGL." />
        </div>
      </LabEditorHeader>

      <aside className="tl-transparent-inspector">
        <section>
          <h1>Glass profile</h1>
          <p>Author one portable profile against a pane, solid orb, and faceted volume. Geometry and lighting are preview-only.</p>
          <label className="tl-transparent-text">Name
            <input value={profile.label} maxLength="80" onChange={(event) => updateProfile({ ...profile, label: event.target.value })} />
          </label>
          {savedOptions.length > 0 && (
            <label className="tl-transparent-text">Saved profiles
              <span className="tl-transparent-saved-row">
                <select value="" onChange={(event) => {
                  const selected = saved.find((entry) => entry.id === event.target.value);
                  if (selected) updateProfile(selected);
                }}>
                  <option value="">Choose a profile…</option>
                  {savedOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
                <button type="button" onClick={() => {
                  const selected = saved.find((entry) => entry.id === profile.id);
                  if (!selected) return toast('Load a saved profile before deleting it.', { tone: 'danger' });
                  setSaved(deleteTransparentProfile(selected.id));
                  toast(`Deleted “${selected.label}”.`);
                }}>Delete</button>
              </span>
            </label>
          )}
        </section>
        <section>
          <h2>Color & absorption</h2>
          <label className="tl-transparent-color">Surface tint
            <input type="color" value={settings.color} onChange={(event) => updateSetting('color', event.target.value)} />
          </label>
          <label className="tl-transparent-color">Absorption tint
            <input type="color" value={settings.attenuationColor} onChange={(event) => updateSetting('attenuationColor', event.target.value)} />
          </label>
        </section>
        <section>
          <h2>Optical response</h2>
          {FIELDS.map(([key, label, min, max, step]) => (
            <label key={key} className="tl-transparent-range">
              <span>{label}<output>{Number(settings[key]).toFixed(step < 0.1 ? 2 : 1)}</output></span>
              <input type="range" min={min} max={max} step={step} value={settings[key]} onChange={(event) => updateSetting(key, Number(event.target.value))} />
            </label>
          ))}
          <label className="tl-transparent-check">
            <input type="checkbox" checked={settings.depthWrite} onChange={(event) => updateSetting('depthWrite', event.target.checked)} />
            Write depth (sorting diagnostic)
          </label>
        </section>
        <section className="tl-transparent-note">
          <strong>Portable artifact</strong>
          <p>Save stores a named profile in this browser. Export writes the same versioned JSON document for source control or handoff.</p>
        </section>
      </aside>

      <PreviewBar hint="Drag orbit · wheel zoom · three first-party fixtures">
        <div className="tk-segmented" aria-label="Preview background">
          {['dark', 'light'].map((value) => (
            <button key={value} type="button" data-active={backdrop === value} onClick={() => {
              setBackdrop(value);
              engine.setBackdrop(value);
            }}>{value === 'dark' ? 'Dark stage' : 'Light stage'}</button>
          ))}
        </div>
        <button type="button" className="tk-button" data-active={spin} onClick={() => {
          setSpin(!spin);
          engine.setSpin(!spin);
        }}>Rotate</button>
        <IconButton icon="reset" label="Reset camera" onClick={() => engine.frame()} />
      </PreviewBar>
      <ToastStack />
    </div>
  );
}
