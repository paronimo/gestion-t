import { randomUUID } from 'node:crypto';
import {
  groupOfType,
  isAvailableInSlot,
  isCongregational,
  normalizeGroupValue,
  turnOfTime,
} from './domain.js';
import { normalizeColor } from '../../shared/colors.js';

const weekdays = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

export function weekdayForDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

// Semana natural que contiene la fecha, contada desde el lunes.
// Todas las fechas de una misma semana dan el mismo número, que es lo que
// hace posible falar de "semanas alternadas" en vez de "14 días".
function weekIndexOf(date) {
  const [year, month, day] = date.split('-').map(Number);
  // Elepoch en UTC: el lunes de esa semana es 4 días antes del jueves de referencia.
  const utc = Date.UTC(year, month - 1, day);
  const monday = new Date(utc - ((new Date(utc).getUTCDay() + 6) % 7) * 86400000);
  return Math.floor(monday.getTime() / (7 * 86400000));
}

function isElder(driver) {
  return driver?.category === 'Anciano';
}

function assignDrivers(outings, drivers, driverRotations, existingAssignments, preservedAssignments) {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const assignments = new Map();
  const rotationIndexes = {};

  // Una persona no anciana no vuelve a ser candidata si ya condujo en la semana
  // inmediatamente anterior. En la semana posterior sí puede.
  // Los ancianos no están sujetos a esta regla: siguen con sus listas y su rotación.
  function assignedPreviousWeek(driver, outing) {
    if (isElder(driver)) return false;
    const week = weekIndexOf(outing.date);
    return (assignments.get(driver.id) || []).some((date) => weekIndexOf(date) === week - 1);
  }

  function driverAvailable(driver, outing) {
    if (!driver.generalActive || !driver.monthlyEnabled) return false;
    // Sin turno (hora fuera de 06:00-12:00 y 13:00-21:00) nadie es candidato.
    if (!isAvailableInSlot(driver.slots, outing.weekdayIndex, turnOfTime(outing.time))) return false;
    return !assignedPreviousWeek(driver, outing);
  }

  for (const assignment of existingAssignments) {
    if (assignment.driverId && assignment.date) {
      const dates = assignments.get(assignment.driverId) || [];
      dates.push(assignment.date);
      assignments.set(assignment.driverId, dates);
    }
  }

  function addAssignment(driverId, date) {
    if (!driverId) return;
    const dates = assignments.get(driverId) || [];
    dates.push(date);
    assignments.set(driverId, dates);
  }

  function chooseDriver(candidateIds, rotationKey, outing) {
    // La lista completa, en el orden de la rotación, es la que avanza: si se
    // avanzara solo entre los elegibles, un conductor descartado por la regla de
    // semanas volvería a encabezar la lista y se repetiría.
    const ordered = [...new Set(candidateIds)]
      .map((id) => driversById.get(id))
      .filter(Boolean);
    if (ordered.length === 0) return null;

    const start = (rotationIndexes[rotationKey] || 0) % ordered.length;
    const rotated = [...ordered.slice(start), ...ordered.slice(0, start)];
    const chosen = rotated.find((driver) => driverAvailable(driver, outing)) || null;
    if (!chosen) return null;

    rotationIndexes[rotationKey] = (ordered.indexOf(chosen) + 1) % ordered.length;
    return chosen;
  }

  function chooseForOuting(outing) {
    const group = groupOfType(outing.type);
    const elderRotations = driverRotations.elders || {};
    const groupRotations = driverRotations.groupConductors || {};

    if (group) {
      const elders = elderRotations[group] || [];
      const groupConductors = groupRotations[group] || [];
      return chooseDriver(elders, `elders-${group}`, outing)
        || chooseDriver(groupConductors, `conductors-${group}`, outing);
    }

    const isWeekend = outing.weekday === 'sábado' || outing.weekday === 'domingo';
    const elders = Object.keys(elderRotations).sort().flatMap((key) => elderRotations[key] || []);
    const generalDrivers = drivers
      .filter((item) => item.category !== 'Anciano' && !item.group)
      .map((item) => item.id);

    // Sábado y domingo: primero los ancianos, como siempre.
    return isWeekend
      ? chooseDriver(elders, 'weekend-elders', outing)
        || chooseDriver(generalDrivers, 'weekend-general', outing)
      : chooseDriver([...elders, ...generalDrivers], 'general', outing);
  }

  // Si nadie cumple las condiciones, la salida queda sin conductor: no se
  // rompe la regla de semanas alternadas para llenar el hueco.
  return outings.map((outing) => {
    const preserved = preservedAssignments[`${outing.configId}:${outing.date}`];
    if (preserved) {
      // La corrección manual gana: se respeta y no se bloquea por la regla.
      chooseForOuting(outing);
      addAssignment(preserved.driverId, outing.date);
      return { ...outing, ...preserved, driverManualOverride: true };
    }

    const driver = chooseForOuting(outing);
    addAssignment(driver?.id, outing.date);
    return { ...outing, driverId: driver?.id || null, driver: '' };
  });
}

export function generateOutings(year, month, configuration, houseRotations = {}, driverOptions = {}) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const outings = [];
  const rotationIndexes = {};
  const sortedConfiguration = [...configuration].sort((first, second) => first.time.localeCompare(second.time));
  const preservedTerritories = driverOptions.preservedTerritories || {};
  const preservedPlaces = driverOptions.preservedPlaces || {};
  const preservedColors = driverOptions.preservedColors || {};

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

    for (const rule of sortedConfiguration) {
      if (!rule.active || rule.weekday !== weekdayIndex) continue;

      const group = groupOfType(rule.type);
      const rotation = isCongregational(rule.type) ? [] : houseRotations[group] || [];
      const houseId = rotation.length
        ? rotation[(rotationIndexes[group] || 0) % rotation.length]
        : null;
      if (houseId) rotationIndexes[group] = (rotationIndexes[group] || 0) + 1;

      const assignmentKey = `${rule.id}:${date}`;
      const preservedTerritory = preservedTerritories[assignmentKey];
      const preservedPlace = preservedPlaces[assignmentKey];
      const preservedColor = preservedColors[assignmentKey];

      outings.push({
        id: randomUUID(),
        date,
        weekday: weekdays[weekdayIndex],
        weekdayIndex,
        time: rule.time,
        type: rule.type,
        placeId: preservedPlace ? preservedPlace.placeId : houseId,
        placeType: preservedPlace ? preservedPlace.placeType : (houseId ? 'house' : 'location'),
        driver: '',
        driverId: null,
        territory: preservedTerritory === undefined ? '' : preservedTerritory,
        territoryManualOverride: preservedTerritory !== undefined,
        source: 'recurring',
        configId: rule.id,
        // El color de la salida tiene prioridad; si no hay, hereda el de su regla.
        color: normalizeColor(preservedColor || rule.color),
        colorManualOverride: Boolean(normalizeColor(preservedColor)),
        // Turno resuelto en la generación: null significa que la hora está fuera
        // de los rangos y no se puede asignar conductor automáticamente.
        turn: turnOfTime(rule.time),
        turnOutOfRange: turnOfTime(rule.time) === null,
      });
    }
  }

  const sortedOutings = outings.sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time));
  const withDrivers = assignDrivers(
    sortedOutings,
    driverOptions.drivers || [],
    driverOptions.rotations || {},
    driverOptions.existingAssignments || [],
    driverOptions.preservedAssignments || {},
  );

  // El índice de día es un dato interno del generador; no se persiste.
  return withDrivers.map(({ weekdayIndex, ...outing }) => outing);
}
