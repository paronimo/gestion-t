import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateOutings } from '../services/scheduleGenerator.js';
import { migrateData } from '../services/migrateData.js';
import { isGroupType, normalizeGroupValue } from '../services/domain.js';
import { normalizeColor } from '../../shared/colors.js';
import { normalizeLocationTerritories } from '../../shared/territoryLocations.js';

const dataFile = process.env.SCHEDULE_DATA_FILE
  ? pathToFileURL(resolve(process.env.SCHEDULE_DATA_FILE))
  : new URL('../data/months.json', import.meta.url);
const dataDirectory = pathToFileURL(dirname(fileURLToPath(dataFile)));

function normalizeGroup(group) {
  return normalizeGroupValue(group);
}

const defaultTypes = () => [{ id: 'congregacional', name: 'Congregacional', active: true }];

function emptyData() {
  return { types: defaultTypes(), drivers: [], houses: [], territoryLocations: [], territories: [], months: {} };
}

async function readData() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    const content = await readFile(dataFile, 'utf8');
    // Un archivo recién creado puede estar vacío: se trata como una base nueva.
    if (!content.trim()) return emptyData();

    const parsed = JSON.parse(content);
    const data = parsed.months && parsed.drivers ? parsed : { drivers: [], houses: [], months: parsed };
    return migrateData({ types: defaultTypes(), territoryLocations: [], territories: [], ...data });
  } catch (error) {
    if (error.code === 'ENOENT') return emptyData();
    throw error;
  }
}

// Las escrituras se encadenan para que dos peticiones simultáneas no se pisen
// ni dejen el archivo a medio escribir.
let writeQueue = Promise.resolve();

function writeData(data) {
  const snapshot = JSON.stringify(data, null, 2);
  writeQueue = writeQueue.then(async () => {
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(dataFile, snapshot);
  });
  return writeQueue;
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function emptyMonth() {
  return {
    configuration: [],
    outings: [],
    driverAvailability: {},
    driverRotations: { elders: {}, groupConductors: {} },
    houseAvailability: {},
    houseRotations: {},
  };
}

function countAssignments(months, field, id) {
  return Object.values(months).reduce((total, month) => (
    total + (month.outings || []).filter((outing) => outing[field] === id).length
  ), 0);
}

// ---------------------------------------------------------------- tipos de salida

export async function getOutingTypes() {
  const data = await readData();
  return data.types.map((type) => ({ ...type, active: type.active !== false }));
}

export async function createOutingType(name) {
  const data = await readData();
  const type = { id: randomUUID(), name: name.trim(), active: true };
  data.types.push(type);
  await writeData(data);
  return type;
}

export async function updateOutingType(id, changes) {
  const data = await readData();
  const type = data.types.find((item) => item.id === id);
  if (!type) return null;
  Object.assign(type, changes);
  await writeData(data);
  return type;
}

export async function deleteOutingType(id) {
  const data = await readData();
  const index = data.types.findIndex((item) => item.id === id);
  if (index === -1) return null;
  // El tipo congregacional es la base del cronograma y no se elimina.
  if (data.types[index].id === 'congregacional') return { deleted: false };

  data.types.splice(index, 1);
  await writeData(data);
  return { deleted: true };
}

// ---------------------------------------------------------------- meses y salidas

export async function getMonth(year, month) {
  const data = await readData();
  return { ...emptyMonth(), ...data.months[monthKey(year, month)] };
}

export async function saveConfiguration(year, month, rawConfiguration) {
  const data = await readData();
  const key = monthKey(year, month);
  const currentMonth = { ...emptyMonth(), ...data.months[key] };
  const configuration = (Array.isArray(rawConfiguration) ? rawConfiguration : []).map((rule) => ({
    ...rule,
    color: normalizeColor(rule.color),
  }));
  const manualOutings = currentMonth.outings.filter((outing) => outing.source === 'manual');

  const outings = [
    ...manualOutings,
    ...generateMonthlyOutings(data, year, month, currentMonth, configuration),
  ].sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time));

  data.months[key] = { ...currentMonth, configuration, outings };
  await writeData(data);
  return data.months[key];
}

