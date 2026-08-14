import { BRUSH_SIZE_PRESETS } from "../../types/tools";
import "./BrushControls.css";

interface BrushControlsProps {
  size: number;
  onChange: (size: number) => void;
  color: string;
}

export function BrushControls({ size, onChange, color }: BrushControlsProps) {
  return (
    <div className="brush-controls">
      <div className="brush-controls__preview" title={`${size}px`}>
        <span
          className="brush-controls__dot"
          style={{
            width: Math.min(size, 28),
            height: Math.min(size, 28),
            backgroundColor: color,
          }}
        />
      </div>
      <input
        className="brush-controls__slider"
        type="range"
        min={1}
        max={64}
        step={1}
        value={size}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Brush size"
      />
      <div className="brush-controls__presets">
        {BRUSH_SIZE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`brush-preset${preset === size ? " brush-preset--active" : ""}`}
            onClick={() => onChange(preset)}
            title={`${preset}px`}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
