// Small stateless kit primitives. Anything with real interaction logic
// (Slider, overlays) lives in its own file.

import {
  useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { Icon } from './Icon.jsx';
import { getCopy } from '../../../../src/i18n/locales.js';

export function Button({
  children, disabled = false, icon = null, kind = 'secondary', onClick, testId, title,
}) {
  return (
    <button
      type="button"
      className="tk-button"
      data-kind={kind}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function IconButton({
  active = false, disabled = false, icon, label, onClick, testId,
}) {
  return (
    <button
      type="button"
      className="tk-icon-button"
      data-active={active || undefined}
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className="tk-badge" data-tone={tone}>{children}</span>;
}

export function Kbd({ keys }) {
  return <kbd className="tk-kbd">{keys}</kbd>;
}

export function Toggle({ checked, disabled = false, onChange, testId }) {
  return (
    <button
      type="button"
      role="switch"
      className="tk-toggle"
      aria-checked={checked}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Select({
  disabled = false, onChange, options, testId, value,
}) {
  return (
    <select
      className="tk-select"
      data-testid={testId}
      disabled={disabled}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option
          key={String(option.value)}
          disabled={Boolean(option.disabled)}
          title={typeof option.disabledReason === 'string' ? option.disabledReason : undefined}
          value={String(option.value)}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SearchSelect({
  disabled = false, onChange, options, placeholder = 'Search…', testId, value,
}) {
  const copy = getCopy();
  const listId = useId();
  const rootRef = useRef(null);
  const enabledOptions = useMemo(
    () => options.filter((option) => !option.disabled),
    [options],
  );
  const selected = options.find((option) => String(option.value) === String(value));
  const selectedLabel = selected?.label ?? '';
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized || normalized === selectedLabel.trim().toLocaleLowerCase()) {
      return enabledOptions;
    }
    return enabledOptions.filter((option) => (
      option.label.toLocaleLowerCase().includes(normalized)
    ));
  }, [enabledOptions, query, selectedLabel]);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(filteredOptions.length - 1, 0)));
  }, [filteredOptions.length]);

  const choose = (option) => {
    if (!option) return;
    setQuery(option.label);
    setOpen(false);
    onChange(option.value);
  };

  return (
    <span
      ref={rootRef}
      className="tk-search-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery(selectedLabel);
        }
      }}
    >
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && filteredOptions[activeIndex]
          ? `${listId}-option-${activeIndex}`
          : undefined}
        autoComplete="off"
        className="tk-text-field"
        data-testid={testId}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onFocus={(event) => {
          setOpen(true);
          event.currentTarget.select();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            choose(filteredOptions[activeIndex]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            setQuery(selectedLabel);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        type="text"
        value={query}
      />
      <button
        aria-label={open ? copy.close : copy.showOptions}
        className="tk-search-select__toggle"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        tabIndex={-1}
        type="button"
      >
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="tk-search-select__list" id={listId} role="listbox">
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <button
              key={String(option.value)}
              aria-selected={String(option.value) === String(value)}
              className="tk-search-select__option"
              data-active={index === activeIndex || undefined}
              id={`${listId}-option-${index}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              {String(option.value) === String(value) && <Icon name="check" />}
            </button>
          )) : (
            <span className="tk-search-select__empty">{copy.noMatchingEntries}</span>
          )}
        </div>
      )}
    </span>
  );
}

export function TextField({
  disabled = false, onCommit, placeholder, testId, value,
}) {
  return (
    <input
      type="text"
      className="tk-text-field"
      data-testid={testId}
      defaultValue={value}
      disabled={disabled}
      placeholder={placeholder}
      onBlur={(event) => onCommit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function SegmentedControl({
  disabled = false, onChange, options, testId, value,
}) {
  return (
    <div className="tk-segmented" data-testid={testId} role="group">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function channelToHex(channel) {
  return Math.round(Math.min(Math.max(channel, 0), 1) * 255).toString(16).padStart(2, '0');
}

/** value is an sRGB triplet [r, g, b] in 0..1 (the settings-schema shape). */
export function ColorWell({
  disabled = false, onChange, size = 'normal', testId, value,
}) {
  const hex = `#${channelToHex(value[0])}${channelToHex(value[1])}${channelToHex(value[2])}`;
  return (
    <span className="tk-color-well" data-size={size} style={{ background: hex }}>
      <input
        type="color"
        data-testid={testId}
        disabled={disabled}
        value={hex}
        onChange={(event) => {
          const raw = event.target.value.slice(1);
          onChange([
            parseInt(raw.slice(0, 2), 16) / 255,
            parseInt(raw.slice(2, 4), 16) / 255,
            parseInt(raw.slice(4, 6), 16) / 255,
          ]);
        }}
      />
    </span>
  );
}
