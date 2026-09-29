import { randomUUID } from 'node:crypto';
import {
  addManualOuting,
  copyMonthConfiguration,
  createDriver,
  createHouse,
  createLocation,
  createOutingType,
  createTerritory,
  createTerritoryLocation,
  deleteTerritoryLocation as removeTerritoryLocation,
  deleteTerritory as removeTerritory,
  deleteDriver as removeDriver,
  deleteHouse as removeHouse,
  deleteLocation as removeLocation,
  deleteOuting,
  deleteOutingType as removeOutingType,
  getDrivers,
  getHouses,
  getLocations,
  getMonth,
  getMonthlyDrivers,
  getMonthlyLocations,
  getMonthlyDriverRotations,
  getMonthlyHouses,
  getMonthConfigurationSummary,
  getOutingTypes,
  getTerritories,
  getTerritoryLocations,
  getMonthlyHouseRotations,
  saveConfiguration,
  updateDriver,
  updateDriverAvailability,
  updateDriverRotation,
  updateHouse,
  updateHouseAvailability,
  updateHouseRotation,
  updateLocation,
  updateLocationAvailability,
  updateOuting,
  updateOutingType,
  updateTerritory,
  updateTerritoryLocation,
} from '../models/scheduleModel.js';
import {
  groupOfType,
  isAvailableInSlot,
  isCongregational,
  isValidSlotKey,
  normalizeGroupValue,
  turnOfTime,
  typeId,
} from '../services/domain.js';
import { weekdayForDate } from '../services/scheduleGenerator.js';
import { normalizeColor } from '../../shared/colors.js';
import { normalizeLocationTerritories } from '../../shared/territoryLocations.js';
import { buildSchedulePdf } from '../services/pdfExport.js';

const normalizeGroup = normalizeGroupValue;

function monthParams(request, response) {
  const year = Number(request.params.year);
  const month = Number(request.params.month);

  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    response.status(400).json({ error: 'Mes o año no válido' });
    return null;
  }

  return { year, month };
}

