import {
  formatLabPreviewHour,
  LAB_PREVIEW_TIME_PRESETS,
  labPreviewPresetForHour,
} from '../../previewEnvironmentContract.js';
import { IconButton, SegmentedControl } from './primitives.jsx';
import { ScrubValue, Slider } from './Slider.jsx';

const PRESET_OPTIONS = LAB_PREVIEW_TIME_PRESETS.map((entry) => ({
  label: entry.label,
  title: entry.id === 'day'
    ? `${entry.label} · ${formatLabPreviewHour(entry.hour)} · cool-blue reference shadows`
    : `${entry.label} · ${formatLabPreviewHour(entry.hour)}`,
  value: entry.id,
}));

export function LabTimeOfDayControl({
  autoCycle = false,
  hour,
  onAutoCycleChange,
  onHourChange,
}) {
  function setHour(value) {
    onAutoCycleChange?.(false);
    onHourChange(value);
  }

  function selectPreset(id) {
    const preset = LAB_PREVIEW_TIME_PRESETS.find((entry) => entry.id === id);
    if (preset) setHour(preset.hour);
  }

  return (
    <span
      className="tk-previewbar-time"
      data-testid="preview-time-of-day"
      title="Universal preview environment. Preview-only; never saved into this artifact."
    >
      <SegmentedControl
        onChange={selectPreset}
        options={PRESET_OPTIONS}
        testId="preview-time-presets"
        value={labPreviewPresetForHour(hour)}
      />
      <span className="tk-previewbar-slider">
        <span className="tk-previewbar-time-label">Time</span>
        <Slider
          max={24}
          min={0}
          onChange={setHour}
          step={0.25}
          testId="preview-time-slider"
          value={hour}
        />
        <span data-testid="preview-time-readout">
          <ScrubValue
            format={formatLabPreviewHour}
            max={24}
            min={0}
            onChange={setHour}
            step={0.25}
            value={hour}
          />
        </span>
      </span>
      <IconButton
        active={autoCycle}
        icon="play"
        label={autoCycle ? 'Freeze time of day' : 'Auto-cycle time of day'}
        onClick={() => onAutoCycleChange?.(!autoCycle)}
        testId="preview-time-autocycle"
      />
    </span>
  );
}