export async function addManualOuting(year, month, outing) {
  const data = await readData();
  const key = monthKey(year, month);
  const currentMonth = { ...emptyMonth(), ...data.months[key] };
  const newOuting = { ...outing, id: randomUUID(), source: 'manual', configId: null, color: normalizeColor(outing.color) };

  currentMonth.outings.push(newOuting);
  currentMonth.outings.sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time));
  data.months[key] = currentMonth;
  await writeData(data);
  return newOuting;
}

export async function updateOuting(year, month, id, changes) {
  const data = await readData();
  const key = monthKey(year, month);
  const currentMonth = { ...emptyMonth(), ...data.months[key] };
  const outing = currentMonth.outings.find((item) => item.id === id);

  if (!outing) return null;

  const assignmentChanged = outing.driverId !== changes.driverId || (outing.driver || '') !== (changes.driver || '');
  if (outing.source === 'recurring' && assignmentChanged) {
    changes.driverManualOverride = true;
  }
  if (outing.source === 'recurring' && (outing.placeId || null) !== (changes.placeId || null)) {
    changes.placeManualOverride = true;
  }
  if (outing.source === 'recurring' && (outing.territory || '') !== (changes.territory || '')) {
    changes.territoryManualOverride = true;
  }
  // Un color elegido a mano en una salida recurrente sobrevive a la regeneración;
  // si se deja vacío, la salida vuelve al color de su regla.
  if (outing.source === 'recurring') {
    changes.color = normalizeColor(changes.color);
    changes.colorManualOverride = changes.color !== normalizeColor(outing.color);
  } else {
    changes.color = normalizeColor(changes.color);
  }

  Object.assign(outing, changes);  currentMonth.outings.sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time));
  data.months[key] = currentMonth;
  await writeData(data);
  return outing;
}

export async function deleteOuting(year, month, id) {
  const data = await readData();
  const key = monthKey(year, month);
  const currentMonth = { ...emptyMonth(), ...data.months[key] };
  const outingIndex = currentMonth.outings.findIndex((item) => item.id === id);

  if (outingIndex === -1) return false;

  currentMonth.outings.splice(outingIndex, 1);
  data.months[key] = currentMonth;
  await writeData(data);
  return true;
}

// ------------------------------------------------- ubicaciones por territorio

// La relación es manual: cada ubicación guarda la lista de territorios cercanos.
// No se calculan distancias ni se asigna nada automáticamente.
export async function getTerritoryLocations() {
  const data = await readData();
  return (data.territoryLocations || []).map((location) => ({
    ...location,
    active: location.active !== false,
    territories: normalizeLocationTerritories(location.territories).join(', '),
    assignedCount: countAssignments(data.months, 'placeId', location.id),
  }));
}

export async function createTerritoryLocation(location) {
  const data = await readData();
  const newLocation = {
    id: randomUUID(),
    active: true,
    mapsUrl: '',
    ...location,
    territories: normalizeLocationTerritories(location.territories).join(', '),
  };
  data.territoryLocations.push(newLocation);
  await writeData(data);
  return { ...newLocation, assignedCount: 0 };
}

export async function updateTerritoryLocation(id, changes) {
  const data = await readData();
  const location = (data.territoryLocations || []).find((item) => item.id === id);
  if (!location) return null;

  Object.assign(location, changes);
  location.territories = normalizeLocationTerritories(location.territories).join(', ');
  await writeData(data);
  return { ...location, active: location.active !== false, assignedCount: countAssignments(data.months, 'placeId', id) };
}

export async function deleteTerritoryLocation(id) {
  const data = await readData();
  const list = data.territoryLocations || [];
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return null;

  // Con salidas ya asignadas solo se deshabilita, para no romper el historial.
  const assignedCount = countAssignments(data.months, 'placeId', id);
  if (assignedCount > 0) return { deleted: false, assignedCount };

  list.splice(index, 1);
  await writeData(data);
  return { deleted: true, assignedCount: 0 };
}

export async function getDrivers() {
  const data = await readData();
  return data.drivers.map((driver) => ({
    ...driver,
    active: driver.active !== false,
    assignedCount: countDriverAssignments(data.months, driver),
  }));
}

export async function createDriver(driver) {
  const data = await readData();
  const newDriver = { id: randomUUID(), active: true, ...driver };
  data.drivers.push(newDriver);
  await writeData(data);
  return newDriver;
}

