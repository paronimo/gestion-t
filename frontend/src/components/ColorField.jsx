// Selector de color sencillo: un <input type="color"> con un botón para
// quitarlo. No hay paletas propias ni nombres: el usuario elige el que quiere.

export const NO_COLOR = '';

export default function ColorField({ label, value, hint, onChange, onClear }) {
  const current = value || '#dcd5cb';

  return (
    <label className="field field-color">
      <span>{label}</span>
      <span className="color-input-row">
        <input
          type="color"
          value={current}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="color-preview" style={{ background: value || 'transparent' }} aria-hidden="true" />
        <button className="button button-quiet" type="button" onClick={() => onClear()}>
          {value ? 'Quitar' : 'Sin color'}
        </button>
      </span>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}
