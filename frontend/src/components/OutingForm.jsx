import { useEffect, useState } from 'react';
import { getAvailableDrivers, getAvailableHouses } from '../services/api.js';
import ColorField from './ColorField.jsx';
import Modal from './Modal.jsx';
import { repeatedTerritories } from '../../../shared/territories.js';
import { suggestLocations } from '../../../shared/territoryLocations.js';
import { isTimeInTurnRange, turnRangeNote, turnOfTime } from '../../../shared/availability.js';

export default function OutingForm({
  outing,
  defaultDate,
  year,
  month,
  territories = [],
  types = [],
  locations = [],
  monthOutings = [],
  territoryLocations = [],
  onSave,
  onCancel,
  saving,
}) {
  const [values, setValues] = useState({
    date: outing?.date || defaultDate,
    time: outing?.time || '09:00',
    type: outing?.type || types[0]?.name || 'Congregacional',
    driverId: outing?.driverId || '',
    legacyDriver: outing && !outing.driverId ? outing.driverName || outing.driver || '' : '',
    placeId: outing?.placeId || '',
    territory: outing?.territory || '',
    color: outing?.color || '',
  });
  const [driverOptions, setDriverOptions] = useState([]);
  const [currentDriver, setCurrentDriver] = useState(null);
  const [driverError, setDriverError] = useState('');
  const [houseOptions, setHouseOptions] = useState([]);
  const [currentHouse, setCurrentHouse] = useState(null);
  const [houseError, setHouseError] = useState('');

  useEffect(() => {
    let active = true;
    getAvailableDrivers(year, month, {
      date: values.date,
      time: values.time,
      type: values.type,
      currentDriverId: values.driverId,
    })
      .then((result) => {
        if (active) {
          setDriverOptions(result.drivers);
          setCurrentDriver(result.currentDriver);
          setDriverError('');
        }
      })
      .catch((error) => {
        if (active) {
          setDriverOptions([]);
          setCurrentDriver(null);
          setDriverError(error.message);
        }
      });

    return () => { active = false; };
  }, [year, month, values.date, values.time, values.type, values.driverId]);

  useEffect(() => {
    let active = true;
    getAvailableHouses(year, month, {
      date: values.date,
      type: values.type,
      currentHouseId: values.placeId,
    })
      .then((result) => {
        if (active) {
          setHouseOptions(result.houses);
          setCurrentHouse(result.currentHouse);
          setHouseError('');
        }
      })
      .catch((error) => {
        if (active) {
          setHouseOptions([]);
          setCurrentHouse(null);
          setHouseError(error.message);
        }
      });

    return () => { active = false; };
  }, [year, month, values.date, values.type, values.placeId]);

  // Solo advertencia: el mismo territorio puede usarse otra vez si el usuario lo decide.
  const repeated = repeatedTerritories(values.territory, monthOutings, outing?.id);

  // Una hora fuera de los rangos no se puede asignar a mañana ni a tarde.
  const turn = turnOfTime(values.time);
  const outOfRange = !isTimeInTurnRange(values.time);

  // Sugerencias: solo se muestran. Nunca se colocan solas.
  const suggestions = suggestLocations(values.territory, territoryLocations)
    .filter(({ location }) => location.id !== values.placeId);

  function useSuggestion(location) {
    setValues((current) => ({ ...current, placeId: location.id }));
  }

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({
      ...values,
      driverId: values.driverId || null,
      driver: values.driverId ? '' : values.legacyDriver,
      placeId: values.placeId || null,
      placeType: values.placeId ? 'house' : 'location',
    });
  }

  const currentDriverAvailable = driverOptions.some((driver) => driver.id === currentDriver?.id);
  const currentHouseAvailable = houseOptions.some((house) => house.id === currentHouse?.id);
  const selectedDriver = values.driverId || (values.legacyDriver ? 'legacy' : '');
  const typeNames = types.map((type) => type.name);
  const availableLocations = locations.filter((location) => (
    location.active || location.id === values.placeId
  ));
  // La casa ya asignada se mantiene visible aunque este mes no sea elegible.
  const availableHouses = currentHouse && !currentHouseAvailable
    ? [...houseOptions, currentHouse]
    : houseOptions;

  return (
    <Modal
      title={outing ? 'Editar salida' : 'Agregar salida manual'}
      description={outing
        ? `Solo se modifica esta salida${outing.source === 'recurring' ? '; la regla recurrente queda igual' : ''}.`
        : 'Se agrega al cronograma del mes.'}
      onClose={onCancel}
      labelledBy="outing-form-title"
    >
      <form className="outing-form" onSubmit={submit}>
        {outing?.source === 'recurring' && (
          <p className="modal-note">
            Esta salida viene de una regla recurrente. Al guardar solo se cambia esta fecha;
            las demás salidas y la regla se mantienen.
          </p>
        )}
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={values.date} required onChange={(event) => update('date', event.target.value)} />
        </label>
        <label className="field">
          <span>Hora</span>
          <input type="time" value={values.time} required onChange={(event) => update('time', event.target.value)} />
          {outOfRange && (
            <small className="turn-warning">
              ⚠ {values.time} está fuera de los turnos ({turnRangeNote()}). No se podrá asignar conductor automáticamente.
            </small>
          )}
          {!outOfRange && (
            <small className="field-hint">Turno: {turn === 'morning' ? 'mañana' : 'tarde'}.</small>
          )}
        </label>
        <label className="field">
          <span>Tipo</span>
          <select value={values.type} required onChange={(event) => update('type', event.target.value)}>
            {typeNames.map((name) => <option value={name} key={name}>{name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Conductor</span>
          <select
            value={selectedDriver}
            onChange={(event) => setValues((current) => ({
              ...current,
              driverId: event.target.value === 'legacy' ? '' : event.target.value,
              legacyDriver: event.target.value === 'legacy' ? current.legacyDriver : '',
            }))}
          >
            <option value="">Sin definir</option>
            {values.legacyDriver && <option value="legacy">{values.legacyDriver} (asignación anterior)</option>}
            {driverOptions.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.firstName} {driver.lastName}</option>
            ))}
            {currentDriver && !currentDriverAvailable && (
              <option value={currentDriver.id}>{currentDriver.firstName} {currentDriver.lastName} (no disponible)</option>
            )}
          </select>
        </label>

        <label className="field field-place">
          <span>Lugar de Encuentro</span>
          <select value={values.placeId} onChange={(event) => update('placeId', event.target.value)}>
            <option value="">Sin definir</option>
            {availableHouses.length > 0 && (
              <optgroup label="Casas">
                {availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
              </optgroup>
            )}
            {availableLocations.length > 0 && (
              <optgroup label="Ubicaciones">
                {availableLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </optgroup>
            )}
            {territoryLocations.length > 0 && (
              <optgroup label="Ubicaciones por territorio">
                {territoryLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </optgroup>
            )}
          </select>
          <small className="field-hint">Puede ser una casa o una ubicación; ambas se muestran en la misma columna.</small>

          {suggestions.length > 0 && (
            <div className="place-suggestions" role="group" aria-label="Ubicaciones sugeridas por territorio">
              {suggestions.map(({ location, territory }) => (
                <div className="place-suggestion" key={location.id}>
                  <div className="place-suggestion-text">
                    <strong>💡 {location.name}</strong>
                    <span>Territorio cercano: {territory}</span>
                  </div>
                  <button
                    className="button button-add"
                    type="button"
                    onClick={() => useSuggestion(location)}
                  >
                    Generar solo
                  </button>
                </div>
              ))}
              <small className="field-hint">
                Sugerencia nada más: no se coloca ningún lugar hasta que elijas una.
              </small>
            </div>
          )}
        </label>

        <label className="field">
          <span>Territorio</span>
          <input
            list="territory-options"
            value={values.territory}
            placeholder="38, 33 · REVISITAS · RURAL"
            onChange={(event) => update('territory', event.target.value)}
          />
          <datalist id="territory-options">
            {territories.filter((territory) => territory.active).map((territory) => (
              <option key={territory.id} value={territory.name} />
            ))}
          </datalist>
          <small className="field-hint">Elige del registro o escribe varios separados por coma. La asignación es solo de esta salida.</small>
          {repeated.length > 0 && (
            <p className="territory-warning" role="status">
              ⚠ {repeated.length === 1
                ? `El territorio ${repeated[0]} ya está asignado a otra salida este mes.`
                : `Los territorios ${repeated.join(', ')} ya están asignados a otras salidas este mes.`}
              {' '}Puedes guardarlo igual si corresponde.
            </p>
          )}
        </label>

        <ColorField
          label="Color"
          value={values.color}
          hint="Tiene prioridad sobre el color de la regla; sin color se usa el de su regla."
          onChange={(color) => update('color', color)}
          onClear={() => update('color', '')}
        />

        {driverError && <p className="driver-warning">No se pudo cargar la lista de conductores: {driverError}</p>}
        {currentDriver && !currentDriverAvailable && (
          <p className="driver-warning">El conductor asignado no está habilitado para esta salida. La asignación se conserva hasta que la cambies.</p>
        )}
        {houseError && <p className="driver-warning">No se pudo cargar la lista de casas: {houseError}</p>}
        {currentHouse && !currentHouseAvailable && (
          <p className="driver-warning">La casa asignada ya no está disponible para esta salida. La asignación se conserva hasta que la cambies.</p>
        )}
        <div className="form-actions form-actions-end">
          <button className="button button-quiet" type="button" onClick={onCancel}>Cancelar</button>
          <button className="button button-primary" type="submit" disabled={saving}>
            {outing ? 'Guardar cambios' : 'Guardar salida'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
