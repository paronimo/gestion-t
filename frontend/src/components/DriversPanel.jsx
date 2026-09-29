import { useState } from 'react';
import { CONFIGURABLE_WEEKDAYS, TURN_LABELS, TURNS, slotKey } from '../../../shared/availability.js';
import { ListSearch, useLongList } from './LongList.jsx';

const categories = ['Anciano', 'Siervo ministerial', 'Publicador', 'Precursor'];

const emptyDriver = { firstName: '', lastName: '', category: 'Publicador', group: '' };

// La búsqueda del panel de conductores mira nombre y apellido.
const driverName = (driver) => `${driver.firstName || ''} ${driver.lastName || ''}`.trim();

function summarize(slots) {
  const enabled = Object.entries(slots || {}).filter(([, value]) => value);
  if (enabled.length === 0) return 'Sin turnos este mes';
  return `${enabled.length} ${enabled.length === 1 ? 'turno' : 'turnos'}`;
}

export default function DriversPanel({
  drivers,
  groups = [],
  outings = [],
  driverRotations = { elders: {}, groupConductors: {} },
  onSave,
  onAvailabilityChange,
  onRotationChange,
  onGeneralStatusChange,
  onDelete,
  saving,
  mode = 'monthly',
}) {
  const registryMode = mode === 'registry';
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyDriver);
  const list = useLongList(drivers, driverName);

  function editDriver(driver) {
    setEditing(driver);
    setForm({
      firstName: driver.firstName,
      lastName: driver.lastName,
      category: driver.category,
      group: driver.group || '',
    });
  }

  async function submit(event) {
    event.preventDefault();
    const saved = await onSave(form, editing?.id);
    if (saved) {
      setEditing(null);
      setForm(emptyDriver);
    }
  }

  function toggleSlot(driver, weekday, turn, checked) {
    const next = { ...driver.slots };
    if (checked) {
      next[slotKey(weekday, turn)] = true;
    } else {
      delete next[slotKey(weekday, turn)];
    }
    onAvailabilityChange(driver, next);
  }

  function driverOutingCount(driver) {
    const fullName = `${driver.firstName} ${driver.lastName}`.trim().toLocaleLowerCase();
    return outings.filter((outing) => (
      outing.driverId === driver.id
      || (!outing.driverId && (outing.driver || outing.driverName || '').trim().toLocaleLowerCase() === fullName)
    )).length;
  }

  function renderRotation(rotationType, group, title, candidates) {
    const ids = driverRotations[rotationType]?.[group] || [];
    const byId = new Map(drivers.map((driver) => [driver.id, driver]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    const availableCandidates = candidates.filter((driver) => driver.generalActive && !ids.includes(driver.id));

    return (
      <section className="driver-rotation-group" key={`${rotationType}-${group}`} aria-label={`${title} Grupo ${group}`}>
        <div className="rotation-group-heading">
          <strong>Grupo {group}</strong>
          <select
            aria-label={`Agregar ${title.toLocaleLowerCase()} a Grupo ${group}`}
            value=""
            disabled={saving || availableCandidates.length === 0}
            onChange={(event) => {
              if (event.target.value) onRotationChange(group, rotationType, [...ids, event.target.value]);
            }}
          >
            <option value="">Agregar persona...</option>
            {availableCandidates.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.firstName} {driver.lastName}</option>
            ))}
          </select>
        </div>
        {ordered.length === 0 ? <p className="empty-note">Sin personas en esta rotación.</p> : (
          <ol className="rotation-list">
            {ordered.map((driver, index) => (
              <li key={driver.id}>
                <span className="rotation-number">{index + 1}</span>
                <span className="rotation-name">{driver.firstName} {driver.lastName}</span>
                {!driver.active && <span className="availability-disabled">Sin turnos este mes</span>}
                <div className="rotation-actions">
                  <button className="text-button" type="button" disabled={saving || index === 0} aria-label={`Subir ${driver.firstName}`} onClick={() => {
                    const next = [...ids];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    onRotationChange(group, rotationType, next);
                  }}>Subir</button>
                  <button className="text-button" type="button" disabled={saving || index === ordered.length - 1} aria-label={`Bajar ${driver.firstName}`} onClick={() => {
                    const next = [...ids];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    onRotationChange(group, rotationType, next);
                  }}>Bajar</button>
                  <button className="text-button text-button-danger" type="button" disabled={saving} aria-label={`Quitar ${driver.firstName} de la rotación`} onClick={() => onRotationChange(group, rotationType, ids.filter((id) => id !== driver.id))}>Quitar</button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  // Una sola grilla para todos: conductor en la fila, día+turno en la columna.
  function renderAvailabilityTable() {
    if (drivers.length === 0) {
      return <p className="empty-note">Todavía no hay conductores en el registro general.</p>;
    }

    return (
      <>
        <ListSearch list={list} label="Buscar conductores" />
        {list.matches === 0 ? <p className="empty-note">Ningún conductor coincide con la búsqueda.</p> : (
      <div className="table-scroll">
        <table className="availability-grid">
          <caption className="visually-hidden">Días y turnos en que cada persona puede conducir este mes</caption>
          <thead>
            <tr>
              <th scope="col" className="driver-column">Conductor</th>
              {CONFIGURABLE_WEEKDAYS.map(({ weekday, short }) => TURNS.map((turn) => (
                <th scope="col" key={`${weekday}:${turn}`}>
                  {short} <span className="turn-label">{TURN_LABELS[turn]}</span>
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {list.visible.map((driver) => (
              <tr key={driver.id}>
                <th scope="row" className="driver-column">
                  <strong>{driver.firstName} {driver.lastName}</strong>
                  <span className="driver-category">{driver.category}{driver.group ? ` · Grupo ${driver.group}` : ''}</span>
                  <span className={driver.active ? 'availability-enabled' : 'availability-disabled'}>
                    {summarize(driver.slots)}
                  </span>
                  {!driver.generalActive && <span className="availability-disabled">Registro general inactivo</span>}
                </th>
                {CONFIGURABLE_WEEKDAYS.map(({ weekday, label }) => TURNS.map((turn) => {
                  const key = slotKey(weekday, turn);
                  const on = driver.slots?.[key] === true;
                  return (
                    <td key={key} className={on ? 'slot-on' : 'slot-off'}>
                      <input
                        type="checkbox"
                        aria-label={`${driver.firstName} ${driver.lastName}, ${label} ${TURN_LABELS[turn]}`}
                        checked={on}
                        disabled={saving}
                        onChange={(event) => toggleSlot(driver, weekday, turn, event.target.checked)}
                      />
                    </td>
                  );
                }))}
                <td className="driver-row-actions">
                  <button
                    className="text-button"
                    type="button"
                    disabled={saving}
                    onClick={() => onAvailabilityChange(driver, driver.active ? {} : { '2:morning': true, '4:afternoon': true })}
                  >
                    {driver.active ? 'Quitar todo' : 'Habilitar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        )}
      </>
    );
  }

  function renderRegistryList() {
    if (drivers.length === 0) return <p className="empty-note">No hay conductores registrados.</p>;

    return (
      <>
        <ListSearch list={list} label="Buscar conductores" />
        {list.matches === 0 ? <p className="empty-note">Ningún conductor coincide con la búsqueda.</p> : (
      <div className="driver-list">
        {list.visible.map((driver) => (
          <article className="driver-row" key={driver.id}>
            <div className="driver-details">
              <strong>{driver.firstName} {driver.lastName}</strong>
              <span>{driver.category}{driver.group ? ` · Grupo ${driver.group}` : ''}</span>
              <span className={driver.active ? 'availability-enabled' : 'availability-disabled'}>
                {driver.active ? 'Registro activo' : 'Registro inactivo'}
              </span>
            </div>
            <div className="driver-actions">
              <button className="text-button" type="button" onClick={() => editDriver(driver)}>Editar</button>
              <button className="text-button" type="button" disabled={saving} onClick={() => onGeneralStatusChange(driver, !driver.active)}>
                {driver.active ? 'Deshabilitar registro' : 'Habilitar registro'}
              </button>
              <button
                className="text-button text-button-danger"
                type="button"
                disabled={saving || driver.assignedCount > 0}
                title={driver.assignedCount > 0 ? 'Tiene asignaciones históricas; solo puede deshabilitarse.' : 'Eliminar registro sin historial'}
                onClick={() => onDelete(driver)}
              >
                Eliminar
              </button>
            </div>
            {!driver.active && driver.assignedCount > 0 && (
              <p className="driver-warning" role="status">
                Tiene {driver.assignedCount} {driver.assignedCount === 1 ? 'salida asignada' : 'salidas asignadas'} en el historial. La asignación se conserva.
              </p>
            )}
          </article>
        ))}
      </div>
        )}
      </>
    );
  }

  const groupIds = groups.map((group) => group.id || group);
  const elders = drivers.filter((driver) => driver.category === 'Anciano');

  return (
    <section className="drivers-panel" aria-labelledby="drivers-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Registro y disponibilidad mensual</p>
          <h3 id="drivers-title">{registryMode ? 'Conductores registrados' : 'Conductores disponibles'}</h3>
        </div>
        {registryMode && !editing && (
          <button className="button button-quiet" type="button" onClick={() => { setEditing('new'); setForm(emptyDriver); }}>
            + Agregar conductor
          </button>
        )}
      </div>

      {registryMode ? (
        <p className="section-note">
          El registro es general. Los turnos en que cada persona puede conducir se configuran por separado para cada mes,
          dentro de la configuración del mes.
        </p>
      ) : (
        <p className="section-note">
          Marcá cada día y turno en que la persona puede conducir. Sirve para ancianos, siervos ministeriales,
          publicadores y precursores por igual. La hora exacta de la salida define si corresponde a la mañana o a la tarde.
        </p>
      )}

      {!registryMode && (
        <div className="driver-rotations">
          <h4>Rotación de conductores</h4>
          {groupIds.map((group) => renderRotation('elders', group, 'ancianos', elders.filter((driver) => driver.group === group)))}
          {groupIds.map((group) => renderRotation('groupConductors', group, 'conductores', drivers.filter((driver) => driver.category !== 'Anciano' && driver.group === group)))}
        </div>
      )}

      {registryMode && editing && (
        <form className="driver-form" onSubmit={submit}>
          <label className="field">
            <span>Nombre</span>
            <input required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          </label>
          <label className="field">
            <span>Apellido</span>
            <input required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          </label>
          <label className="field">
            <span>Categoría</span>
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, group: '' })}>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Grupo asociado</span>
            <select value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })}>
              <option value="">Sin grupo</option>
              {groupIds.map((group) => <option value={group} key={group}>Grupo {group}</option>)}
            </select>
          </label>
          <div className="form-actions driver-form-actions">
            <button className="button button-quiet" type="button" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="button button-primary" type="submit" disabled={saving}>Guardar conductor</button>
          </div>
        </form>
      )}

      {registryMode ? renderRegistryList() : (
        <>
          <h4>Disponibilidad por día y turno</h4>
          {renderAvailabilityTable()}
          {drivers.filter((driver) => !driver.active && driverOutingCount(driver) > 0).map((driver) => (
            <p className="driver-warning" role="status" key={driver.id}>
              {driver.firstName} {driver.lastName} no tiene turnos este mes, pero conserva {driverOutingCount(driver)} {driverOutingCount(driver) === 1 ? 'salida asignada' : 'salidas asignadas'}.
            </p>
          ))}
        </>
      )}
    </section>
  );
}