export async function updateDriver(id, changes) {
  const data = await readData();
  const driver = data.drivers.find((item) => item.id === id);

  if (!driver) return null;

  const oldName = `${driver.firstName} ${driver.lastName}`.trim().toLocaleLowerCase();
  const newName = `${changes.firstName} ${changes.lastName}`.trim().toLocaleLowerCase();
  const hasLegacyAssignment = Object.values(data.months).some((month) => (
    (month.outings || []).some((outing) => !outing.driverId && outing.driver?.trim().toLocaleLowerCase() === oldName)
  ));
  if (oldName !== newName && hasLegacyAssignment) {
    driver.legacyNames = [...new Set([...(driver.legacyNames || []), oldName])];
  }

  Object.assign(driver, changes);
  for (const month of Object.values(data.months)) {
    const validForElderRotation = driver.category === 'Anciano';
    const validForGroupRotation = driver.category !== 'Anciano';
    for (const [group, driverIds] of Object.entries(month.driverRotations?.elders || {})) {
      if (!validForElderRotation || normalizeGroup(group) !== normalizeGroup(driver.group || '')) {
        month.driverRotations.elders[group] = driverIds.filter((driverId) => driverId !== id);
      }
    }
    for (const [group, driverIds] of Object.entries(month.driverRotations?.groupConductors || {})) {
      if (!validForGroupRotation || normalizeGroup(group) !== normalizeGroup(driver.group || '')) {
        month.driverRotations.groupConductors[group] = driverIds.filter((driverId) => driverId !== id);
      }
    }
  }
  await writeData(data);
  return driver;
}

export async function deleteDriver(id) {
  const data = await readData();
  const index = data.drivers.findIndex((driver) => driver.id === id);
  if (index === -1) return null;

  const assignedCount = countDriverAssignments(data.months, data.drivers[index]);
  if (assignedCount > 0) return { deleted: false, assignedCount };

  data.drivers.splice(index, 1);
  for (const month of Object.values(data.months)) {
    delete month.driverAvailability?.[id];
    for (const rotationType of ['elders', 'groupConductors']) {
      for (const [group, driverIds] of Object.entries(month.driverRotations?.[rotationType] || {})) {
        month.driverRotations[rotationType][group] = driverIds.filter((driverId) => driverId !== id);
      }
    }
  }
  await writeData(data);
  return { deleted: true, assignedCount: 0 };
}

function slotsFor(currentMonth, driverId) {
  return currentMonth.driverAvailability[driverId]?.slots || {};
}

export async function getMonthlyDrivers(year, month) {
  const [drivers, currentMonth] = await Promise.all([getDrivers(), getMonth(year, month)]);

  return drivers.map((driver) => {
    const slots = slotsFor(currentMonth, driver.id);
    return {
      ...driver,
      generalActive: driver.active !== false,
      active: Object.values(slots).some(Boolean),
      slots,
    };
  });
}

export async function updateDriverAvailability(year, month, driverId, slots) {
  const data = await readData();
  const driverExists = data.drivers.some((driver) => driver.id === driverId);
  if (!driverExists) return null;

  const key = monthKey(year, month);
  const currentMonth = { ...emptyMonth(), ...data.months[key] };
  currentMonth.driverAvailability[driverId] = { slots };
  data.months[key] = currentMonth;
  await writeData(data);
  return { slots };
}

export async function getMonthlyDriverRotations(year, month) {
  const currentMonth = await getMonth(year, month);
  return currentMonth.driverRotations;
}

export async function updateDriverRotation(year, month, group, rotationType, driverIds) {
  const data = await readData();
  const key = monthKey(year, month);
  const currentMonth = { ...emptyMonth(), ...data.months[key] };
  const normalizedGroup = normalizeGroup(group);
  const expectedCategory = rotationType === 'elders' ? 'Anciano' : null;
  const knownDrivers = new Set(data.drivers
    .filter((driver) => normalizeGroup(driver.group || '') === normalizedGroup
      && (expectedCategory ? driver.category === 'Anciano' : driver.category !== 'Anciano'))
    .map((driver) => driver.id));

  if (driverIds.some((id) => !knownDrivers.has(id)) || new Set(driverIds).size !== driverIds.length) {
    return null;
  }

  currentMonth.driverRotations[rotationType][normalizedGroup] = driverIds;
  data.months[key] = currentMonth;
  await writeData(data);
  return currentMonth.driverRotations;
}

