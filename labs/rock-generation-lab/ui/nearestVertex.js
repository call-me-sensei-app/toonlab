/** Exact nearest-vertex queries. Build once per source snapshot, not per query. */
export function createNearestVertexLookup(attribute) {
  const count = attribute.count;
  const positions = new Float64Array(count * 3);
  const indices = Uint32Array.from({ length: count }, (_, index) => index);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = attribute.getX(i); positions[i * 3 + 1] = attribute.getY(i); positions[i * 3 + 2] = attribute.getZ(i);
  }
  const coordinate = (index, axis) => positions[index * 3 + axis];
  const less = (a, b, axis) => coordinate(a, axis) < coordinate(b, axis)
    || (coordinate(a, axis) === coordinate(b, axis) && a < b);
  const swap = (a, b) => { const value = indices[a]; indices[a] = indices[b]; indices[b] = value; };
  function partition(low, high, middle, axis) {
    while (low < high) {
      const pivotIndex = (low + high) >>> 1, pivot = indices[pivotIndex];
      swap(pivotIndex, high);
      let store = low;
      for (let i = low; i < high; i += 1) if (less(indices[i], pivot, axis)) swap(store++, i);
      swap(store, high);
      if (store === middle) return;
      if (middle < store) high = store - 1; else low = store + 1;
    }
  }
  function build(low, high, depth) {
    if (low >= high) return;
    const middle = (low + high) >>> 1;
    partition(low, high, middle, depth % 3);
    build(low, middle - 1, depth + 1); build(middle + 1, high, depth + 1);
  }
  build(0, count - 1, 0);
  return (x, y, z) => {
    let best = -1, bestDistance = Infinity;
    const query = [x, y, z];
    function visit(low, high, depth) {
      if (low > high) return;
      const middle = (low + high) >>> 1, index = indices[middle], axis = depth % 3;
      const dx = x - positions[index * 3], dy = y - positions[index * 3 + 1], dz = z - positions[index * 3 + 2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < bestDistance || (distance === bestDistance && index < best)) { best = index; bestDistance = distance; }
      const delta = query[axis] - coordinate(index, axis);
      if (delta <= 0) {
        visit(low, middle - 1, depth + 1);
        if (delta * delta <= bestDistance) visit(middle + 1, high, depth + 1);
      } else {
        visit(middle + 1, high, depth + 1);
        if (delta * delta <= bestDistance) visit(low, middle - 1, depth + 1);
      }
    }
    visit(0, count - 1, 0);
    return best;
  };
}
