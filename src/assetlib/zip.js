// Minimal ZIP reader (STORE + DEFLATE) — enough for ambientCG's archives.
// Runs in the browser AND Node ≥18 (DecompressionStream/Blob/Response are
// global in both). Hand-rolled on purpose: the repo ships zero runtime
// dependencies (texture-lab's zip WRITER set the precedent).

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * ArrayBuffer/Uint8Array of a .zip → [{ name, data: Uint8Array }] for every
 * file entry (directories skipped), via the central directory.
 */
export async function readZipEntries(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  for (let index = bytes.byteLength - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd === -1) throw new Error('readZipEntries: no end-of-central-directory (not a ZIP?).');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = [];
  const decoder = new TextDecoder();

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    // local header repeats name/extra with potentially different lengths
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith('/')) {
      if (method !== 0 && method !== 8) {
        throw new Error(`readZipEntries: unsupported compression method ${method} for "${name}".`);
      }
      entries.push({ data: method === 8 ? await inflateRaw(raw) : raw.slice(), name });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