function validTime(time) {
  return typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function validDate(date, year, month) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [dateYear, dateMonth, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return dateYear === year && dateMonth === month && day >= 1 && day <= lastDay;
}

function normalizeTerritory(territory) {
  return (territory || '').split(',').map((part) => part.trim()).filter(Boolean).join(', ');
}

function validTerritory(body, response) {
  if (
    !body
    || typeof body.name !== 'string'
    || !body.name.trim()
    || (body.active !== undefined && typeof body.active !== 'boolean')
  ) {
    response.status(400).json({ error: 'El nombre del territorio es obligatorio' });
    return null;
  }

  const territory = { name: normalizeTerritory(body.name) };
  if (typeof body.active === 'boolean') territory.active = body.active;
  return territory;
}

function outingFields(body, year, month, response) {
  const hasValidText = body && typeof body === 'object'
    && typeof body.type === 'string' && body.type.trim()
    && typeof body.territory === 'string'
    && (body.driver === undefined || typeof body.driver === 'string')
    && (body.driverId === undefined || body.driverId === null || typeof body.driverId === 'string')
    && (body.placeId === undefined || body.placeId === null || typeof body.placeId === 'string')
    && (body.placeType === undefined || body.placeType === 'house' || body.placeType === 'location')
    && (body.color === undefined || typeof body.color === 'string');

  if (!body || !validDate(body.date, year, month) || !validTime(body.time) || !hasValidText) {
    response.status(400).json({ error: 'La fecha, la hora y el tipo de salida son obligatorios' });
    return null;
  }

  return {
    date: body.date,
    weekday: weekdayForDate(body.date),
    time: body.time,
    type: body.type.trim(),
    driverId: body.driverId || null,
    driver: body.driverId ? '' : (body.driver || '').trim(),
    placeId: body.placeId || null,
    placeType: body.placeId ? (body.placeType || 'house') : 'location',
    territory: normalizeTerritory(body.territory),
    color: normalizeColor(body.color),
  };
}

// El lugar de encuentro se muestra igual sea una casa o una ubicación,
// por eso la columna se arma con los dos registros juntos.
function withPlace(outing, places) {
  const place = places.find((item) => item.id === outing.placeId);
  return {
    ...outing,
    placeName: place?.name || '',
    placeMapsUrl: place?.mapsUrl || '',
  };
}

function withDriverName(outing, drivers) {
  const assignedDriver = drivers.find((driver) => driver.id === outing.driverId);
  return { ...outing, driverName: assignedDriver ? `${assignedDriver.firstName} ${assignedDriver.lastName}` : outing.driver || '' };
}

function validHouse(body, response, groups) {
  if (
    !body
    || typeof body.name !== 'string'
    || !body.name.trim()
    || (body.group !== undefined && typeof body.group !== 'string')
    || (body.group && !groups.has(normalizeGroup(body.group)))
    || typeof body.congregationalWeekend !== 'boolean'
    || (body.active !== undefined && typeof body.active !== 'boolean')
  ) {
    response.status(400).json({ error: 'Nombre, grupo y uso congregacional son obligatorios' });
    return null;
  }

  const house = {
    name: body.name.trim(),
    group: normalizeGroup(body.group || ''),
    congregationalWeekend: body.congregationalWeekend,
  };
  if (typeof body.active === 'boolean') house.active = body.active;
  return house;
}

function validLocation(body, response) {
  if (
    !body
    || typeof body.name !== 'string'
    || !body.name.trim()
    || (body.address !== undefined && typeof body.address !== 'string')
    || (body.mapsUrl !== undefined && typeof body.mapsUrl !== 'string')
    || (body.mapsUrl && !/^https?:\/\//i.test(body.mapsUrl))
    || (body.active !== undefined && typeof body.active !== 'boolean')
  ) {
    response.status(400).json({ error: 'El nombre de la ubicación es obligatorio y el enlace debe ser una URL válida' });
    return null;
  }

  const location = { name: body.name.trim(), address: (body.address || '').trim() };
  if (body.mapsUrl) location.mapsUrl = body.mapsUrl.trim();
  if (typeof body.active === 'boolean') location.active = body.active;
  return location;
}

function validTerritoryLocation(body, response) {
  if (
    !body
    || typeof body.name !== 'string'
    || !body.name.trim()
    || (body.mapsUrl !== undefined && typeof body.mapsUrl !== 'string')
    || (body.mapsUrl && !/^https?:\/\//i.test(body.mapsUrl))
    || (body.territories !== undefined && typeof body.territories !== 'string')
    || (body.active !== undefined && typeof body.active !== 'boolean')
  ) {
    response.status(400).json({ error: 'El nombre de la ubicación es obligatorio y el enlace debe ser una URL válida' });
    return null;
  }

  // Los territorios son una lista manual de números o textos separados por coma.
  const location = {
    name: body.name.trim(),
    territories: normalizeLocationTerritories(body.territories).join(', '),
  };
  if (body.mapsUrl) location.mapsUrl = body.mapsUrl.trim();
  if (typeof body.active === 'boolean') location.active = body.active;
  return location;
}

function validDriver(body, response, groups) {
  const categories = ['Anciano', 'Siervo ministerial', 'Publicador', 'Precursor'];
  if (
    !body
    || typeof body.firstName !== 'string'
    || !body.firstName.trim()
    || typeof body.lastName !== 'string'
    || !body.lastName.trim()
    || !categories.includes(body.category)
    || (body.group !== undefined && typeof body.group !== 'string')
    || (body.group && !groups.has(normalizeGroup(body.group)))
    || (body.active !== undefined && typeof body.active !== 'boolean')
  ) {
    response.status(400).json({ error: 'Nombre, apellido y categoría son obligatorios' });
    return null;
  }

  const driver = {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    category: body.category,
    group: normalizeGroup(body.group || ''),
  };
  if (typeof body.active === 'boolean') driver.active = body.active;
  return driver;
}

// Los grupos existentes se derivan de los tipos y de las casas registradas,
// así que agregar un grupo nuevo no requiere tocar el código.
async function knownGroups() {
  const [types, houses, drivers] = await Promise.all([getOutingTypes(), getHouses(), getDrivers()]);
  const groups = new Set();
  for (const type of types) {
    if (!isCongregational(type.name)) groups.add(typeId(type.name));
  }
  for (const house of houses) if (house.group) groups.add(normalizeGroup(house.group));
  for (const driver of drivers) if (driver.group) groups.add(normalizeGroup(driver.group));
  return groups;
}

export async function getConfiguration(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const month = await getMonth(params.year, params.month);
  response.json(month.configuration);
}

export async function putConfiguration(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const configuration = request.body?.configuration;
  if (!Array.isArray(configuration)) {
    response.status(400).json({ error: 'La configuración debe ser una lista' });
    return;
  }

  const validConfiguration = configuration.every((rule) => (
    rule !== null
    && typeof rule === 'object'
    && !Array.isArray(rule)
    && Number.isInteger(rule.weekday)
    && rule.weekday >= 0
    && rule.weekday <= 6
    && validTime(rule.time)
    && typeof rule.type === 'string'
    && rule.type.trim()
    && typeof rule.active === 'boolean'
    && (rule.color === undefined || typeof rule.color === 'string')
  ));

  if (!validConfiguration) {
    response.status(400).json({ error: 'Hay una regla de configuración no válida' });
    return;
  }

  const normalized = configuration.map((rule) => ({
    id: typeof rule.id === 'string' && rule.id ? rule.id : randomUUID(),
    weekday: rule.weekday,
    time: rule.time,
    type: rule.type.trim(),
    active: rule.active,
    // Un color vacío o mal escrito se guarda como '': la salida usará el predeterminado.
    color: normalizeColor(rule.color),
  }));

  const month = await saveConfiguration(params.year, params.month, normalized);
  response.json({ configuration: month.configuration, outings: month.outings });
}

export async function getOutings(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const month = await getMonth(params.year, params.month);
  const [drivers, places] = await Promise.all([getDrivers(), allPlaces()]);
  response.json(month.outings.map((outing) => withPlace(withDriverName(outing, drivers), places)));
}

// Casas, ubicaciones y ubicaciones por territorio comparten la columna
// "Lugar de Encuentro": juntas resuelven el nombre y el enlace de Maps.
async function allPlaces() {
  const [houses, locations, territoryLocations] = await Promise.all([
    getHouses(),
    getLocations(),
    getTerritoryLocations(),
  ]);
  return [...houses, ...locations, ...territoryLocations];
}

export async function postOuting(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const fields = outingFields(request.body, params.year, params.month, response);
  if (!fields) return;

  const outing = await addManualOuting(params.year, params.month, fields);
  const [drivers, places] = await Promise.all([getDrivers(), allPlaces()]);
  response.status(201).json(withPlace(withDriverName(outing, drivers), places));
}

export async function putOuting(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const fields = outingFields(request.body, params.year, params.month, response);
  if (!fields) return;

  const outing = await updateOuting(params.year, params.month, request.params.id, fields);
  if (!outing) {
    response.status(404).json({ error: 'No se encontró la salida' });
    return;
  }

  const [drivers, places] = await Promise.all([getDrivers(), allPlaces()]);
  response.json(withPlace(withDriverName(outing, drivers), places));
}

export async function removeOuting(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const deleted = await deleteOuting(params.year, params.month, request.params.id);
  if (!deleted) {
    response.status(404).json({ error: 'No se encontró la salida' });
    return;
  }

  response.status(204).end();
}

export async function getMonthlyDriverList(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  response.json(await getMonthlyDrivers(params.year, params.month));
}

export async function getDriverList(_request, response) {
  response.json(await getDrivers());
}

export async function getAvailableDrivers(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const { date, type = 'Congregacional', time = '09:00', currentDriverId = '' } = request.query;
  if (!validDate(date, params.year, params.month) || !validTime(time) || typeof type !== 'string') {
    response.status(400).json({ error: 'Fecha, hora y tipo válidos son necesarios' });
    return;
  }

  const drivers = await getMonthlyDrivers(params.year, params.month);
  const weekday = new Date(Date.UTC(params.year, params.month - 1, Number(date.slice(-2)))).getUTCDay();
  const requestedGroup = groupOfType(type);
  const turn = turnOfTime(time);
  const available = drivers.filter((driver) => {
    if (!driver.generalActive) return false;

    // Un conductor con grupo propio solo se ofrece para salidas de ese grupo.
    if (driver.group && requestedGroup && normalizeGroup(driver.group) !== requestedGroup) {
      return false;
    }

    // La disponibilidad del mes manda: sin turno conocido (hora fuera de rango)
    // no se ofrece a nadie, y el checkbox del turno decide en el resto.
    return isAvailableInSlot(driver.slots, weekday, turn);
  });

  response.json({
    drivers: available,
    currentDriver: drivers.find((driver) => driver.id === currentDriverId) || null,
    turn,
    turnOutOfRange: turn === null,
  });
}

export async function postDriver(request, response) {
  const driver = validDriver(request.body, response, await knownGroups());
  if (!driver) return;

  response.status(201).json(await createDriver(driver));
}

export async function putDriver(request, response) {
  const changes = validDriver(request.body, response, await knownGroups());
  if (!changes) return;

  const driver = await updateDriver(request.params.id, changes);
  if (!driver) {
    response.status(404).json({ error: 'No se encontró el conductor' });
    return;
  }

  response.json(driver);
}

export async function deleteDriver(request, response) {
  const result = await removeDriver(request.params.id);
  if (!result) {
    response.status(404).json({ error: 'No se encontró el conductor' });
    return;
  }
  if (!result.deleted) {
    response.status(409).json({ error: 'No se puede eliminar: conserva asignaciones históricas', assignedCount: result.assignedCount });
    return;
  }
  response.status(204).end();
}

export async function putDriverAvailability(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const { slots } = request.body || {};
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)
    || !Object.entries(slots).every(([key, value]) => isValidSlotKey(key) && typeof value === 'boolean')) {
    response.status(400).json({ error: 'La disponibilidad por día y turno no es válida' });
    return;
  }

  const [driver] = (await getDrivers()).filter((item) => item.id === request.params.id);
  if (!driver) {
    response.status(404).json({ error: 'No se encontró el conductor' });
    return;
  }

  const cleanSlots = Object.fromEntries(Object.entries(slots).filter(([, value]) => value));
  await updateDriverAvailability(params.year, params.month, driver.id, cleanSlots);
  response.json({ ...driver, slots: cleanSlots, active: Object.keys(cleanSlots).length > 0 });
}

export async function getDriverRotations(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  response.json(await getMonthlyDriverRotations(params.year, params.month));
}

export async function putDriverRotation(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const { group, rotationType, driverIds } = request.body || {};
  const groupId = typeof group === 'string' ? normalizeGroup(group) : '';
  if (
    !groupId
    || !['elders', 'groupConductors'].includes(rotationType)
    || !Array.isArray(driverIds)
    || !driverIds.every((id) => typeof id === 'string')
  ) {
    response.status(400).json({ error: 'Grupo, tipo de rotación u orden de conductores no válido' });
    return;
  }

  const rotations = await updateDriverRotation(params.year, params.month, groupId, rotationType, driverIds);
  if (!rotations) {
    response.status(400).json({ error: 'Los conductores deben pertenecer al grupo y no repetirse' });
    return;
  }

  response.json(rotations);
}

export async function getMonthlyHouseList(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  response.json(await getMonthlyHouses(params.year, params.month));
}

export async function getAvailableHouses(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const { date, type = '', time = '', currentHouseId = '' } = request.query;
  if (!validDate(date, params.year, params.month) || typeof type !== 'string') {
    response.status(400).json({ error: 'Fecha y tipo válidos son necesarios' });
    return;
  }

  const houses = await getMonthlyHouses(params.year, params.month);
  const [dateYear, dateMonth, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(dateYear, dateMonth - 1, day)).getUTCDay();
  const congregationalWeekend = isCongregational(type) && (weekday === 0 || weekday === 6);
  // El grupo se deduce del tipo: "Grupo 3" ofrece las casas del grupo 3.
  const requestedGroup = groupOfType(type);
  const available = houses.filter((house) => (
    house.generalActive && house.available
    && ((requestedGroup && normalizeGroup(house.group) === requestedGroup)
      || (congregationalWeekend && house.congregationalWeekend))
  ));

  response.json({
    houses: available,
    currentHouse: houses.find((house) => house.id === currentHouseId) || null,
  });
}

export async function postHouse(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const house = validHouse(request.body, response, await knownGroups());
  if (!house) return;

  const createdHouse = await createHouse(house);
  await updateHouseAvailability(params.year, params.month, createdHouse.id, true);
  response.status(201).json({ ...createdHouse, available: true });
}

export async function getHouseList(_request, response) {
  response.json(await getHouses());
}

export async function postHouseRecord(request, response) {
  const house = validHouse(request.body, response, await knownGroups());
  if (!house) return;

  response.status(201).json(await createHouse(house));
}

export async function putHouse(request, response) {
  const changes = validHouse(request.body, response, await knownGroups());
  if (!changes) return;

  const house = await updateHouse(request.params.id, changes);
  if (!house) {
    response.status(404).json({ error: 'No se encontró la casa' });
    return;
  }

  response.json(house);
}

export async function deleteHouse(request, response) {
  const result = await removeHouse(request.params.id);
  if (!result) {
    response.status(404).json({ error: 'No se encontró la casa' });
    return;
  }
  if (!result.deleted) {
    response.status(409).json({ error: 'No se puede eliminar: conserva asignaciones históricas', assignedCount: result.assignedCount });
    return;
  }
  response.status(204).end();
}

export async function postConfigurationCopy(request, response) {
  const destination = monthParams(request, response);
  const source = monthParams({ params: { year: request.params.sourceYear, month: request.params.sourceMonth } }, response);
  if (!destination || !source) return;

  if (destination.year === source.year && destination.month === source.month) {
    response.status(400).json({ error: 'El mes de origen y destino deben ser distintos' });
    return;
  }

  const options = request.body || {};
  const optionNames = [
    'recurringRules',
    'groupConfigurations',
    'houseAvailability',
    'houseRotations',
    'locationAvailability',
    'driverAvailability',
    'driverRotations',
  ];
  if (optionNames.some((name) => typeof options[name] !== 'boolean')) {
    response.status(400).json({ error: 'Selecciona opciones válidas para copiar' });
    return;
  }

  // Solo se permite pisar la configuración del destino si el usuario lo confirma.
  if (options.overwrite === false) {
    response.status(409).json({ error: 'Falta la confirmación para reemplazar la configuración del destino' });
    return;
  }

  const month = await copyMonthConfiguration(
    source.year,
    source.month,
    destination.year,
    destination.month,
    options,
  );
  response.json(month);
}

export async function putHouseAvailability(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const { available } = request.body || {};
  if (typeof available !== 'boolean') {
    response.status(400).json({ error: 'La disponibilidad debe ser verdadera o falsa' });
    return;
  }

  const result = await updateHouseAvailability(params.year, params.month, request.params.id, available);
  if (!result) {
    response.status(404).json({ error: 'No se encontró la casa' });
    return;
  }

  response.json(result);
}

export async function getHouseRotations(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  response.json(await getMonthlyHouseRotations(params.year, params.month));
}

export async function putHouseRotation(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const { group, houseIds } = request.body || {};
  const groupId = typeof group === 'string' ? normalizeGroup(group) : '';
  if (!groupId || !Array.isArray(houseIds) || !houseIds.every((id) => typeof id === 'string')) {
    response.status(400).json({ error: 'Grupo u orden de casas no válido' });
    return;
  }

  const rotations = await updateHouseRotation(params.year, params.month, groupId, houseIds);
  if (!rotations) {
    response.status(400).json({ error: 'Las casas deben pertenecer al grupo seleccionado y no repetirse' });
    return;
  }

  response.json(rotations);
}

export async function getMonthlyLocationList(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  response.json(await getMonthlyLocations(params.year, params.month));
}

export async function putLocationAvailability(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const { available } = request.body || {};
  if (typeof available !== 'boolean') {
    response.status(400).json({ error: 'La disponibilidad debe ser verdadera o falsa' });
    return;
  }

  const result = await updateLocationAvailability(params.year, params.month, request.params.id, available);
  if (!result) {
    response.status(404).json({ error: 'No se encontró la ubicación' });
    return;
  }

  response.json(result);
}

export async function getMonthSummary(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  response.json(await getMonthConfigurationSummary(params.year, params.month));
}

export async function getSchedulePdf(request, response) {
  const params = monthParams(request, response);
  if (!params) return;

  const month = await getMonth(params.year, params.month);
  const [drivers, places] = await Promise.all([getDrivers(), allPlaces()]);
  // Se muestran los datos tal como están guardados: la exportación no recalcula nada.
  const outings = month.outings.map((outing) => withPlace(withDriverName(outing, drivers), places));
  const buffer = await buildSchedulePdf({ year: params.year, month: params.month, outings });

  const monthName = new Intl.DateTimeFormat('es', { month: 'long' })
    .format(new Date(params.year, params.month - 1, 1));
  const fileName = `Cronograma_${monthName}_${params.year}.pdf`;

  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  response.send(buffer);
}

export async function getTerritoryList(_request, response) {
  response.json(await getTerritories());
}

export async function postTerritory(request, response) {
  const territory = validTerritory(request.body, response);
  if (!territory) return;

  response.status(201).json(await createTerritory(territory));
}

export async function putTerritory(request, response) {
  const territory = validTerritory(request.body, response);
  if (!territory) return;

  const updated = await updateTerritory(request.params.id, territory);
  if (!updated) {
    response.status(404).json({ error: 'No se encontró el territorio' });
    return;
  }

  response.json(updated);
}

export async function deleteTerritory(request, response) {
  const result = await removeTerritory(request.params.id);
  if (!result) {
    response.status(404).json({ error: 'No se encontró el territorio' });
    return;
  }

  response.status(result.deleted ? 200 : 400).json(result);
}

// ---------------------------------------------------------------- ubicaciones

export async function deleteOutingType(request, response) {
  const result = await removeOutingType(request.params.id);
  if (!result) {
    response.status(404).json({ error: 'No se encontró el tipo de salida' });
    return;
  }
  if (!result.deleted) {
    response.status(400).json({ error: 'El tipo congregacional no se puede eliminar' });
    return;
  }

  response.status(200).json(result);
}

// ---------------------------------------------------------------- ubicaciones

export async function getLocationList(_request, response) {
  response.json(await getLocations());
}

export async function postLocation(request, response) {
  const location = validLocation(request.body, response);
  if (!location) return;

  response.status(201).json(await createLocation(location));
}

export async function putLocation(request, response) {
  const changes = validLocation(request.body, response);
  if (!changes) return;

  const updated = await updateLocation(request.params.id, changes);
  if (!updated) {
    response.status(404).json({ error: 'No se encontró la ubicación' });
    return;
  }

  response.json(updated);
}

export async function deleteLocation(request, response) {
  const result = await removeLocation(request.params.id);
  if (!result) {
    response.status(404).json({ error: 'No se encontró la ubicación' });
    return;
  }

  response.status(result.deleted ? 200 : 400).json(result);
}

// ---------------------------------------------------------------- ubicaciones por territorio

export async function getTerritoryLocationList(_request, response) {
  response.json(await getTerritoryLocations());
}

export async function postTerritoryLocation(request, response) {
  const location = validTerritoryLocation(request.body, response);
  if (!location) return;

  response.status(201).json(await createTerritoryLocation(location));
}

export async function putTerritoryLocation(request, response) {
  const changes = validTerritoryLocation(request.body, response);
  if (!changes) return;

  const updated = await updateTerritoryLocation(request.params.id, changes);
  if (!updated) {
    response.status(404).json({ error: 'No se encontró la ubicación' });
    return;
  }

  response.json(updated);
}

export async function deleteTerritoryLocation(request, response) {
  const result = await removeTerritoryLocation(request.params.id);
  if (!result) {
    response.status(404).json({ error: 'No se encontró la ubicación' });
    return;
  }

  response.status(result.deleted ? 200 : 400).json(result);
}

// ---------------------------------------------------------------- tipos de salida

export async function getTypeList(_request, response) {
  response.json(await getOutingTypes());
}

export async function postOutingType(request, response) {
  const name = request.body?.name;
  if (typeof name !== 'string' || !name.trim()) {
    response.status(400).json({ error: 'El nombre del tipo de salida es obligatorio' });
    return;
  }

  response.status(201).json(await createOutingType(name));
}

export async function putOutingType(request, response) {
  const body = request.body || {};
  if (typeof body.name !== 'string' || !body.name.trim() || (body.active !== undefined && typeof body.active !== 'boolean')) {
    response.status(400).json({ error: 'El nombre del tipo de salida es obligatorio' });
    return;
  }

  const changes = { name: body.name.trim() };
  if (typeof body.active === 'boolean') changes.active = body.active;

  const updated = await updateOutingType(request.params.id, changes);
  if (!updated) {
    response.status(404).json({ error: 'No se encontró el tipo de salida' });
    return;
  }

  response.json(updated);
}
