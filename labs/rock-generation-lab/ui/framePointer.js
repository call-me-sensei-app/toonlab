/** Coalesce high-frequency pointer input; always flush the last sample on release. */
export function createFramePointerQueue(consume, {
  request = requestAnimationFrame, cancel = cancelAnimationFrame,
} = {}) {
  let sample = null, frame = null;
  const flush = () => {
    if (frame !== null) cancel(frame);
    frame = null;
    const next = sample; sample = null;
    if (next !== null) consume(next);
  };
  return {
    enqueue(event) {
      sample = event;
      if (frame === null) frame = request(flush);
    },
    flush,
    clear() { if (frame !== null) cancel(frame); frame = null; sample = null; },
  };
}
