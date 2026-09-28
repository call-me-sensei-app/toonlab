// File download/pick helpers shared by the labs.

/** Triggers a browser download of `data` (Blob/ArrayBuffer/string). */
export function downloadBlob(data, filename, mimeType = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  // Local OSS development keeps an MCP-visible copy in `.toonlab/exports`.
  // Hosted/static builds simply 404 this private dev route and retain the
  // normal browser download behavior below.
  fetch(`/api/toonlab/files/${encodeURIComponent(`exports/${filename}`)}`, {
    body: blob,
    headers: { 'content-type': blob.type || mimeType },
    method: 'PUT',
  }).catch(() => {});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Opens a file picker and resolves with the selected File (or null when the
 * user cancels).
 */
export function pickFile(accept = '') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    // 'cancel' fires on modern browsers when the dialog is dismissed.
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
