import { useEffect, useState } from 'react';
import { getMonthSummary } from '../services/api.js';

const months = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Cada categoría se copia por separado: se puede marcar solo una.
const copyOptions = [
  ['recurringRules', 'Reglas recurrentes de salidas'],
  ['groupConfigurations', 'Configuraciones de grupos'],
  ['houseAvailability', 'Casas disponibles'],
  ['houseRotations', 'Orden de rotación de casas'],
  ['driverAvailability', 'Conductores disponibles (por día y turno)'],
  ['driverRotations', 'Rotaciones de conductores'],
  ['locationAvailability', 'Lugares de encuentro disponibles'],
];

const defaultOptions = Object.fromEntries(copyOptions.map(([key]) => [key, true]));

function previousMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function monthLabel(year, month) {
  return `${months[month - 1]} ${year}`;
}

function hasExistingConfig(summary) {
  return Boolean(
    summary.rules > 0
    || summary.housesAvailable > 0
    || summary.houseRotationGroups > 0
    || summary.driversWithSlots > 0
    || summary.driverRotationGroups > 0
    || summary.recurringOutings > 0
  );
}

function describeSummary(summary) {
  const parts = [];
  if (summary.rules > 0) parts.push(`${summary.rules} regla(s)`);
  if (summary.housesAvailable > 0) parts.push(`${summary.housesAvailable} casa(s) disponible(s)`);
  if (summary.driversWithSlots > 0) parts.push(`${summary.driversWithSlots} conductor(es) con turnos`);
  if (summary.recurringOutings > 0) parts.push(`${summary.recurringOutings} salida(s) recurrente(s)`);
  return parts.join(', ');
}

export default function CopyConfigurationPanel({ year, month, onCopy, saving }) {
  const previous = previousMonth(year, month);
  const [sourceYear, setSourceYear] = useState(previous.year);
  const [sourceMonth, setSourceMonth] = useState(previous.month);
  const [destinationYear, setDestinationYear] = useState(year);
  const [destinationMonth, setDestinationMonth] = useState(month);
  const [options, setOptions] = useState(defaultOptions);
  const [destinationSummary, setDestinationSummary] = useState(null);

  useEffect(() => {
    setSourceYear(previous.year);
    setSourceMonth(previous.month);
    setDestinationYear(year);
    setDestinationMonth(month);
  }, [year, month]);

  // Se consulta qué tiene el destino para poder avisar antes de sobrescribir.
  useEffect(() => {
    let active = true;
    getMonthSummary(destinationYear, destinationMonth)
      .then((summary) => { if (active) setDestinationSummary(summary); })
      .catch(() => { if (active) setDestinationSummary(null); });
    return () => { active = false; };
  }, [destinationYear, destinationMonth, saving]);

  function updateOption(option, checked) {
    setOptions((current) => ({ ...current, [option]: checked }));
  }

  const sameMonth = sourceYear === destinationYear && sourceMonth === destinationMonth;
  const nothingSelected = copyOptions.every(([key]) => !options[key]);

  function submit(event) {
    event.preventDefault();
    if (nothingSelected || sameMonth) return;

    // Solo se pregunta si el destino ya tiene algo que se pueda reemplazar.
    if (destinationSummary && hasExistingConfig(destinationSummary)) {
      const accepted = window.confirm(
        'El mes destino ya tiene configuración. ¿Desea reemplazar los elementos seleccionados?',
      );
      if (!accepted) return;
      onCopy(sourceYear, sourceMonth, destinationYear, destinationMonth, { ...options, overwrite: true });
      return;
    }

    onCopy(sourceYear, sourceMonth, destinationYear, destinationMonth, options);
  }

  return (
    <section className="copy-panel" aria-labelledby="copy-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reutilizar configuración</p>
          <h3 id="copy-title">Copiar configuración</h3>
        </div>
        <button
          className="button button-quiet"
          type="button"
          disabled={saving || nothingSelected}
          onClick={() => onCopy(previous.year, previous.month, year, month, { ...options, overwrite: true })}
        >
          Copiar configuración del mes anterior
        </button>
      </div>

      <form className="copy-form" onSubmit={submit}>
        <div className="copy-months">
          <label className="field">
            <span>Mes origen</span>
            <select value={sourceMonth} onChange={(event) => setSourceMonth(Number(event.target.value))}>
              {months.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Año origen</span>
            <input type="number" min="1900" max="9999" value={sourceYear} onChange={(event) => setSourceYear(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Mes destino</span>
            <select value={destinationMonth} onChange={(event) => setDestinationMonth(Number(event.target.value))}>
              {months.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Año destino</span>
            <input type="number" min="1900" max="9999" value={destinationYear} onChange={(event) => setDestinationYear(Number(event.target.value))} />
          </label>
        </div>

        <fieldset className="copy-options">
          <legend>Qué desea copiar</legend>
          {copyOptions.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(event) => updateOption(key, event.target.checked)}
              />{' '}
              {label}
            </label>
          ))}
        </fieldset>

        {sameMonth && <p className="driver-warning">El mes origen y el destino deben ser distintos.</p>}

        {destinationSummary && hasExistingConfig(destinationSummary) && (
          <p className="section-note">
            {monthLabel(destinationYear, destinationMonth)} ya tiene: {describeSummary(destinationSummary)}.
            Se pedirá confirmación antes de reemplazar.
          </p>
        )}

        <div className="form-actions copy-actions">
          <button className="button button-primary" type="submit" disabled={saving || nothingSelected || sameMonth}>
            Copiar configuración
          </button>
        </div>
      </form>

      <p className="section-note">
        No se copian las salidas individuales ni las fechas: el mes destino calcula las suyas con su propio calendario.
        La disponibilidad por día y turno se combina: el destino conserva los turnos que ya tenía y suma los del origen.
      </p>
    </section>
  );
}
