// Cross-lab handoff: one lab stashes a small payload, navigates, and the
// target lab takes it at boot. sessionStorage on purpose — same-tab only,
// survives the navigation, dies with the tab, and can't grow into a second
// persistence layer (payloads must stay bounded, e.g. ≤1024px data URLs).

const PREFIX = 'toonlab.handoff.';

export function setLabHandoff(key, value) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota/private mode — caller falls back or toasts
  }
}

/** Reads AND clears the payload (a handoff is consumed exactly once). */
export function takeLabHandoff(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    sessionStorage.removeItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
