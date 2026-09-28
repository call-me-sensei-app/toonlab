// Opt-in diagnostics (?profile=1). Timestamp queries are asynchronous; never
// substitute CPU submission time for unavailable GPU measurements.
export function createCloudProfiler(renderer, { warmupFrames = 32, sampleFrames = 64 } = {}) {
  const inspector = renderer.inspector;
  const begin = inspector.beginRender;
  const pending = new Map();
  const samples = new Map();
  const cpu = [];
  let frames = 0;
  let resolving = false;
  let disposed = false;
  inspector.beginRender = function (uid, scene, camera, target) {
    begin.call(this, uid, scene, camera, target);
    if (frames >= warmupFrames && frames < warmupFrames + sampleFrames) {
      pending.set(uid, target?.name || scene?.name || 'scene/composite');
    }
  };
  const mean = (values) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  function publish() {
    const report = {
      frames: cpu.length,
      cpuSubmitMs: mean(cpu),
      gpuAvailable: renderer.backend.hasTimestamp === true,
      gpuPassMs: Object.fromEntries([...samples].map(([name, values]) => [name, {
        mean: mean(values), samples: values.length,
      }])),
    };
    document.body.dataset.cloudProfile = JSON.stringify(report);
  }
  async function resolve() {
    if (resolving || disposed || !renderer.backend.hasTimestamp) return;
    resolving = true;
    try {
      await renderer.resolveTimestampsAsync('render');
      for (const [uid, name] of pending) {
        if (!renderer.backend.hasTimestampQuery(uid)) continue;
        const value = renderer.backend.getTimestamp(uid);
        if (Number.isFinite(value)) {
          if (!samples.has(name)) samples.set(name, []);
          samples.get(name).push(value);
        }
        pending.delete(uid);
      }
      // Bound diagnostics even if a backend discards query results.
      while (pending.size > 2048) pending.delete(pending.keys().next().value);
      if (!disposed) publish();
    } finally {
      resolving = false;
    }
  }
  return {
    get complete() { return frames >= warmupFrames + sampleFrames + 16; },
    frame(cpuMs) {
      if (frames >= warmupFrames && frames < warmupFrames + sampleFrames) cpu.push(cpuMs);
      frames += 1;
      if (frames % 8 === 0) {
        publish();
        void resolve().catch(() => {});
      }
    },
    dispose() { disposed = true; inspector.beginRender = begin; pending.clear(); },
  };
}
