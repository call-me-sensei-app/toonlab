import React, { useEffect, useMemo, useRef, useState } from 'react';

const MODEL_KINDS = new Set([
  'text_to_model',
  'image_to_model',
  'multiview_to_model',
  'model_segment',
]);
const IMAGE_KINDS = new Set(['image', 'texture_image', 'concept_image']);
const MATERIAL_KINDS = new Set(['material']);
const MATERIAL_MAPS = ['basecolor', 'normal', 'roughness', 'metalness', 'height'];
const ACTIVE_STATUSES = new Set(['queued', 'running']);
const VIEW_SLOTS = ['Front', 'Left', 'Back', 'Right'];

const KIND_LABELS = {
  concept_image: 'Concept',
  image: 'Image',
  image_to_model: '3D · image',
  material: 'PBR material',
  model_segment: 'Parts split',
  multiview_to_model: '3D · multi-view',
  text_to_model: '3D prop',
  texture_image: 'Texture',
};

const STATUS_META = {
  cancelled: { color: 'var(--tl-warn)', label: 'Cancelled' },
  failed: { color: 'var(--tl-danger)', label: 'Failed' },
  queued: { color: 'var(--tl-ink-3)', label: 'Queued' },
  running: { color: 'var(--tl-ao)', label: 'Generating' },
  succeeded: { color: 'var(--tl-success)', label: 'Ready' },
};

const fileUrl = (file, download = false) => {
  if (!file?.url) return null;
  return `${file.url}${download ? '?download=1' : ''}`;
};

const jobPrompt = (job) => job?.prompt || job?.request?.prompt || job?.request?.user || '';
const jobResultUrl = (job) => fileUrl(job?.result?.file);
const jobPreviewUrl = (job) => fileUrl(job?.result?.previewFile) || (
  IMAGE_KINDS.has(job?.kind) ? jobResultUrl(job) : null
);
const isReadyImage = (job) => (
  job?.status === 'succeeded'
  && IMAGE_KINDS.has(job.kind)
  && Boolean(jobResultUrl(job))
);

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function stageFile(file) {
  const name = `${Date.now()}-${file.name.replace(/[^a-z0-9._-]+/gi, '-')}`;
  const body = await api(`/api/toonlab/files/${encodeURIComponent(`generation-reference/${name}`)}`, {
    body: file,
    headers: { 'content-type': file.type || 'application/octet-stream' },
    method: 'PUT',
  });
  return {
    key: body.file.id || body.file.relativePath,
    label: file.name,
    path: body.file.relativePath,
    url: body.file.url,
  };
}

function StatusChip({ job }) {
  const meta = STATUS_META[job.status] || STATUS_META.queued;
  const progress = job.result?.task?.progress;
  return (
    <span className="tl-badge" style={{ borderColor: meta.color, color: meta.color }}>
      {ACTIVE_STATUSES.has(job.status) ? <span aria-hidden>⟳</span> : null}
      {meta.label}
      {Number.isFinite(progress) ? ` · ${progress}%` : ''}
    </span>
  );
}

