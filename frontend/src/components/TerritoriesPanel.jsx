import { useState } from 'react';
import { ListSearch, useLongList } from './LongList.jsx';

const emptyTerritory = { name: '', active: true };

export default function TerritoriesPanel({ territories = [], onSave, onStatusChange, onDelete, saving }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyTerritory);
  const list = useLongList(territories, (territory) => territory.name);

  function editTerritory(territory) {
    setEditing(territory);
    setForm({ name: territory.name, active: territory.active });
  }

  async function submit(event) {
    event.preventDefault();
    const saved = await onSave(form, editing?.id);
    if (saved) {
      setEditing(null);
      setForm(emptyTerritory);
    }
  }

  return (
    <section className="territories-panel" aria-labelledby="territories-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Registro manual de territorios</p>
          <h3 id="territories-title">Territorios</h3>
        </div>
        {!editing && (
          <button className="button button-quiet" type="button" onClick={() => { setEditing('new'); setForm(emptyTerritory); }}>
            + Agregar territorio
          </button>
        )}
      </div>

      <p className="section-note">
        Puedes registrar números (38), varios números (38, 33) o textos especiales (REVISITAS, RURAL). La asignación a una salida es manual y no se calcula automáticamente.
      </p>

      {editing && (
        <form className="territory-form" onSubmit={submit}>
          <label className="field">
            <span>Número o nombre</span>
            <input
              required
              value={form.name}
              placeholder="38, 33 · REVISITAS · RURAL"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <div className="form-actions house-form-actions">
            <button className="button button-quiet" type="button" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="button button-primary" type="submit" disabled={saving}>Guardar territorio</button>
          </div>
        </form>
      )}

      {territories.length === 0 ? <p className="empty-note">Todavía no hay territorios registrados.</p> : (
        <>
          <ListSearch list={list} label="Buscar territorios" />
          {list.matches === 0 ? <p className="empty-note">Ningún territorio coincide con la búsqueda.</p> : (
        <div className="house-list">
          {list.visible.map((territory) => (
            <article className="house-row" key={territory.id}>
              <div className="house-details">
                <strong>{territory.name}</strong>
                <span className={territory.active ? 'availability-enabled' : 'availability-disabled'}>
                  {territory.active ? 'Registro activo' : 'Registro deshabilitado'}
                </span>
                <span>{territory.assignedCount} {territory.assignedCount === 1 ? 'salida usa este territorio' : 'salidas usan este territorio'}</span>
              </div>
              <div className="house-actions">
                <button className="text-button" type="button" onClick={() => editTerritory(territory)}>Editar</button>
                <button
                  className="text-button"
                  type="button"
                  disabled={saving}
                  onClick={() => onStatusChange(territory, !territory.active)}
                >
                  {territory.active ? 'Deshabilitar' : 'Habilitar'}
                </button>
                <button
                  className="text-button text-button-danger"
                  type="button"
                  disabled={saving || territory.assignedCount > 0}
                  title={territory.assignedCount > 0 ? 'Tiene salidas históricas; solo puede deshabilitarse.' : 'Eliminar registro sin historial'}
                  onClick={() => onDelete(territory)}
                >
                  Eliminar
                </button>
              </div>
              {!territory.active && territory.assignedCount > 0 && (
                <p className="driver-warning" role="status">
                  El territorio está deshabilitado, pero se conserva en {territory.assignedCount} salida(s) del historial.
                </p>
              )}
            </article>
          ))}
        </div>
          )}
        </>
      )}
    </section>
  );
}