// ---------------------------------------------------------------- casas

export async function getHouses() {
  const data = await readData();
  return data.houses.map((house) => ({
    ...house,
    active: house.active !== false,
    assignedCount: countAssignments(data.months, 'placeId', house.id),
  }));
}

export async function getMonthlyHouses(year, month) {
  const [houses, currentMonth] = await Promise.all([getHouses(), getMonth(year, month)]);

  return houses.map((house) => ({
    ...house,
    generalActive: house.active !== false,
    available: currentMonth.houseAvailability[house.id] === true,
  }));
}

export async function createHouse(house) {
  const data = await readData();
  const newHouse = { id: randomUUID(), active: true, ...house };
  data.houses.push(newHouse);
  await writeData(data);
  return newHouse;
}

export async function updateHouse(id, changes) {
  const data = await readData();
  const house = data.houses.find((item) => item.id === id);

  if (!house) return null;

  Object.assign(house, changes);
  await writeData(data);
  return house;
}

export async function deleteHouse(id) {
  const data = await readData();
  const index = data.houses.findIndex((house) => house.id === id);
  if (index === -1) return null;

  const assignedCount = countAssignments(data.months, 'placeId', id);
  if (assignedCount > 0) return { deleted: false, assignedCount };

  data.houses.splice(index, 1);
  for (const month of Object.values(data.months)) {
    delete month.houseAvailability?.[id];
    for (const [group, houseIds] of Object.entries(month.houseRotations || {})) {
      month.houseRotations[group] = houseIds.filter((houseId) => houseId !== id);
    }
  }
  await writeData(data);
  return { deleted: true, assignedCount: 0 };
}

export async function updateHouseAvailability(year, month, houseId, available) {
  const data = await readData();
  const houseExists = data.houses.some((house) => house.id === houseId);
  if (!houseExists) return null;

  const key = monthKey(year, month);
  const currentMonth = { ...emptyMonth(), ...data.months[key] };
  currentMonth.houseAvailability[houseId] = available;
  data.months[key] = currentMonth;
  await writeData(data);
  return { available };
}

export async function getMonthlyHouseRotations(year, month) {
  const currentMonth = await getMonth(year, month);
  return currentMonth.houseRotations;
}

export async function updateHouseRotation(year, month, group, houseIds) {
  const data = await readData();
  const key = monthKey(year, month);
  const currentMonth = { ...emptyMonth(), ...data.months[key] };
  const normalizedGroup = normalizeGroup(group);
  const knownHouses = new Set(data.houses
    .filter((house) => normalizeGroup(house.group || '') === normalizedGroup)
    .map((house) => house.id));

  if (houseIds.some((id) => !knownHouses.has(id)) || new Set(houseIds).size !== houseIds.length) {
    return null;
  }

  currentMonth.houseRotations[normalizedGroup] = houseIds;
  data.months[key] = currentMonth;
  await writeData(data);
  return currentMonth.houseRotations;
}

// ---------------------------------------------------------------- territorios

function normalizeTerritory(territory) {
  return (territory || '').split(',').map((part) => part.trim()).filter(Boolean);
}

function normalizeTerritoryName(territory) {
  return normalizeTerritory(territory).join(', ');
}

function countTerritoryAssignments(months, territory) {
  const wanted = normalizeTerritory(territory.name).map((part) => part.toLocaleLowerCase());
  return Object.values(months).reduce((total, month) => (
    total + (month.outings || []).filter((outing) => (
      normalizeTerritory(outing.territory)
        .some((part) => wanted.includes(part.toLocaleLowerCase()))
    )).length
  ), 0);
}

export async function getTerritories() {
  const data = await readData();
  return data.territories.map((territory) => ({
    ...territory,
    active: territory.active !== false,
    assignedCount: countTerritoryAssignments(data.months, territory),
  }));
}

export async function createTerritory(territory) {
  const data = await readData();
  const newTerritory = {
    id: randomUUID(),
    active: true,
    ...territory,
    name: normalizeTerritoryName(territory.name),
  };
  data.territories.push(newTerritory);
  await writeData(data);
  return { ...newTerritory, assignedCount: 0 };
}