function ReferenceThumb({ reference, onRemove }) {
  return (
    <div className="gen-ref-thumb" title={reference.label}>
      <img alt={reference.label} src={reference.url} />
      {onRemove ? (
        <button className="x" onClick={onRemove} title="Remove reference" type="button">✕</button>
      ) : null}
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [tab, setTab] = useState('model');
  const [modelMode, setModelMode] = useState('image');
  const [modelProvider, setModelProvider] = useState('meshy');
  const [imageModelId, setImageModelId] = useState('');
  const [style, setStyle] = useState('stylized');
  const [prompt, setPrompt] = useState('');
  const [promptBackup, setPromptBackup] = useState(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [enhanceBusy, setEnhanceBusy] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resolution, setResolution] = useState('1k');
  const [imageCount, setImageCount] = useState(1);
  const [materialMaps, setMaterialMaps] = useState([...MATERIAL_MAPS]);
  const [materialVariants, setMaterialVariants] = useState(1);
  const [materialTiling, setMaterialTiling] = useState('both');
  const [materialFormat, setMaterialFormat] = useState('png');
  const [autoChain, setAutoChain] = useState(false);
  const [references, setReferences] = useState([]);
  const [sourceImage, setSourceImage] = useState(null);
  const [viewImages, setViewImages] = useState([null, null, null, null]);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [generationPicker, setGenerationPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [detailId, setDetailId] = useState(null);
  const [saved, setSaved] = useState({});
  const [selected, setSelected] = useState({});
  const [combineSlots, setCombineSlots] = useState(null);
  const polling = useRef(false);

  const activeKind = tab === 'model'
    ? modelMode === 'text'
      ? 'text_to_model'
      : modelMode === 'multiview' ? 'multiview_to_model' : 'image_to_model'
    : tab;
  const selectedModel = config?.imageModels?.find((item) => item.id === imageModelId) || null;
  const availableModels = config?.imageModels?.filter((item) => item.configured) || [];
  const materialModel = config?.materialModels?.[0] || null;
  const resolutionOptions = MATERIAL_KINDS.has(activeKind)
    ? materialModel?.resolutions || ['1k', '2k', '4k', '8k']
    : selectedModel?.resolutions || ['1k'];
  const provider = MATERIAL_KINDS.has(activeKind)
    ? materialModel?.provider || 'fal'
    : MODEL_KINDS.has(activeKind) ? modelProvider : selectedModel?.provider;
  const textViaImage = activeKind === 'text_to_model' && modelProvider === 'meshy';
  const configured = textViaImage
    ? Boolean(config?.providers?.meshy && selectedModel?.configured)
    : MATERIAL_KINDS.has(activeKind)
      ? Boolean(materialModel?.configured)
      : provider ? Boolean(config?.providers?.[provider]) : false;
  const canEnhance = Boolean(config?.promptEnhancementConfigured);
  const visibleJobs = useMemo(() => jobs.filter((job) => {
    const matchesKind = kindFilter === 'all'
      || (kindFilter === 'model' ? MODEL_KINDS.has(job.kind) : job.kind === kindFilter);
    return matchesKind && jobPrompt(job).toLowerCase().includes(query.trim().toLowerCase());
  }), [jobs, kindFilter, query]);
  const selectedIds = Object.entries(selected).filter(([, value]) => value).map(([id]) => id);
  const detail = jobs.find((job) => job.id === detailId) || null;

  const loadJobs = async () => {
    try {
      const body = await api('/api/toonlab/generations?limit=100');
      setJobs(body.jobs || []);
    } catch (cause) {
      setError(cause.message);
    }
  };

  useEffect(() => {
    Promise.all([
      api('/api/toonlab/providers'),
      api('/api/toonlab/generations?limit=100'),
    ]).then(([providerConfig, history]) => {
      setConfig(providerConfig);
      setJobs(history.jobs || []);
      const first = providerConfig.imageModels?.find((item) => item.configured);
      setImageModelId(first?.id || providerConfig.imageModels?.[0]?.id || '');
      const first3d = providerConfig.modelProviders?.find((item) => item.configured);
      setModelProvider(first3d?.id || providerConfig.modelProviders?.[0]?.id || 'meshy');
    }).catch((cause) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (!MODEL_KINDS.has(activeKind)) return;
    const current = config?.modelProviders?.find((item) => item.id === modelProvider);
    if (current?.configured && current.kinds.includes(activeKind)) return;
    const next = config?.modelProviders?.find((item) => item.configured && item.kinds.includes(activeKind));
    if (next) setModelProvider(next.id);
  }, [activeKind, config, modelProvider]);

  useEffect(() => {
    if (!selectedModel) return;
    if (!selectedModel.resolutions.includes(resolution)) {
      setResolution(selectedModel.resolutions[0] || '1k');
    }
  }, [selectedModel, resolution]);

  useEffect(() => {
    const active = jobs.some((job) => ACTIVE_STATUSES.has(job.status));
    if (!active) return undefined;
    const timer = window.setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const current = jobs.filter((job) => ACTIVE_STATUSES.has(job.status));
        const updates = await Promise.all(current.map((job) =>
          api(`/api/toonlab/generation/${encodeURIComponent(job.id)}`).then((body) => body.job),
        ));
        setJobs((previous) => previous.map((job) =>
          updates.find((update) => update.id === job.id) || job,
        ));
      } catch (cause) {
        setError(cause.message);
      } finally {
        polling.current = false;
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setDetailId(null);
      setGenerationPicker(false);
      setPromptExpanded(false);
      setCombineSlots(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addFiles = async (files) => {
    const incoming = [...(files || [])].slice(0, Math.max(0, 6 - references.length));
    if (!incoming.length) return;
    setReferenceBusy(true);
    setError('');
    try {
      const staged = await Promise.all(incoming.map(stageFile));
      setReferences((previous) => [...previous, ...staged].slice(0, 6));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setReferenceBusy(false);
    }
  };

  const chooseSourceFile = async (file) => {
    if (!file) return;
    setReferenceBusy(true);
    try {
      setSourceImage(await stageFile(file));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setReferenceBusy(false);
    }
  };

  const chooseViewFile = async (index, file) => {
    if (!file) return;
    setReferenceBusy(true);
    try {
      const staged = await stageFile(file);
      setViewImages((previous) => previous.map((item, i) => i === index ? staged : item));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setReferenceBusy(false);
    }
  };

  const addUrlReference = async () => {
    if (!urlValue.trim() || references.length >= 6) return;
    setReferenceBusy(true);
    setError('');
    try {
      const body = await api('/api/toonlab/reference-url', {
        body: JSON.stringify({ url: urlValue.trim() }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setReferences((previous) => [
        ...previous,
        {
          key: body.file.id || body.file.relativePath,
          label: urlValue.trim(),
          path: body.file.relativePath,
          url: body.file.url,
        },
      ].slice(0, 6));
      setUrlValue('');
      setUrlOpen(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setReferenceBusy(false);
    }
  };

  const submitJob = async ({
    kind = activeKind,
    jobPrompt: nextPrompt = prompt,
    request = {},
    jobProvider = provider,
  } = {}) => {
    const body = await api('/api/toonlab/generate', {
      body: JSON.stringify({
        kind,
        provider: jobProvider,
        request: {
          aspectRatio,
          ...(MATERIAL_KINDS.has(kind) ? {} : { model: selectedModel?.model, modelId: selectedModel?.id }),
          prompt: nextPrompt.trim(),
          resolution,
          style,
          ...request,
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    setJobs((previous) => [body.job, ...previous.filter((job) => job.id !== body.job.id)]);
    return body.job;
  };

  const generate = async () => {
    setError('');
    if (!configured) {
      setError(`Configure ${provider || 'a supported provider'} in .env first.`);
      return;
    }
    if (activeKind === 'image_to_model' && !sourceImage) {
      setError('Choose a reference image.');
      return;
    }
    if (
      activeKind === 'multiview_to_model'
      && (!viewImages[0] || viewImages.filter(Boolean).length < 2)
    ) {
      setError('Multi-view needs a front view and at least one additional view.');
      return;
    }
    if (!['image_to_model', 'multiview_to_model'].includes(activeKind) && !prompt.trim()) {
      setError('Write a prompt first.');
      return;
    }
    setBusy(true);
    try {
      if (textViaImage) {
        const imageJob = await submitJob({
          jobProvider: selectedModel.provider,
          kind: 'concept_image',
          request: {
            model: selectedModel.model,
            modelId: selectedModel.id,
            prompt: prompt.trim(),
            resolution,
          },
        });
        if (imageJob.status !== 'succeeded' || !imageJob.result?.file?.relativePath) {
          throw new Error('The concept image did not finish successfully.');
        }
        await submitJob({
          jobPrompt: prompt,
          jobProvider: 'meshy',
          kind: 'image_to_model',
          request: { imagePath: imageJob.result.file.relativePath },
        });
        return;
      }
      const count = IMAGE_KINDS.has(activeKind) ? imageCount : 1;
      for (let index = 0; index < count; index += 1) {
        const job = await submitJob({
          request: {
            ...(activeKind === 'material' ? {
              maps: materialMaps,
              numImages: materialVariants,
              outputFormat: materialFormat,
              tilingMode: materialTiling,
            } : {}),
            ...(activeKind === 'image_to_model' ? { imagePath: sourceImage.path } : {}),
            ...(activeKind === 'multiview_to_model'
              ? { views: viewImages.map((item) => item?.path || null) }
              : {}),
            ...(IMAGE_KINDS.has(activeKind)
              ? { referencePaths: references.map((item) => item.path) }
              : {}),
          },
        });
        if (autoChain && IMAGE_KINDS.has(activeKind) && job.status === 'succeeded') {
          await submitJob({
            jobPrompt: prompt,
            jobProvider: modelProvider,
            kind: 'image_to_model',
            request: { imagePath: job.result.file.relativePath },
          });
        }
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  const enhancePrompt = async () => {
    if (!prompt.trim()) {
      setError('Write a rough prompt first.');
      return;
    }
    setEnhanceBusy(true);
    setError('');
    try {
      const body = await api('/api/toonlab/generate/enhance', {
        body: JSON.stringify({ prompt }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setPromptBackup(prompt);
      setPrompt(body.prompt || prompt);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setEnhanceBusy(false);
    }
  };

  const makeThreeD = async (job) => {
    setError('');
    try {
      await submitJob({
        jobPrompt: jobPrompt(job),
        jobProvider: modelProvider,
        kind: 'image_to_model',
        request: { imagePath: job.result.file.relativePath },
      });
      setDetailId(null);
    } catch (cause) {
      setError(cause.message);
    }
  };

  const splitModel = async (job) => {
    const originalTaskId = job.result?.taskId || job.result?.task?.task_id;
    if (!originalTaskId) {
      setError('The original Tripo task id is unavailable.');
      return;
    }
    try {
      await submitJob({
        jobPrompt: `Parts split · ${jobPrompt(job)}`,
        jobProvider: 'tripo',
        kind: 'model_segment',
        request: { originalTaskId },
      });
      setDetailId(null);
    } catch (cause) {
      setError(cause.message);
    }
  };

  const saveToLibrary = async (job) => {
    const id = `generation:${job.id}`;
    setError('');
    try {
      await api(`/api/toonlab/library/${encodeURIComponent(id)}`, {
        body: JSON.stringify({
          aiGenerated: true,
          description: jobPrompt(job),
          id,
          kind: job.kind,
          label: jobPrompt(job).slice(0, 80) || KIND_LABELS[job.kind],
          provider: job.provider,
          result: job.result,
          source: 'generate',
          type: MODEL_KINDS.has(job.kind) ? 'generated-model' : MATERIAL_KINDS.has(job.kind) ? 'generated-material' : 'generated-image',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      });
      setSaved((previous) => ({ ...previous, [job.id]: true }));
    } catch (cause) {
      setError(cause.message);
    }
  };

  const reusePrompt = (job) => {
    setPrompt(jobPrompt(job));
    if (MATERIAL_KINDS.has(job.kind)) {
      setTab('material');
      setResolution(job.request?.resolution || '2k');
    } else if (IMAGE_KINDS.has(job.kind)) {
      setTab(job.kind);
      const model = config.imageModels.find((item) => item.model === job.request?.model);
      if (model) setImageModelId(model.id);
      setAspectRatio(job.request?.aspectRatio || '1:1');
      setResolution(job.request?.resolution || '1k');
    } else {
      setTab('model');
      setModelMode(job.kind === 'text_to_model' ? 'text' : 'image');
      if (job.provider && config.modelProviders.some((item) => item.id === job.provider)) {
        setModelProvider(job.provider);
      }
      setStyle(job.request?.style || 'stylized');
    }
    setDetailId(null);
  };

  const cancelJob = async (job) => {
    setError('');
    try {
      const body = await api(`/api/toonlab/generation/${encodeURIComponent(job.id)}`, {
        method: 'DELETE',
      });
      setJobs((previous) => previous.map((item) => item.id === job.id ? body.job : item));
    } catch (cause) {
      setError(cause.message);
    }
  };

  const useAsReference = (job) => {
    if (!isReadyImage(job) || references.length >= 6) return;
    setReferences((previous) => [
      ...previous,
      {
        key: job.id,
        label: jobPrompt(job) || KIND_LABELS[job.kind],
        path: job.result.file.relativePath,
        url: jobResultUrl(job),
      },
    ].slice(0, 6));
    setGenerationPicker(false);
    setDetailId(null);
  };

  const convertSelected = async () => {
    setBusy(true);
    try {
      for (const id of selectedIds) {
        const job = jobs.find((item) => item.id === id);
        if (isReadyImage(job)) await makeThreeD(job);
      }
      setSelected({});
    } finally {
      setBusy(false);
    }
  };

  const combineSelected = async () => {
    if (!combineSlots?.[0] || combineSlots.filter(Boolean).length < 2) {
      setError('Assign a front view and at least one additional view.');
      return;
    }
    try {
      await submitJob({
        jobPrompt: 'Multi-view model',
        jobProvider: modelProvider,
        kind: 'multiview_to_model',
        request: {
          views: combineSlots.map((id) => {
            const job = jobs.find((item) => item.id === id);
            return job?.result?.file?.relativePath || null;
          }),
        },
      });
      setCombineSlots(null);
      setSelected({});
    } catch (cause) {
      setError(cause.message);
    }
  };

  if (!config) {
    return (
      <main className="home-main generate-shell">
        <div className="tl-empty">
          <strong>{error ? 'Local generation workspace is unavailable' : 'Loading local generation workspace…'}</strong>
          {error ? <span>{error}</span> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="home-main generate-shell">
      <div className="generate-heading">
        <div>
          <div className="tl-kicker">Asset faucet <span className="jp">生成</span></div>
          <h1 className="sec-title">Generate</h1>
          <p className="home-sub">
            Bring your own provider keys. Jobs and outputs stay in your local workspace.
          </p>
        </div>
        <div className="gen-local-badges">
          <span className="tl-badge tl-badge--cyan">LOCAL</span>
          <span className="tl-badge">
            {Object.entries(config.providers).filter(([, enabled]) => enabled).map(([name]) => name).join(' · ') || 'No providers'}
          </span>
        </div>
      </div>

      <div className="gen-layout">
        <aside className="gen-compose">
          <section className="gen-panel">
            <span className="gen-panel-label">Output</span>
            <div className="gen-kinds">
              {[
                ['model', '3D prop', 'Meshy 7 / Tripo'],
                ['image', 'Image', 'Freeform'],
                ['texture_image', 'Texture', 'Tileable'],
                ['material', 'PBR material', 'Fal Patina'],
                ['concept_image', 'Concept', 'Asset-ready'],
              ].map(([id, name, meta]) => (
                <button className={`gen-kind ${tab === id ? 'active' : ''}`} key={id} onClick={() => setTab(id)} type="button">
                  <span className="name">{name}</span>
                  <span className="price">{meta}</span>
                </button>
              ))}
            </div>
          </section>

          {tab === 'model' ? (
            <section className="gen-panel">
              <span className="gen-panel-label">3D provider</span>
              <div className="gen-chips">
                {config.modelProviders
                  .filter((item) => item.kinds.includes(activeKind))
                  .map((item) => (
                    <button
                      className={`gen-chip ${modelProvider === item.id ? 'active' : ''}`}
                      disabled={!item.configured}
                      key={item.id}
                      onClick={() => setModelProvider(item.id)}
                      title={item.configured ? item.label : `${item.label} is not configured`}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
              </div>
              <span className="gen-panel-label">Source</span>
              <div className="gen-chips">
                {[
                  ['image', 'Image'],
                  ['text', 'Text'],
                  ['multiview', 'Multi-view'],
                ].map(([id, label]) => (
                  <button className={`gen-chip ${modelMode === id ? 'active' : ''}`} key={id} onClick={() => setModelMode(id)} type="button">
                    {label}
                  </button>
                ))}
              </div>
              {modelMode === 'image' ? (
                <label className={`gen-file ${sourceImage ? 'filled' : ''}`}>
                  {sourceImage ? sourceImage.label : <><span className="plus">＋</span><span>Reference image</span></>}
                  <input accept={modelProvider === 'meshy' ? 'image/png,image/jpeg' : 'image/png,image/jpeg,image/webp'} hidden onChange={(event) => chooseSourceFile(event.target.files?.[0])} type="file" />
                </label>
              ) : null}
              {modelMode === 'multiview' ? (
                <>
                  <span className="gen-help">2–4 shots of the same object. Front is required.</span>
                  <div className="gen-views">
                    {VIEW_SLOTS.map((slot, index) => (
                      <label className={`gen-file ${viewImages[index] ? 'filled' : ''}`} key={slot}>
                        {viewImages[index] ? `${slot} ✓` : `${slot}${index === 0 ? ' *' : ''}`}
                        <input accept={modelProvider === 'meshy' ? 'image/png,image/jpeg' : 'image/png,image/jpeg,image/webp'} hidden onChange={(event) => chooseViewFile(index, event.target.files?.[0])} type="file" />
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
              <label className="gen-control">
                <span className="gen-panel-label">Style</span>
                <select className="tl-input" onChange={(event) => setStyle(event.target.value)} value={style}>
                  {config.styles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              {textViaImage ? (
                <div className="gen-control">
                  <span className="gen-panel-label">Concept image model</span>
                  <span className="gen-help">Your text generates an asset concept first, then Meshy 7 converts it to 3D.</span>
                  <div className="gen-models">
                    {config.imageModels.map((item) => (
                      <button
                        className={`gen-model ${imageModelId === item.id ? 'active' : ''}`}
                        disabled={!item.configured}
                        key={item.id}
                        onClick={() => setImageModelId(item.id)}
                        type="button"
                      >
                        <span className="name">{item.label}</span>
                        <span className="price">{item.provider}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : tab === 'material' ? (
            <section className="gen-panel">
              <span className="gen-panel-label">Model</span>
              <div className="gen-models">
                {(config.materialModels || []).map((item) => (
                  <button className="gen-model active" disabled={!item.configured} key={item.id} type="button">
                    <span className="name">{item.label}</span>
                    <span className="price">{item.provider}</span>
                  </button>
                ))}
              </div>
              <span className="gen-help">Creates one seamless preview plus basecolor, normal, roughness, metalness, and height maps.</span>
            </section>
          ) : (
            <>
              <section className="gen-panel">
                <span className="gen-panel-label">Model</span>
                <div className="gen-models">
                  {config.imageModels.map((item) => (
                    <button
                      className={`gen-model ${imageModelId === item.id ? 'active' : ''}`}
                      disabled={!item.configured}
                      key={item.id}
                      onClick={() => setImageModelId(item.id)}
                      title={item.configured ? item.provider : `${item.provider} is not configured`}
                      type="button"
                    >
                      <span className="name">{item.label}</span>
                      <span className="price">{item.provider}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="gen-panel">
                <span className="gen-panel-label">References ({references.length}) <span className="hint">— up to 6</span></span>
                <div className="gen-chips">
                  <label className={`gen-chip ${referenceBusy ? 'disabled' : ''}`}>
                    🖼 Image
                    <input accept="image/png,image/jpeg,image/webp" disabled={referenceBusy || references.length >= 6} hidden multiple onChange={(event) => addFiles(event.target.files)} type="file" />
                  </label>
                  <button className={`gen-chip ${urlOpen ? 'active' : ''}`} disabled={references.length >= 6} onClick={() => setUrlOpen((value) => !value)} type="button">🔗 URL</button>
                  <button className="gen-chip" disabled={references.length >= 6} onClick={() => setGenerationPicker(true)} type="button">⧉ Generations</button>
                </div>
                {urlOpen ? (
                  <div className="gen-url-row">
                    <input className="tl-input" onChange={(event) => setUrlValue(event.target.value)} placeholder="https://…/image.png" value={urlValue} />
                    <button className="tl-btn" disabled={referenceBusy} onClick={addUrlReference} type="button">Add</button>
                  </div>
                ) : null}
                {references.length ? (
                  <div className="gen-ref-thumbs">
                    {references.map((reference) => (
                      <ReferenceThumb key={reference.key} reference={reference} onRemove={() => setReferences((previous) => previous.filter((item) => item.key !== reference.key))} />
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          )}

          {activeKind !== 'multiview_to_model' ? (
            <section className="gen-panel">
              <div className="gen-panel-head">
                <span className="gen-panel-label">Prompt{activeKind === 'image_to_model' ? <span className="hint"> — optional notes</span> : null}</span>
                {IMAGE_KINDS.has(activeKind) ? (
                  <div className="gen-panel-actions">
                    {promptBackup !== null ? <button className="gen-mini-btn" onClick={() => { setPrompt(promptBackup); setPromptBackup(null); }} type="button">↩ Undo</button> : null}
                    <button className="gen-mini-btn" onClick={() => setPromptExpanded(true)} type="button">⛶ Expand</button>
                    <button
                      className="gen-mini-btn accent"
                      disabled={enhanceBusy || !canEnhance}
                      onClick={enhancePrompt}
                      title={canEnhance ? 'Improve this prompt' : 'Configure Gemini or OpenAI to enhance prompts'}
                      type="button"
                    >
                      {enhanceBusy ? '✨ Enhancing…' : '✨ AI Enhance'}
                    </button>
                  </div>
                ) : null}
              </div>
              <textarea
                className="tl-input"
                maxLength={600}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={tab === 'material' ? 'weathered copper roof, turquoise verdigris, hammered finish' : tab === 'texture_image' ? 'mossy stone bricks, hand-painted, cool tones' : tab === 'image' ? 'anything — key art, a mood shot, a sprite sheet…' : 'a wooden fish-drying rack, weathered planks, rope lashings'}
                rows={4}
                value={prompt}
              />
            </section>
          ) : null}

          {IMAGE_KINDS.has(activeKind) ? (
            <section className="gen-panel">
              <span className="gen-panel-label">Settings</span>
              {activeKind !== 'texture_image' ? (
                <div className="gen-control">
                  <span className="gen-setting-label">Aspect ratio</span>
                  <div className="gen-chips">
                    {config.aspectRatios.map((item) => <button className={`gen-chip ${aspectRatio === item ? 'active' : ''}`} key={item} onClick={() => setAspectRatio(item)} type="button">{item}</button>)}
                  </div>
                </div>
              ) : <span className="gen-help">Textures always render square so they tile.</span>}
              <div className="gen-control">
                <span className="gen-setting-label">Resolution</span>
                <div className="gen-chips">
                  {resolutionOptions.map((item) => <button className={`gen-chip ${resolution === item ? 'active' : ''}`} key={item} onClick={() => setResolution(item)} type="button">{item.toUpperCase()}</button>)}
                </div>
              </div>
              <div className="gen-control">
                <span className="gen-setting-label">Images</span>
                <div className="gen-chips">
                  {[1, 2, 3, 4].map((item) => <button className={`gen-chip ${imageCount === item ? 'active' : ''}`} key={item} onClick={() => setImageCount(item)} type="button">{item}</button>)}
                </div>
              </div>
              {activeKind !== 'texture_image' ? (
                <div className="gen-control">
                  <span className="gen-setting-label">3D provider</span>
                  <div className="gen-chips">
                    {config.modelProviders
                      .filter((item) => item.kinds.includes('image_to_model'))
                      .map((item) => (
                        <button
                          className={`gen-chip ${modelProvider === item.id ? 'active' : ''}`}
                          disabled={!item.configured}
                          key={item.id}
                          onClick={() => setModelProvider(item.id)}
                          title={item.configured ? item.label : `${item.label} is not configured`}
                          type="button"
                        >
                          {item.label}
                        </button>
                      ))}
                  </div>
                  <label className="gen-check">
                    <input
                      checked={autoChain}
                      disabled={!config.providers[modelProvider] && !autoChain}
                      onChange={(event) => setAutoChain(event.target.checked)}
                      type="checkbox"
                    />
                    Generate 3D automatically after the image
                  </label>
                </div>
              ) : null}
            </section>
          ) : MATERIAL_KINDS.has(activeKind) ? (
            <section className="gen-panel">
              <span className="gen-panel-label">Settings</span>
              <div className="gen-control">
                <span className="gen-setting-label">Final map resolution</span>
                <div className="gen-chips">
                  {resolutionOptions.map((item) => <button className={`gen-chip ${resolution === item ? 'active' : ''}`} key={item} onClick={() => setResolution(item)} type="button">{item.toUpperCase()}</button>)}
                </div>
              </div>
              <div className="gen-control">
                <span className="gen-setting-label">Maps</span>
                <div className="gen-chips">
                  {MATERIAL_MAPS.map((mapType) => (
                    <button
                      className={`gen-chip ${materialMaps.includes(mapType) ? 'active' : ''}`}
                      key={mapType}
                      onClick={() => setMaterialMaps((current) => current.includes(mapType)
                        ? current.filter((item) => item !== mapType)
                        : [...current, mapType])}
                      type="button"
                    >
                      {mapType}
                    </button>
                  ))}
                </div>
              </div>
              <div className="gen-control">
                <span className="gen-setting-label">Variants</span>
                <div className="gen-chips">
                  {[1, 2, 3, 4].map((count) => <button className={`gen-chip ${materialVariants === count ? 'active' : ''}`} key={count} onClick={() => setMaterialVariants(count)} type="button">{count}</button>)}
                </div>
              </div>
              <label className="gen-control">
                <span className="gen-setting-label">Tiling</span>
                <select className="tl-input" onChange={(event) => setMaterialTiling(event.target.value)} value={materialTiling}>
                  <option value="both">Horizontal + vertical</option>
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </select>
              </label>
              <label className="gen-control">
                <span className="gen-setting-label">Format</span>
                <select className="tl-input" onChange={(event) => setMaterialFormat(event.target.value)} value={materialFormat}>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                  <option value="jpeg">JPEG</option>
                </select>
              </label>
            </section>
          ) : null}

          <div className="gen-cta">
            <div className="gen-cost">
              <span className="label">Execution</span>
              <span className="value">{configured ? 'Local' : 'Needs key'} <em>{provider || ''}</em></span>
            </div>
            <button className="tl-btn tl-btn--primary" disabled={busy || referenceBusy || !configured} onClick={generate} type="button">
              {busy ? 'Starting…' : IMAGE_KINDS.has(activeKind) && imageCount > 1 ? `Generate (${imageCount})` : 'Generate'}
            </button>
            {error ? <span className="gen-error">{error}</span> : null}
          </div>
        </aside>

        <section className="gen-stage">
          <div className="gen-toolbar">
            <input className="tl-input" onChange={(event) => setQuery(event.target.value)} placeholder="Search generations…" value={query} />
            <div className="gen-chips">
              {[
                ['all', 'All'],
                ['model', '3D'],
                ['image', 'Images'],
                ['texture_image', 'Textures'],
                ['material', 'Materials'],
                ['concept_image', 'Concepts'],
              ].map(([id, label]) => <button className={`gen-chip ${kindFilter === id ? 'active' : ''}`} key={id} onClick={() => setKindFilter(id)} type="button">{label}</button>)}
            </div>
            <button className="gen-mini-btn" onClick={loadJobs} type="button">↻ Refresh</button>
            <span className="gen-count">{visibleJobs.length} / {jobs.length}</span>
          </div>

          {selectedIds.length ? (
            <div className="tl-card gen-selection-bar">
              <span>{selectedIds.length} image{selectedIds.length === 1 ? '' : 's'} selected</span>
              <button className="tl-btn" disabled={!config.providers[modelProvider] || busy} onClick={convertSelected} type="button">Convert each to 3D</button>
              {selectedIds.length >= 2 && selectedIds.length <= 4 ? (
                <button className="tl-btn" disabled={!config.providers[modelProvider]} onClick={() => setCombineSlots([selectedIds[0] || null, selectedIds[1] || null, selectedIds[2] || null, selectedIds[3] || null])} type="button">Combine into one model</button>
              ) : null}
              <button className="tl-btn tl-btn--ghost" onClick={() => setSelected({})} type="button">Clear</button>
            </div>
          ) : null}

          {combineSlots ? (
            <div className="tl-card gen-combine">
              <strong>Combine as views of one object</strong>
              <span className="gen-help">Assign images to fixed angles. Front is required.</span>
              <div className="gen-combine-grid">
                {VIEW_SLOTS.map((slot, index) => {
                  const assignedJob = jobs.find((job) => job.id === combineSlots[index]);
                  return (
                    <label className="gen-control" key={slot}>
                      <span className="gen-panel-label">{slot}{index === 0 ? ' *' : ''}</span>
                      {assignedJob ? <img alt={slot} src={jobResultUrl(assignedJob)} /> : null}
                      <select className="tl-input" onChange={(event) => {
                        const value = event.target.value || null;
                        setCombineSlots((previous) => previous.map((current, i) => i === index ? value : current === value ? null : current));
                      }} value={combineSlots[index] || ''}>
                        <option value="">— empty —</option>
                        {selectedIds.map((id) => <option key={id} value={id}>{jobPrompt(jobs.find((job) => job.id === id)).slice(0, 42) || id}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
              <div className="gen-row">
                <button className="tl-btn tl-btn--primary" onClick={combineSelected} type="button">Build one model</button>
                <button className="tl-btn tl-btn--ghost" onClick={() => setCombineSlots(null)} type="button">Cancel</button>
              </div>
            </div>
          ) : null}

          {!visibleJobs.length ? (
            <div className="tl-empty">
              <div className="gen-empty-icon">📦</div>
              <strong>{jobs.length ? 'Nothing matches' : 'No generations yet'}</strong>
              <span>{jobs.length ? 'Try another search or filter.' : 'Compose on the left — jobs land here with live status.'}</span>
            </div>
          ) : (
            <div className="gen-grid">
              {visibleJobs.map((job) => {
                const thumb = jobPreviewUrl(job);
                return (
                  <article className="tl-card gen-job-card" key={job.id} onClick={() => setDetailId(job.id)} tabIndex={0}>
                    <div className="gen-job-media">
                      {thumb ? <img alt={jobPrompt(job) || KIND_LABELS[job.kind]} src={thumb} /> : <div className="gen-job-placeholder">{ACTIVE_STATUSES.has(job.status) ? `${STATUS_META[job.status].label}…` : job.error || KIND_LABELS[job.kind]}</div>}
                      {isReadyImage(job) ? (
                        <label className="gen-select" onClick={(event) => event.stopPropagation()}>
                          <input checked={Boolean(selected[job.id])} onChange={(event) => setSelected((previous) => ({ ...previous, [job.id]: event.target.checked }))} type="checkbox" />select
                        </label>
                      ) : null}
                      <div className="gen-job-status"><StatusChip job={job} /></div>
                    </div>
                    <div className="gen-job-body">
                      <strong>{jobPrompt(job) || KIND_LABELS[job.kind]}</strong>
                      <span className="mono">{KIND_LABELS[job.kind]} · {job.provider} · {new Date(job.created_at).toLocaleDateString()}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {detail ? (
        <div className="gen-modal gen-modal--full" onClick={(event) => event.target === event.currentTarget && setDetailId(null)} role="dialog">
          <div className="gen-detail">
            <div className="gen-detail-stage">
              {MODEL_KINDS.has(detail.kind) && jobResultUrl(detail) ? (
                <iframe className="gen-compare-frame" src={`/asset/?url=${encodeURIComponent(jobResultUrl(detail))}&kind=model&style=call_me_sensei&hud=0&embed=1&backdrop=studio`} title="Generated model preview" />
              ) : jobPreviewUrl(detail) ? (
                <img alt={jobPrompt(detail)} src={jobPreviewUrl(detail)} />
              ) : (
                <div className="empty">{ACTIVE_STATUSES.has(detail.status) ? 'Generation in progress…' : detail.error || 'No preview available.'}</div>
              )}
              <button className="gen-modal-close" onClick={() => setDetailId(null)} title="Close" type="button">✕</button>
            </div>
            <aside className="gen-detail-side">
              <div className="gen-row"><StatusChip job={detail} /><span className="tl-badge">{KIND_LABELS[detail.kind]}</span><span className="tl-badge tl-badge--cyan">{detail.provider}</span></div>
              <div className="prompt">{jobPrompt(detail) || KIND_LABELS[detail.kind]}</div>
              <div className="gen-detail-meta">
                <span><b>Created</b> {new Date(detail.created_at).toLocaleString()}</span>
                {detail.request?.modelId ? <span><b>Model</b> {config.imageModels.find((item) => item.id === detail.request.modelId)?.label || detail.request.modelId}</span> : null}
                {MATERIAL_KINDS.has(detail.kind) ? <><span><b>Maps</b> {Object.keys(detail.result?.materialBundle?.variants?.[0]?.maps || {}).join(', ') || 'preview only'}</span><span><b>Resolution</b> {(detail.request?.resolution || '2k').toUpperCase()}</span></> : IMAGE_KINDS.has(detail.kind) ? <><span><b>Aspect</b> {detail.request?.aspectRatio || '1:1'}</span><span><b>Resolution</b> {(detail.request?.resolution || '1k').toUpperCase()}</span></> : <span><b>Style</b> {detail.request?.style || 'stylized'}</span>}
                <span><b>Local job</b> {detail.id}</span>
              </div>
              {detail.error ? <div className="gen-error">{detail.error}</div> : null}
              <div className="gen-detail-actions">
                {jobResultUrl(detail) ? <a className="tl-btn" download href={fileUrl(detail.result.file, true)}>{MODEL_KINDS.has(detail.kind) ? 'Download GLB' : MATERIAL_KINDS.has(detail.kind) ? 'Download basecolor' : 'Download image'}</a> : null}
                {detail.result?.materialBundle?.manifestFile ? <a className="tl-btn" download href={fileUrl(detail.result.materialBundle.manifestFile, true)}>Download manifest</a> : null}
                {isReadyImage(detail) && detail.kind !== 'texture_image' && config.providers[modelProvider] ? <button className="tl-btn tl-btn--primary" onClick={() => makeThreeD(detail)} type="button">Make 3D</button> : null}
                {isReadyImage(detail) ? <button className="tl-btn" onClick={() => useAsReference(detail)} type="button">@ Use as reference</button> : null}
                {detail.status === 'succeeded' ? <button className="tl-btn" disabled={Boolean(saved[detail.id])} onClick={() => saveToLibrary(detail)} type="button">{saved[detail.id] ? 'Saved to Library ✓' : 'Save to Library'}</button> : null}
                {jobPrompt(detail) ? <button className="tl-btn tl-btn--ghost" onClick={() => reusePrompt(detail)} type="button">↻ Reuse prompt</button> : null}
                {detail.provider === 'tripo' && MODEL_KINDS.has(detail.kind) && detail.status === 'succeeded' && detail.kind !== 'model_segment' ? <button className="tl-btn tl-btn--ghost" onClick={() => splitModel(detail)} type="button">Split into parts</button> : null}
                {ACTIVE_STATUSES.has(detail.status) ? <button className="tl-btn tl-btn--ghost" onClick={() => cancelJob(detail)} type="button">Cancel locally</button> : null}
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      {promptExpanded ? (
        <div className="gen-modal" onClick={(event) => event.target === event.currentTarget && setPromptExpanded(false)} role="dialog">
          <div className="gen-prompt-editor">
            <div className="gen-prompt-editor-head">
              <span className="gen-panel-label">Prompt — {KIND_LABELS[activeKind]}</span>
              <div className="gen-panel-actions">
                <button
                  className="gen-mini-btn accent"
                  disabled={enhanceBusy || !canEnhance}
                  onClick={enhancePrompt}
                  title={canEnhance ? 'Improve this prompt' : 'Configure Gemini or OpenAI to enhance prompts'}
                  type="button"
                >
                  {enhanceBusy ? '✨ Enhancing…' : '✨ AI Enhance'}
                </button>
                <button className="gen-modal-close static" onClick={() => setPromptExpanded(false)} type="button">✕</button>
              </div>
            </div>
            <textarea autoFocus className="tl-input gen-prompt-editor-text" maxLength={600} onChange={(event) => setPrompt(event.target.value)} value={prompt} />
            <div className="gen-prompt-editor-foot"><span className="mono">{prompt.length} / 600</span><button className="tl-btn tl-btn--primary" onClick={() => setPromptExpanded(false)} type="button">Done</button></div>
          </div>
        </div>
      ) : null}

      {generationPicker ? (
        <div className="gen-modal" onClick={(event) => event.target === event.currentTarget && setGenerationPicker(false)} role="dialog">
          <div className="gen-picker">
            <div className="gen-picker-head"><strong>Use a previous generation</strong><button className="gen-modal-close static" onClick={() => setGenerationPicker(false)} type="button">✕</button></div>
            <span className="gen-help">Choose a finished image from your local generation history.</span>
            <div className="gen-picker-grid">
              {jobs.filter(isReadyImage).map((job) => (
                <button className="gen-picker-image" key={job.id} onClick={() => useAsReference(job)} type="button">
                  <img alt={jobPrompt(job)} src={jobResultUrl(job)} />
                  <span>{jobPrompt(job).slice(0, 44) || KIND_LABELS[job.kind]}</span>
                </button>
              ))}
              {!jobs.some(isReadyImage) ? <div className="tl-empty">No finished image generations yet.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
