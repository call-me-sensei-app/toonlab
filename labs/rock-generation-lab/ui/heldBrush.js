const PAINT_TOOLS = new Set(['inflate', 'deflate', 'smooth', 'flatten', 'clay', 'scrape', 'pinch', 'crack', 'roughen', 'erode', 'terrace']);

/** Schedule one held-brush stamp, without catching up a backlog after a slow frame. */
export function tickHeldBrush(gesture, now, stamp) {
  if (!gesture?.pointer || !PAINT_TOOLS.has(gesture.tool)
    || !Number.isFinite(gesture.lastStampTime) || now - gesture.lastStampTime < 80) return false;
  gesture.lastStampTime = now;
  stamp(gesture.pointer);
  return true;
}
