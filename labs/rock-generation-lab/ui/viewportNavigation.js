// Camera shortcuts are scoped to the canvas; inspector inputs keep their keys.
export function installViewportNavigation({ canvas, orbit, frame, reset, setOrbitOverride, finishStroke }) {
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Rock viewport. Alt drag to orbit; arrows orbit; F frames selection; C resets camera.');
  const focus = () => canvas.focus({ preventScroll: true });
  const down = (event) => {
    if (document.activeElement !== canvas || event.metaKey || event.ctrlKey) return;
    if (event.key === 'Alt') { event.preventDefault(); finishStroke(); setOrbitOverride(true); return; }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (directions[event.key]) { event.preventDefault(); finishStroke(); orbit(...directions[event.key]); }
    else if (event.key.toLowerCase() === 'f') { event.preventDefault(); finishStroke(); frame(); }
    else if (event.key.toLowerCase() === 'c') { event.preventDefault(); finishStroke(); reset(); }
  };
  const up = (event) => { if (event.key === 'Alt') setOrbitOverride(false); };
  const blur = () => setOrbitOverride(false);
  canvas.addEventListener('pointerdown', focus, { capture: true });
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  canvas.addEventListener('blur', blur);
  return () => {
    canvas.removeEventListener('pointerdown', focus, { capture: true });
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur); canvas.removeEventListener('blur', blur);
  };
}