export async function updateTerritory(id, changes) {
  const data = await readData();
  const territory = data.territories.find((item) => item.id === id);
  if (!territory) return null;
  Object.assign(territory, changes, { name: normalizeTerritoryName(changes.name) });
  await writeData(data);
  return { ...territory, assignedCount: countTerritoryAssignments(data.months, territory) };
}

export async function deleteTerritory(id) {
  const data = await readData();
  const index = data.territories.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const assignedCount = countTerritoryAssignments(data.months, data.territories[index]);
  if (assignedCount > 0) return { deleted: false, assignedCount };
  data.territories.splice(index, 1);
  await writeData(data);
  return { deleted: true, assignedCount: 0 };
}

// ---------------------------------------------------------------- generación

function getEligibleHouseRotations(houses, month) {
  return Object.fromEntries(Object.entries(month.houseRotations).map(([group, houseIds]) => {
    const eligibleIds = houseIds.filter((id) => houses.some((house) => (
      house.id === id
      && house.active !== false
      && month.houseAvailability[id] === true
      && normalizeGroup(house.group || '') === normalizeGroup(group)
    )));
    return [normalizeGroup(group), eligibleIds];
  }));
}

function getEligibleDriverRotations(drivers, month) {
  const availableDrivers = drivers.filter((driver) => driver.active !== false && driver.monthlyEnabled);
  const rotations = { elders: {}, groupConductors: {} };

  for (const [rotationType, groups] of Object.entries(month.driverRotations)) {
    for (const [group, driverIds] of Object.entries(groups)) {
      rotations[rotationType][normalizeGroup(group)] = driverIds.filter((id) => availableDrivers.some((driver) => (
        driver.id === id
        && normalizeGroup(driver.group || '') === normalizeGroup(group)
        && (rotationType === 'elders' ? driver.category === 'Anciano' : driver.category !== 'Anciano')
      )));
    }
  }

  return rotations;
}

function resolveDriverId(outing, drivers) {
  if (outing.driverId) return outing.driverId;
  if (!outing.driver) return null;

  const assignedName = outing.driver.trim().toLocaleLowerCase();
  const driver = drivers.find((item) => (
    `${item.firstName} ${item.lastName}`.trim().toLocaleLowerCase() === assignedName
    || (item.legacyNames || []).includes(assignedName)
  ));
  return driver?.id || null;
}

function generateMonthlyOutings(data, year, month, currentMonth, configuration) {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const drivers = data.drivers.map((driver) => {
    const slots = slotsFor(currentMonth, driver.id);
    return {
      ...driver,
      generalActive: driver.active !== false,
      monthlyEnabled: Object.values(slots).some(Boolean),
      slots,
    };
  });
  const historicalAssignments = Object.values(data.months).flatMap((savedMonth) => savedMonth.outings || [])
    .filter((outing) => outing.date < monthStart);
  const fixedAssignments = currentMonth.outings.filter((outing) => (
    outing.source === 'manual' || outing.driverManualOverride
  ));
  const existingAssignments = [...historicalAssignments, ...fixedAssignments]
    .map((outing) => ({ driverId: resolveDriverId(outing, data.drivers), date: outing.date }))
    .filter((assignment) => assignment.driverId);
  const key = (outing) => `${outing.configId}:${outing.date}`;
  const preservedAssignments = Object.fromEntries(currentMonth.outings
    .filter((outing) => outing.source === 'recurring' && outing.driverManualOverride)
    .map((outing) => [key(outing), { driverId: outing.driverId || null, driver: outing.driver || '' }]));
  const preservedTerritories = Object.fromEntries(currentMonth.outings
    .filter((outing) => outing.source === 'recurring' && outing.territoryManualOverride)
    .map((outing) => [key(outing), normalizeTerritoryName(outing.territory)]));
      const preservedPlaces = Object.fromEntries(currentMonth.outings
    .filter((outing) => outing.source === 'recurring' && outing.placeManualOverride)
    .map((outing) => [key(outing), {
      placeId: outing.placeId || null,
      placeType: outing.placeType || 'house',
    }]));
  const preservedColors = Object.fromEntries(currentMonth.outings
    .filter((outing) => outing.source === 'recurring' && outing.colorManualOverride)
    .map((outing) => [key(outing), normalizeColor(outing.color)]));

  return generateOutings(year, month, configuration, getEligibleHouseRotations(data.houses, currentMonth), {
    drivers,
    rotations: getEligibleDriverRotations(drivers, currentMonth),
    existingAssignments,
    preservedAssignments,
    preservedTerritories,
    preservedPlaces,
    preservedColors,
  });
}

