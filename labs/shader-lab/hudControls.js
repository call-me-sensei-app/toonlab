// Stateless HUD DOM primitives shared by the shader-lab demo.

export { HUD_TABS, setHudTab, initializeHudTabs } from '../shared/hudTabs.js';

export function updateHudOutput(id, value, formatter = (nextValue) => String(nextValue)) {
  const output = document.getElementById(`${id}Value`);
  if (output) {
    const formattedValue = formatter(value);
    output.value = formattedValue;
    output.textContent = formattedValue;
  }
}

export function setHudRangeValue(id, value, formatter) {
  const input = document.getElementById(id);
  if (input) input.value = String(value);
  updateHudOutput(id, value, formatter);
}

export function setHudRangeDisabled(id, disabled) {
  const input = document.getElementById(id);
  if (input) input.disabled = disabled;
}

export function setHudRangeLimits(id, { min, max, step, value } = {}) {
  const input = document.getElementById(id);
  if (!input) return;
  if (Number.isFinite(min)) input.min = String(min);
  if (Number.isFinite(max)) input.max = String(max);
  if (Number.isFinite(step)) input.step = String(step);
  if (Number.isFinite(value)) input.value = String(value);
}

export function bindHudRange(id, onInput, formatter) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    onInput(value);
    updateHudOutput(id, value, formatter);
  });
}

export function setHudSelectValue(id, value, label = value) {
  const select = document.getElementById(id);
  if (select) select.value = value;
  updateHudOutput(id, label);
}

export function setHudSelectDisabled(id, disabled) {
  const select = document.getElementById(id);
  if (select) select.disabled = disabled;
}

export function bindHudSelect(id, onInput) {
  const select = document.getElementById(id);
  if (!select) return;
  select.addEventListener('change', () => onInput(select.value));
}

export function setHudCheckboxValue(id, checked, label = checked ? 'On' : 'Off') {
  const input = document.getElementById(id);
  if (input) input.checked = Boolean(checked);
  updateHudOutput(id, label);
}

export function setHudCheckboxDisabled(id, disabled) {
  const input = document.getElementById(id);
  if (input) input.disabled = disabled;
}

export function bindHudCheckbox(id, onInput) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('change', () => onInput(input.checked));
}


