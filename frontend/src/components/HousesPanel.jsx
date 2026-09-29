import { useState } from 'react';
import { ListSearch, useLongList } from './LongList.jsx';

const emptyHouse = { name: '', group: '', congregationalWeekend: false };

export default function HousesPanel({ houses, groups = [], outings = [], houseRotations = {}, onSave, onAvailabilityChange, onRotationChange, onGeneralStatusChange, onDelete, saving, mode = 'monthly' }) {
  const registryMode = mode === 'registry';
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyHouse);
  const list = useLongList(houses, (house) => house.name);

  function editHouse(house) {
    setEditing(house);
    setForm({
      name: house.name,
      group: house.group || '',
      congregationalWeekend: house.congregationalWeekend,
      active: house.active,
    });
  }

  async function submit(event) {
    event.preventDefault();
    const saved = await onSave(form, editing?.id);
    if (saved) {
      setEditing(null);
      setForm(emptyHouse);
    }
  }

  function rotationHouses(group) {
    const houseById = new Map(houses.map((house) => [house.id, house]));
    return (houseRotations[group] || []).map((id) => houseById.get(id)).filter(Boolean);
  }

  function moveRotationHouse(group, index, direction) {
    const order = [...(houseRotations[group] || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
    onRotationChange(group, order);
  }

  return (
    <section className="houses-panel" aria-labelledby="houses-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Registro y disponibilidad mensual</p>
          <h3 id="houses-title">{registryMode ? 'Casas registradas' : 'Casas disponibles'}</h3>
        </div>
        {registryMode && !editing && (
          <button className="button button-quiet" type="button" onClick={() => { setEditing('new'); setForm(emptyHouse); }}>
            + Agregar casa
          </button>
        )}
      </div>

      <p className="section-note">
        {registryMode
          ? 'El registro general se puede reutilizar y su disponibilidad se configura por separado en cada mes.'
          : 'El estado de cada casa se guarda para este mes y no modifica los demás.'}
      </p>

      {registryMode && editing && (
        <form className="house-form" onSubmit={submit}>
          <label className="field">
            <span>Nombre de la casa</span>
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Grupo</span>
            <select value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })}>
              <option value="">Sin grupo</option>
              {groups.map((group) => <option value={group} key={group}>Grupo {group}</option>)}
            </select>
          </label>
          <label className="house-congregational-option">
            <input
              type="checkbox"
              checked={form.congregationalWeekend}
              onChange={(event) => setForm({ ...form, congregationalWeekend: event.target.checked })}
            />
            También puede usarse en salidas congregacionales de fin de semana
          </label>
          <div className="form-actions house-form-actions">
            <button className="button button-quiet" type="button" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="button button-primary" type="submit" disabled={saving}>Guardar casa</button>
          </div>
        </form>
      )}

      {!registryMode && (
        <div className="house-rotations" aria-label="Rotación de casas por grupo">
          <h4>Orden de rotación por grupo</h4>
          <p className="section-note">Cada casa rota solo dentro del grupo al que pertenece. Las salidas congregacionales pueden usar cualquier casa habilitada para ellas.</p>
          {groups.length === 0 && <p className="empty-note">Todavía no hay grupos definidos. Agregá un tipo como "Grupo 1" en la pestaña Administración.</p>}
          {groups.map((group) => {
            const orderedHouses = rotationHouses(group);
            const orderedIds = houseRotations[group] || [];
            const candidates = houses.filter((house) => (
              (house.group || '').replace(/^grupo\s*/i, '') === group
              && house.generalActive
              && house.available
              && !orderedIds.includes(house.id)
            ));

            return (
              <section className="rotation-group" key={group} aria-label={`Grupo ${group} rotación`}>
                <div className="rotation-group-heading">
                  <strong>Grupo {group}</strong>
                  <select
                    aria-label={`Agregar casa a Grupo ${group}`}
                    value=""
                    disabled={saving || candidates.length === 0}
                    onChange={(event) => {
                      if (event.target.value) onRotationChange(group, [...orderedIds, event.target.value]);
                    }}
                  >
                    <option value="">Agregar casa disponible...</option>
                    {candidates.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
                  </select>
                </div>
                {orderedHouses.length === 0 ? <p className="empty-note">No hay casas en esta rotación.</p> : (
                  <ol className="rotation-list">
                    {orderedHouses.map((house, index) => (
                      <li key={house.id}>
                        <span className="rotation-number">{index + 1}</span>
                        <span className="rotation-name">{house.name}</span>
                        {(!house.generalActive || !house.available) && <span className="availability-disabled">No elegible este mes</span>}
                        <div className="rotation-actions">
                          <button className="text-button" type="button" disabled={saving || index === 0} aria-label={`Subir ${house.name}`} onClick={() => moveRotationHouse(group, index, -1)}>Subir</button>
                          <button className="text-button" type="button" disabled={saving || index === orderedHouses.length - 1} aria-label={`Bajar ${house.name}`} onClick={() => moveRotationHouse(group, index, 1)}>Bajar</button>
                          <button className="text-button text-button-danger" type="button" disabled={saving} aria-label={`Quitar ${house.name} de la rotación`} onClick={() => onRotationChange(group, orderedIds.filter((id) => id !== house.id))}>Quitar</button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}

      {houses.length === 0 ? <p className="empty-note">Todavía no hay casas registradas.</p> : (
        <>
          <ListSearch list={list} label="Buscar casas" />
          {list.matches === 0 ? <p className="empty-note">Ninguna casa coincide con la búsqueda.</p> : (
        <div className="house-list">
          {list.visible.map((house) => {
            const assignedCount = outings.filter((outing) => outing.houseId === house.id).length;
            return (
              <article className="house-row" key={house.id}>
                <div className="house-details">
                  <strong>{house.name}</strong>
                  <span>{house.group ? `Grupo ${house.group.replace(/^grupo\s*/i, '')}` : 'Sin grupo'}</span>
                  <span>{house.congregationalWeekend ? 'Disponible para salidas congregacionales de fin de semana' : 'Uso de fin de semana no habilitado'}</span>
                  {registryMode ? (
                    <span className={house.active ? 'availability-enabled' : 'availability-disabled'}>
                      {house.active ? 'Registro activo' : 'Registro inactivo'}
                    </span>
                  ) : (
                    <>
                      <span className={house.available ? 'availability-enabled' : 'availability-disabled'}>
                        {house.available ? 'Disponible este mes' : 'No disponible este mes'}
                      </span>
                      {!house.generalActive && <span className="availability-disabled">Registro general inactivo</span>}
                    </>
                  )}
                </div>
                <div className="house-actions">
                  {registryMode ? (
                    <>
                      <button className="text-button" type="button" onClick={() => editHouse(house)}>Editar</button>
                      <button
                        className="text-button"
                        type="button"
                        disabled={saving}
                        onClick={() => onGeneralStatusChange(house, !house.active)}
                      >
                        {house.active ? 'Deshabilitar registro' : 'Habilitar registro'}
                      </button>
                      <button
                        className="text-button text-button-danger"
                        type="button"
                        disabled={saving || house.assignedCount > 0}
                        title={house.assignedCount > 0 ? 'Tiene asignaciones históricas; solo puede deshabilitarse.' : 'Eliminar registro sin historial'}
                        onClick={() => onDelete(house)}
                      >
                        Eliminar
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-button"
                      type="button"
                      disabled={saving}
                      onClick={() => onAvailabilityChange(house, !house.available)}
                    >
                      {house.available ? 'Quitar este mes' : 'Habilitar este mes'}
                    </button>
                  )}
                </div>
                {((registryMode && !house.active) || (!registryMode && !house.available)) && (registryMode ? house.assignedCount : assignedCount) > 0 && (
                  <p className="driver-warning" role="status">
                    Tiene {registryMode ? house.assignedCount : assignedCount} { (registryMode ? house.assignedCount : assignedCount) === 1 ? 'salida asignada' : 'salidas asignadas' }{registryMode ? ' en el historial' : ' este mes'}. La asignación se conserva.
                  </p>
                )}
              </article>
            );
          })}
        </div>
          )}
        </>
      )}
    </section>
  );
}