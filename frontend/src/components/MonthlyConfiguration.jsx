import { useEffect, useState } from 'react';
import DriversPanel from './DriversPanel.jsx';
import HousesPanel from './HousesPanel.jsx';
import CopyConfigurationPanel from './CopyConfigurationPanel.jsx';
import HouseUsagePanel from './HouseUsagePanel.jsx';
import ColorField from './ColorField.jsx';
import { ListSearch, useLongList } from './LongList.jsx';
import { isTimeInTurnRange, turnRangeNote } from '../../../shared/availability.js';

const weekdays = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

// La búsqueda de reglas mira día, hora y tipo, que es como se describen.
function ruleName(rule) {
  return `${weekdays[rule.weekday] || ''} ${rule.time} ${rule.type}`.trim();
}

function newRule() {
  return {
    id: crypto.randomUUID(),
    weekday: 1,
    time: '09:00',
    type: 'Congregacional',
    active: true,
    color: '',
  };
}

export default function MonthlyConfiguration({ configuration, drivers, driverRotations, houses, houseRotations, outings, groups = [], types = [], year, month, onSave, onSaveDriver, onAvailabilityChange, onDriverRotationChange, onSaveHouse, onHouseAvailabilityChange, onHouseRotationChange, onCopy, onClose, saving }) {
  const [rules, setRules] = useState(configuration);
  const list = useLongList(rules, ruleName);
  const typeNames = types.map((type) => type.name);

  useEffect(() => {
    setRules(configuration);
  }, [configuration]);

  function updateRule(id, field, value) {
    setRules((currentRules) => currentRules.map((rule) => (
      rule.id === id ? { ...rule, [field]: value } : rule
    )));
  }

  function submit(event) {
    event.preventDefault();
    onSave(rules);
  }

  return (
    <section className="panel configuration-panel" aria-labelledby="configuration-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reglas recurrentes</p>
          <h2 id="configuration-title">Configuración del mes</h2>
        </div>
        <button className="button button-quiet" type="button" onClick={onClose}>Cerrar</button>
      </div>

      <p className="section-note">
        El tipo define si la salida es congregacional o de un grupo, y decide la rotación de casas.
        El lugar de encuentro se asigna a cada salida concreta. Las salidas manuales se conservan.
      </p>

      <div className="monthly-rules-section">
        <h3>Reglas de salidas</h3>
      <form onSubmit={submit}>
        <ListSearch list={list} label="Buscar reglas" />
        <div className="rule-list">
          {list.visible.map((rule) => (
            <div className="rule-row" key={rule.id}>
              <label className="field">
                <span>Día</span>
                <select
                  value={rule.weekday}
                  onChange={(event) => updateRule(rule.id, 'weekday', Number(event.target.value))}
                >
                  {weekdays.map((weekday, index) => <option value={index} key={weekday}>{weekday}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Hora</span>
                <input type="time" value={rule.time} required onChange={(event) => updateRule(rule.id, 'time', event.target.value)} />
                {!isTimeInTurnRange(rule.time) && (
                  <small className="turn-warning">
                    ⚠ {rule.time} está fuera de los turnos ({turnRangeNote()}). Esta salida no tendrá conductor automático.
                  </small>
                )}
              </label>
              <label className="field">
                <span>Tipo</span>
                <select value={rule.type} required onChange={(event) => updateRule(rule.id, 'type', event.target.value)}>
                  {typeNames.map((name) => <option value={name} key={name}>{name}</option>)}
                </select>
              </label>
              <ColorField
                label="Color"
                value={rule.color || ''}
                hint="Se aplica a todas las salidas de esta regla."
                onChange={(color) => updateRule(rule.id, 'color', color)}
                onClear={() => updateRule(rule.id, 'color', '')}
              />
              <label className="active-field">
                <input type="checkbox" checked={rule.active} onChange={(event) => updateRule(rule.id, 'active', event.target.checked)} />
                Activa
              </label>
              <button
                className="button button-remove"
                type="button"
                aria-label="Eliminar regla"
                onClick={() => setRules((currentRules) => currentRules.filter((item) => item.id !== rule.id))}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>

        {rules.length === 0 && <p className="empty-note">No hay reglas configuradas para este mes.</p>}

        <div className="form-actions">
          <button className="button button-quiet" type="button" onClick={() => setRules((current) => [...current, newRule()])}>
            + Agregar regla
          </button>
          <button className="button button-primary" type="submit" disabled={saving}>Guardar y generar salidas</button>
        </div>
      </form>
      </div>

      <HousesPanel
        houses={houses}
        groups={groups}
        houseRotations={houseRotations}
        outings={outings}
        onSave={onSaveHouse}
        onAvailabilityChange={onHouseAvailabilityChange}
        onRotationChange={onHouseRotationChange}
        saving={saving}
      />
      <DriversPanel
        drivers={drivers}
        groups={groups}
        driverRotations={driverRotations}
        outings={outings}
        onSave={onSaveDriver}
        onAvailabilityChange={onAvailabilityChange}
        onRotationChange={onDriverRotationChange}
        saving={saving}
      />
      <CopyConfigurationPanel year={year} month={month} onCopy={onCopy} saving={saving} />
      <HouseUsagePanel outings={outings} houses={houses} />
    </section>
  );
}