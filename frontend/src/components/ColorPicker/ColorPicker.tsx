import { COLOR_PRESETS } from "../../types/tools";
import "./ColorPicker.css";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ color, onChange }: ColorPickerProps) {
  return (
    <div className="color-picker">
      <div className="color-picker__presets">
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`color-swatch${preset === color ? " color-swatch--active" : ""}`}
            style={{ backgroundColor: preset }}
            title={preset}
            aria-label={`Color ${preset}`}
            onClick={() => onChange(preset)}
          />
        ))}
      </div>
      <label className="color-picker__custom" title="Custom color">
        <input
          type="color"
          value={normalizeHex(color)}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom color"
        />
        <span
          className="color-picker__custom-swatch"
          style={{ backgroundColor: color }}
        />
      </label>
    </div>
  );
}

function normalizeHex(color: string): string {
  // <input type="color"> requires a strict #rrggbb value.
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return "#000000";
}
