import { useState } from 'react';
import { ListSearch, useLongList } from './LongList.jsx';

const emptyLocation = { name: '', address: '', mapsUrl: '' };

export default function LocationsPanel({ locations = [], onSave, onStatusChange, onDelete, onAvailabilityChange, saving, mode = 'registry' }) {
  const registryMode = mode === 'registry';
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyLocation);
  const list = useLongList(locations, (location) => location.name);

  function editLocation(location) {
    setEditing(location);
    setForm({ name: location.name, address: location.address || '', mapsUrl: location.mapsUrl || '' });
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
    <section className="locations-panel" aria-labelledby="locations-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Lugares de encuentro que no son casas</p>
          <h3 id="locations-title">Ubicaciones</h3>
        </div>
        {!editing && (
          <button className="button button-quiet" type="button" onClick={() => { setEditing('new'); setForm(emptyLocation); }}>
            + Agregar ubicación
          </button>
        )}
      </div>

      <p className="section-note">
        Una ubicación puede ser una calle, una esquina, una plaza o cualquier otro punto de reunión. No pertenece a ningún grupo y aparece en la misma columna que las casas.
      </p>

      {editing && (
        <form className="location-form" onSubmit={submit}>
          <label className="field">
            <span>Nombre visible</span>
            <input
              required
              value={form.name}
              placeholder="C. 14C · Plaza de la Salud"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Dirección o descripción</span>
            <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </label>
          <label className="field">
            <span>URL de Google Maps</span>
            <input
              type="url"
              value={form.mapsUrl}
              placeholder="https://maps.google.com/..."
              onChange={(event) => setForm({ ...form, mapsUrl: event.target.value })}
            />
          </label>
          <div className="form-actions house-form-actions">
            <button className="button button-quiet" type="button" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="button button-primary" type="submit" disabled={saving}>Guardar ubicación</button>
          </div>
        </form>
      )}

      {locations.length === 0 ? <p className="empty-note">Todavía no hay ubicaciones registradas.</p> : (
        <>
          <ListSearch list={list} label="Buscar ubicaciones" />
          {list.matches === 0 ? <p className="empty-note">Ninguna ubicación coincide con la búsqueda.</p> : (
        <div className="house-list">
          {list.visible.map((location) => (
            <article className="house-row" key={location.id}>
              <div className="house-details">
                <strong>{location.name}</strong>
                {location.address && <span>{location.address}</span>}
                {location.mapsUrl && (
                  <a href={location.mapsUrl} target="_blank" rel="noreferrer">Ver en Google Maps</a>
                )}
                {registryMode ? (
                  <span className={location.active ? 'availability-enabled' : 'availability-disabled'}>
                    {location.active ? 'Registro activo' : 'Registro deshabilitado'}
                  </span>
                ) : (
                  <span className={location.available ? 'availability-enabled' : 'availability-disabled'}>
                    {location.available ? 'Disponible este mes' : 'No disponible este mes'}
                  </span>
                )}
                <span>{location.assignedCount} {location.assignedCount === 1 ? 'salida usa esta ubicación' : 'salidas usan esta ubicación'}</span>
              </div>
              <div className="house-actions">
                {registryMode ? (
                  <>
                    <button className="text-button" type="button" onClick={() => editLocation(location)}>Editar</button>
                    <button className="text-button" type="button" disabled={saving} onClick={() => onStatusChange(location, !location.active)}>
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
                  </>
                ) : (
                  <button
                    className="text-button"
                    type="button"
                    disabled={saving}
                    onClick={() => onAvailabilityChange(location, !location.available)}
                  >
                    {location.available ? 'Quitar este mes' : 'Habilitar este mes'}
                  </button>
                )}
              </div>
              {!registryMode && !location.available && location.assignedCount > 0 && (
                <p className="driver-warning" role="status">
                  La ubicación no está disponible este mes, pero se conserva en {location.assignedCount} salida(s).
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