function countDriverAssignments(months, driver) {
  const names = new Set([
    `${driver.firstName} ${driver.lastName}`.trim().toLocaleLowerCase(),
    ...(driver.legacyNames || []),
  ]);
  return Object.values(months).reduce((total, month) => (
    total + (month.outings || []).filter((outing) => (
      outing.driverId === driver.id
      || (!outing.driverId && names.has(outing.driver?.trim().toLocaleLowerCase()))
    )).length
  ), 0);
}

// Copia entre meses por categoría. Cada categoría es independiente: se puede
// copiar solo lo que se marque. Nunca se copian las salidas individuales ni sus
// fechas: el destino genera las suyas a partir de las reglas copiadas.
export async function copyMonthConfiguration(sourceYear, sourceMonth, destinationYear, destinationMonth, options) {
  const data = await readData();
  const source = { ...emptyMonth(), ...data.months[monthKey(sourceYear, sourceMonth)] };
  const destinationKey = monthKey(destinationYear, destinationMonth);
  const destination = { ...emptyMonth(), ...data.months[destinationKey] };

  if (options.recurringRules) {
    destination.configuration = [
      ...source.configuration
        .filter((rule) => !isGroupType(rule.type))
        .map((rule) => ({ ...rule, id: randomUUID() })),
      ...destination.configuration.filter((rule) => isGroupType(rule.type)),
    ];
  }

  if (options.groupConfigurations) {
    destination.configuration = [
      ...destination.configuration.filter((rule) => !isGroupType(rule.type)),
      ...source.configuration
        .filter((rule) => isGroupType(rule.type))
        .map((rule) => ({ ...rule, id: randomUUID() })),
    ];
  }

  if (options.houseAvailability) {
    destination.houseAvailability = Object.fromEntries(
      data.houses.map((house) => [house.id, source.houseAvailability[house.id] === true]),
    );
  }

  if (options.houseRotations) {
    destination.houseRotations = Object.fromEntries(
      Object.entries(source.houseRotations).map(([group, ids]) => [group, [...ids]]),
    );
  }

  if (options.driverAvailability) {
    destination.driverAvailability = Object.fromEntries(data.drivers.map((driver) => {
      const sourceSlots = source.driverAvailability[driver.id]?.slots || {};
      const destinationSlots = destination.driverAvailability[driver.id]?.slots || {};
      return [driver.id, { slots: { ...sourceSlots, ...destinationSlots } }];
    }));
  }

  if (options.driverRotations) {
    destination.driverRotations = {
      elders: Object.fromEntries(Object.entries(source.driverRotations.elders).map(([group, ids]) => [group, [...ids]])),
      groupConductors: Object.fromEntries(Object.entries(source.driverRotations.groupConductors).map(([group, ids]) => [group, [...ids]])),
    };
  }

  if (options.recurringRules || options.groupConfigurations) {
    const manualOutings = destination.outings.filter((outing) => outing.source === 'manual');
    destination.outings = [
      ...manualOutings,
      ...generateMonthlyOutings(data, destinationYear, destinationMonth, destination, destination.configuration),
    ].sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time));
  }

  data.months[destinationKey] = destination;
  await writeData(data);
  return destination;
}

// Datos de configuración que el destino ya tiene, para preguntar antes de pisarlos.
export async function getMonthConfigurationSummary(year, month) {
  const currentMonth = await getMonth(year, month);
  return {
    rules: currentMonth.configuration.length,
    manualOutings: currentMonth.outings.filter((outing) => outing.source === 'manual').length,
    recurringOutings: currentMonth.outings.filter((outing) => outing.source === 'recurring').length,
    housesAvailable: Object.values(currentMonth.houseAvailability).filter(Boolean).length,
    houseRotationGroups: Object.keys(currentMonth.houseRotations).length,
    driversWithSlots: Object.values(currentMonth.driverAvailability)
      .filter((entry) => Object.values(entry.slots || {}).some(Boolean)).length,
    driverRotationGroups: Object.keys(currentMonth.driverRotations.elders).length
      + Object.keys(currentMonth.driverRotations.groupConductors).length,
  };
}
