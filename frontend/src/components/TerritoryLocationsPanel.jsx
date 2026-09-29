import { useState } from 'react';
import { ListSearch, useLongList } from './LongList.jsx';

const emptyLocation = { name: '', territories: '', mapsUrl: '' };

// Alta, edición y baja de ubicaciones con sus territorios cercanos.
// La relación es manual: no se calculan distancias ni se asigna nada solo.
export default function TerritoryLocationsPanel({
  territoryLocations = [],
  onSave,
  onStatusChange,
  onDelete,
  saving,
}) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyLocation);
  const list = useLongList(territoryLocations, (location) => location.name);

  function editLocation(location) {
    setEditing(location);
    setForm({
      name: location.name,
      territories: location.territories || '',
      mapsUrl: location.mapsUrl || '',
    });
  }

  async function submit(event) {
    event.preventDefault();
    const saved = await onSave(form, editing?.id);
    if (saved) {
      setEditing(null);
      setForm(emptyLocation);
    }
  }

  return (
    <section className="territory-locations-panel" aria-labelledby="territory-locations-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lugares convenientes para cada territorio</p>
          <h3 id="territory-locations-title">Ubicaciones por territorio</h3>
        </div>
        {!editing && (
          <button className="button button-quiet" type="button" onClick={() => { setEditing('new'); setForm(emptyLocation); }}>
            + Agregar ubicación
          </button>
        )}
      </div>

      <p className="section-note">
        Relaciona una ubicación con los territorios cercanos. Al escribir un territorio en una salida,
        el sistema muestra las ubicaciones relacionadas como sugerencia, pero nunca las coloca solo.
        El enlace de Google Maps es opcional.
      </p>

      {editing && (
        <form className="territory-location-form" onSubmit={submit}>
          <label className="field">
            <span>Nombre de la ubicación</span>
            <input
              required
              value={form.name}
              placeholder="Plaza de la Salud"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Territorios cercanos</span>
            <input
              required
              value={form.territories}
              placeholder="1, 2, 3, 4"
              onChange={(event) => setForm({ ...form, territories: event.target.value })}
            />
            <small className="field-hint">Uno o varios, separados por coma.</small>
          </label>
          <label className="field">
            <span>URL de Google Maps</span>
            <input
              type="url"
              value={form.mapsUrl}
              placeholder="Opcional"
              onChange={(event) => setForm({ ...form, mapsUrl: event.target.value })}
            />
          </label>
          <div className="form-actions house-form-actions">
            <button className="button button-quiet" type="button" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="button button-primary" type="submit" disabled={saving}>Guardar ubicación</button>
          </div>
        </form>
      )}

      {territoryLocations.length === 0
        ? <p className="empty-note">Todavía no hay ubicaciones por territorio registradas.</p>
        : (
          <>
            <ListSearch list={list} label="Buscar ubicaciones por territorio" />
            {list.matches === 0
              ? <p className="empty-note">Ninguna ubicación coincide con la búsqueda.</p>
              : (
                <div className="house-list">
                  {list.visible.map((location) => (
                    <article className="house-row" key={location.id}>
                      <div className="house-details">
                        <strong>{location.name}</strong>
                        <span>Territorios: {location.territories || '—'}</span>
                        {location.mapsUrl && (
                          <a href={location.mapsUrl} target="_blank" rel="noreferrer">Ver en Google Maps</a>
                        )}
                        <span className={location.active ? 'availability-enabled' : 'availability-disabled'}>
                          {location.active ? 'Registro activo' : 'Registro deshabilitado'}
                        </span>
                      </div>
                      <div className="house-actions">
                        <button className="text-button" type="button" onClick={() => editLocation(location)}>Editar</button>
                        <button
                          className="text-button"
                          type="button"
                          disabled={saving}
                          onClick={() => onStatusChange(location, !location.active)}
                        >
                          {location.active ? 'Deshabilitar' : 'Habilitar'}
                        </button>
                        <button
                          className="text-button text-button-danger"
                          type="button"
                          disabled={saving || location.assignedCount > 0}
                          title={location.assignedCount > 0 ? 'Tiene salidas históricas; solo puede deshabilitarse.' : 'Eliminar registro sin historial'}
                          onClick={() => onDelete(location)}
                        >
                          Eliminar
                        </button>
                      </div>
                      {!location.active && location.assignedCount > 0 && (
                        <p className="driver-warning" role="status">
                          Está deshabilitada, pero se conserva en {location.assignedCount} salida(s) del historial.
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
