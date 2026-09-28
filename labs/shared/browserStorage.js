/** Named user documents must not claim success when browser storage rejects them. */
export function writeRequiredLocalJson(key, value) {
  try {
    if (!window.localStorage) throw new Error('Storage is unavailable.');
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    throw new Error(`Could not save to browser storage: ${error?.message ?? error}`);
  }
}
