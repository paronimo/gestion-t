import { useState } from 'react';
import { ListSearch, useLongList } from './LongList.jsx';

// Los grupos se derivan de los nombres de tipo: "Grupo 3" aporta el grupo 3.
// Agregar un grupo nuevo es agregar un tipo; no hay lista fija en el código.
export function groupIdsFromTypes(types = []) {
  const groups = new Set();
  for (const type of types) {
    const match = /^grupo\s*(\d+)$/i.exec((type.name || '').trim());
    if (match) groups.add(match[1]);
  }
  return [...groups].sort((first, second) => Number(first) - Number(second));
}

export default function OutingTypesPanel({ types = [], onSave, onStatusChange, onDelete, saving }) {
  const [name, setName] = useState('');
  const list = useLongList(types, (type) => type.name);

  async function submit(event) {
    event.preventDefault();
    const saved = await onSave({ name });
    if (saved) setName('');
  }

  return (
    <section className="types-panel" aria-labelledby="types-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Opciones de salida del cronograma</p>
          <h3 id="types-title">Tipos de salida</h3>
        </div>
      </div>

      <p className="section-note">
        El tipo es el único campo que define la salida. Al agregar un tipo como "Grupo 7", el grupo 7 queda disponible
        automáticamente para las casas, los conductores y las rotaciones, sin modificar el código.
      </p>

      <form className="type-form" onSubmit={submit}>
        <label className="field">
          <span>Nuevo tipo</span>
          <input
            required
            value={name}
            placeholder="Grupo 5 · Congregacional"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="form-actions house-form-actions">
          <button className="button button-primary" type="submit" disabled={saving}>Agregar tipo</button>
        </div>
      </form>

      <ListSearch list={list} label="Buscar tipos de salida" />
      {list.matches === 0 ? <p className="empty-note">Ningún tipo coincide con la búsqueda.</p> : (
      <div className="house-list">
        {list.visible.map((type) => (
          <article className="house-row" key={type.id}>
            <div className="house-details">
              <strong>{type.name}</strong>
              <span className={type.active ? 'availability-enabled' : 'availability-disabled'}>
                {type.active ? 'Activo' : 'Deshabilitado'}
              </span>
            </div>
            <div className="house-actions">
              <button className="text-button" type="button" disabled={saving} onClick={() => onStatusChange(type, !type.active)}>
                {type.active ? 'Deshabilitar' : 'Habilitar'}
              </button>
              <button
                className="text-button text-button-danger"
                type="button"
                disabled={saving || type.id === 'congregacional'}
                title={type.id === 'congregacional' ? 'El tipo congregacional no se elimina' : 'Eliminar tipo'}
                onClick={() => onDelete(type)}
              >
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>
      )}
    </section>
  );
}
