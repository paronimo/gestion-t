import { randomUUID } from 'node:crypto';
import {
  groupOfType,
  isAvailableInSlot,
  isCongregational,
  normalizeGroupValue,
  turnOfTime,
} from './domain.js';

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

function dateDistance(firstDate, secondDate) {
  const [firstYear, firstMonth, firstDay] = firstDate.split('-').map(Number);
  const [secondYear, secondMonth, secondDay] = secondDate.split('-').map(Number);
  const first = Date.UTC(firstYear, firstMonth - 1, firstDay);
  const second = Date.UTC(secondYear, secondMonth - 1, secondDay);
  return Math.abs(first - second) / 86400000;
}

function driverAvailable(driver, outing) {
  if (!driver.generalActive || !driver.monthlyEnabled) return false;
  return isAvailableInSlot(driver.slots, outing.weekdayIndex, turnOfTime(outing.time));
}

function assignDrivers(outings, drivers, driverRotations, existingAssignments, preservedAssignments) {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const assignments = new Map();
  const rotationIndexes = {};

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

  function distanceSinceAssignment(driverId, date) {
    const dates = assignments.get(driverId) || [];
    return dates.length ? Math.min(...dates.map((assignedDate) => dateDistance(date, assignedDate))) : Infinity;
  }

  function chooseDriver(candidateIds, rotationKey, outing, weekOnly = false) {
    const eligible = [...new Set(candidateIds)]
      .map((id) => driversById.get(id))
      .filter((driver) => driver && driverAvailable(driver, outing));
    if (eligible.length === 0) return null;

    const start = (rotationIndexes[rotationKey] || 0) % eligible.length;
    const ordered = [...eligible.slice(start), ...eligible.slice(0, start)];
    const withGap = ordered.map((driver) => ({
      driver,
      days: distanceSinceAssignment(driver.id, outing.date),
    }));
    const weekApart = withGap.find((candidate) => candidate.days >= 7);
    const chosen = weekApart || (!weekOnly && withGap
      .filter((candidate) => candidate.days >= 2)
      .sort((first, second) => second.days - first.days)[0]);

    if (!chosen) return null;

    rotationIndexes[rotationKey] = (eligible.indexOf(chosen.driver) + 1) % eligible.length;
    return chosen.driver;
  }

  function chooseForOuting(outing) {
    const group = groupOfType(outing.type);
    const elderRotations = driverRotations.elders || {};
    const groupRotations = driverRotations.groupConductors || {};

    if (group) {
      const elders = elderRotations[group] || [];
      const groupConductors = groupRotations[group] || [];
      return chooseDriver(elders, `elders-${group}`, outing, true)
        || chooseDriver(groupConductors, `group-${group}`, outing, true)
        || chooseDriver(elders, `elders-${group}`, outing)
        || chooseDriver(groupConductors, `group-${group}`, outing);
    }

    const isWeekend = outing.weekday === 'sábado' || outing.weekday === 'domingo';
    const elders = Object.keys(elderRotations).sort().flatMap((key) => elderRotations[key] || []);
    const generalDrivers = drivers
      .filter((item) => item.category !== 'Anciano' && !item.group)
      .map((item) => item.id);

    return isWeekend
      ? chooseDriver(elders, 'weekend-elders', outing, true)
      || chooseDriver(generalDrivers, 'weekend-general', outing, true)
      || chooseDriver(elders, 'weekend-elders', outing)
      || chooseDriver(generalDrivers, 'weekend-general', outing)
      : chooseDriver([...elders, ...generalDrivers], 'general', outing);
  }

  return outings.map((outing) => {
    const preserved = preservedAssignments[`${outing.configId}:${outing.date}`];
    if (preserved) {
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
