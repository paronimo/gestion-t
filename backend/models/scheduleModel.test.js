import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { isAvailableInSlot, turnOfTime } from '../services/domain.js';

const testDirectory = await mkdtemp(join(tmpdir(), 'gestor-t-model-'));
const testDataFile = join(testDirectory, 'months.json');
process.env.SCHEDULE_DATA_FILE = testDataFile;

const {
  addManualOuting,
  copyMonthConfiguration,
  createDriver,
  createHouse,
  createOutingType,
  createTerritory,
  createTerritoryLocation,
  deleteDriver,
  deleteHouse,
  deleteTerritory,
  getDrivers,
  getHouses,
  getMonth,
  getMonthConfigurationSummary,
  getMonthlyDrivers,
  getMonthlyDriverRotations,
  getMonthlyHouses,
  getMonthlyHouseRotations,
  getOutingTypes,
  getTerritories,
  getTerritoryLocations,
  updateDriver,
  updateDriverAvailability,
  updateHouse,
  updateHouseAvailability,
  updateHouseRotation,
  updateOuting,
  updateTerritory,
  updateTerritoryLocation,
  deleteTerritoryLocation,
  saveConfiguration,
} = await import('./scheduleModel.js');

after(async () => {
  await rm(testDirectory, { recursive: true, force: true });
});

function slots(...keys) {
  return Object.fromEntries(keys.map((key) => [key, true]));
}

// Semana natural de una fecha: lunes 0, martes 1, ... domingo 6.
// Sirve para comprobar la regla de semanas alternadas en las pruebas.
function weekOf(date) {
  const [year, month, day] = date.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const monday = new Date(utc - ((new Date(utc).getUTCDay() + 6) % 7) * 86400000);
  return Math.floor(monday.getTime() / (7 * 86400000));
}

// Las salidas de la primera semana del mes: la regla de semanas alternadas
// deja las siguientes sin conductor si no hay otra persona disponible, y los
// casos de disponibilidad se aíslan en una sola semana.
function primeraSemana(outings = []) {
  const weeks = outings.map((outing) => weekOf(outing.date));
  const first = Math.min(...weeks);
  return outings.filter((outing) => weekOf(outing.date) === first);
}

async function emptyData() {
  await writeFile(testDataFile, JSON.stringify({ drivers: [], houses: [], months: {} }));
}

// ---------------------------------------------------------------- migración

test('migra datos anteriores al modelo de tipo unico y lugar unico', async () => {
  await writeFile(testDataFile, JSON.stringify({
    houses: [{ id: 'house-1', name: 'Flia. Espinoza', group: '1', active: true, congregationalWeekend: true }],
    drivers: [{ id: 'driver-1', firstName: 'Ana', lastName: 'Pérez', category: 'Precursor', active: true }],
    months: {
      '2026-10': {
        configuration: [
          { id: 'rule-a', weekday: 2, time: '09:30', type: 'Grupo', group: '2', meetingPlace: 'Parque', active: true },
          { id: 'rule-b', weekday: 4, time: '17:30', type: 'Congregacional', group: '', meetingPlace: 'C. 14C', active: true },
        ],
        outings: [{
          id: 'legacy',
          source: 'manual',
          date: '2026-10-07',
          type: 'Especial',
          group: '3',
          meetingPlace: 'Plaza de la Salud',
          houseId: 'house-1',
          territory: 'REVISITAS',
        }, {
          id: 'legacy-location',
          source: 'manual',
          date: '2026-10-08',
          type: 'Congregacional',
          group: '',
          meetingPlace: 'C. 14C',
          territory: '',
        }],
        driverAvailability: { 'driver-1': { active: true, weekdays: [2, 4] } },
      },
    },
  }));

  const month = await getMonth(2026, 10);
  assert.equal(month.outings[0].type, 'Grupo 3');
  assert.equal(month.outings[0].placeId, 'house-1');
  assert.equal(month.outings[0].placeType, 'house');
  assert.equal(month.outings[0].group, undefined);
  assert.equal(month.outings[0].houseId, undefined);
  assert.equal(month.outings[0].meetingPlace, undefined);
  assert.deepEqual(month.configuration.map((rule) => rule.type), ['Grupo 2', 'Congregacional']);
  assert(month.configuration.every((rule) => rule.group === undefined));

  const generated = await saveConfiguration(2026, 10, month.configuration);
  // Las reglas ya no llevan lugar: el de una congregacional se define en la salida.
  const congregational = generated.outings.find((outing) => outing.type === 'Congregacional');
  assert.equal(congregational.placeId, null);
  const legacyLocation = (await getMonth(2026, 10)).outings.find((outing) => outing.id === 'legacy-location');
  // Un lugar escrito a mano no es una casa ni una ubicación por territorio: se
  // conserva el texto para poder mostrarlo, sin crear un registro de ubicación.
  assert.equal(legacyLocation.placeId, null);
  assert.equal(legacyLocation.placeType, 'location');
  assert.equal(legacyLocation.legacyPlaceText, 'C. 14C');

  // Los días de precursor pasan a celdas mañana/tarde.
  const monthly = await getMonthlyDrivers(2026, 10);
  assert.deepEqual(monthly[0].slots, { '2:morning': true, '4:morning': true });
});

// ---------------------------------------------------------------- tipos

test('los tipos de salida se registran y sostienen grupos nuevos', async () => {
  await emptyData();
  const initial = await getOutingTypes();
  assert.equal(initial.length, 1);
  assert.equal(initial[0].name, 'Congregacional');

  const groupFive = await createOutingType('Grupo 5');
  assert.equal(groupFive.name, 'Grupo 5');
  assert.deepEqual((await getOutingTypes()).map((type) => type.name), ['Congregacional', 'Grupo 5']);

  const house = await createHouse({ name: 'Casa 5', group: '5', congregationalWeekend: false });
  assert.equal(house.group, '5');
  await updateHouseAvailability(2026, 10, house.id, true);
  await updateHouseRotation(2026, 10, '5', [house.id]);
  const generated = await saveConfiguration(2026, 10, [
    { id: 'g5', weekday: 4, time: '17:30', type: 'Grupo 5', active: true },
  ]);
  assert.equal(generated.outings[0].placeId, house.id);
  assert.equal(generated.outings[0].placeType, 'house');
  assert.equal(generated.outings[0].group, undefined);
});

// ---------------------------------------------------------------- lugares

test('una casa y una ubicación por territorio conviven en la misma salida', async () => {
  await emptyData();
  const house = await createHouse({ name: 'Flia. Espinoza', group: '1', congregationalWeekend: true });
  const location = await createTerritoryLocation({
    name: 'Plaza de la Salud',
    territories: '1, 2',
    mapsUrl: 'https://maps.google.com/?q=plaza',
  });

  assert.equal(location.mapsUrl, 'https://maps.google.com/?q=plaza');
  assert.equal((await getTerritoryLocations())[0].assignedCount, 0);

  const withHouse = await addManualOuting(2026, 10, {
    date: '2026-10-06', time: '17:30', type: 'Grupo 1', driver: '', driverId: null,
    placeId: house.id, placeType: 'house', territory: '',
  });
  const withLocation = await addManualOuting(2026, 10, {
    date: '2026-10-13', time: '09:00', type: 'Congregacional', driver: '', driverId: null,
    placeId: location.id, placeType: 'location', territory: '',
  });

  assert.equal(withHouse.placeId, house.id);
  assert.equal(withLocation.placeId, location.id);
  assert.equal((await getHouses()).find((item) => item.id === house.id).assignedCount, 1);
  assert.equal((await getTerritoryLocations()).find((item) => item.id === location.id).assignedCount, 1);
  assert.deepEqual(await deleteHouse(house.id), { deleted: false, assignedCount: 1 });

  await updateTerritoryLocation(location.id, { name: 'Plaza de la Salud', territories: '1, 2', active: false });
  assert.equal((await getTerritoryLocations())[0].active, false);

  const unused = await createTerritoryLocation({ name: 'Esquina Nueva', territories: '3' });
  assert.deepEqual(await deleteTerritoryLocation(unused.id), { deleted: true, assignedCount: 0 });
});

test('las ubicaciones por territorio no necesitan grupo y las casas sí', async () => {
  await emptyData();
  const location = await createTerritoryLocation({ name: 'Rodolfo Walsh y Vicente Rodríguez', territories: '4' });
  assert.equal(location.group, undefined);

  const house = await createHouse({ name: 'Casa con grupo', group: '2', congregationalWeekend: false });
  assert.equal(house.group, '2');
  await updateHouse(house.id, { name: 'Casa con grupo', group: '', congregationalWeekend: false });
  assert.equal((await getHouses())[0].group, '');
});

// ---------------------------------------------------------------- disponibilidad por turno

test('la disponibilidad por día y turno es de todos los conductores e independiente por mes', async () => {
  await emptyData();
  const categories = ['Anciano', 'Siervo ministerial', 'Publicador', 'Precursor'];
  const drivers = [];
  for (const [index, category] of categories.entries()) {
    drivers.push(await createDriver({ firstName: `Persona${index}`, lastName: category, category }));
  }

  const karina = drivers[0];
  const precursor = drivers[categories.indexOf('Precursor')];
  await updateDriverAvailability(2026, 9, karina.id, slots('2:morning', '4:morning', '4:afternoon', '5:morning'));
  await updateDriverAvailability(2026, 10, karina.id, slots('5:afternoon'));

  const september = await getMonthlyDrivers(2026, 9);
  const october = await getMonthlyDrivers(2026, 10);
  assert.deepEqual(september.find((item) => item.id === karina.id).slots, {
    '2:morning': true, '4:morning': true, '4:afternoon': true, '5:morning': true,
  });
  assert.deepEqual(october.find((item) => item.id === karina.id).slots, { '5:afternoon': true });
  assert.equal(september.find((item) => item.id === karina.id).active, true);
  assert.equal(october.find((item) => item.id === karina.id).active, true);

  // Todos los conductores aceptan la misma configuración, no solo los precursores.
  for (const driver of drivers) {
    await updateDriverAvailability(2026, 9, driver.id, slots('2:afternoon'));
  }
  const all = await getMonthlyDrivers(2026, 9);
  assert.equal(all.length, 4);
  assert(all.every((driver) => driver.slots['2:afternoon'] === true));

  await updateDriverAvailability(2026, 9, precursor.id, slots('2:morning'));
  const precursorMonth = (await getMonthlyDrivers(2026, 9)).find((item) => item.id === precursor.id);
  assert.equal(precursorMonth.category, 'Precursor');
  assert.equal(precursorMonth.slots['2:morning'], true);
  assert.equal(precursorMonth.slots['2:afternoon'], undefined);
});

test('sin ningún turno habilitado el conductor queda no disponible', async () => {
  await emptyData();
  const driver = await createDriver({ firstName: 'Sin', lastName: 'Turnos', category: 'Publicador' });
  await updateDriverAvailability(2026, 9, driver.id, {});
  assert.equal((await getMonthlyDrivers(2026, 9))[0].active, false);
});

test('la disponibilidad distingue mañana de tarde en el mismo día', async () => {
  await emptyData();
  const driver = await createDriver({ firstName: 'Karina', lastName: 'Prueba', category: 'Siervo ministerial' });

  // Martes mañana sí, martes tarde no, jueves tarde sí.
  await updateDriverAvailability(2026, 9, driver.id, slots('2:morning', '4:afternoon'));

  const saved = (await getMonthlyDrivers(2026, 9)).find((item) => item.id === driver.id);
  assert.equal(saved.slots['2:morning'], true);
  assert.equal(saved.slots['2:afternoon'], undefined);
  assert.equal(saved.slots['4:afternoon'], true);
  assert.equal(saved.slots['4:morning'], undefined);
  assert.equal(saved.slots['5:morning'], undefined);

  // La misma persona puede estar disponible un día y no al día siguiente.
  assert.equal(isAvailableInSlot(saved.slots, 2, 'morning'), true);
  assert.equal(isAvailableInSlot(saved.slots, 2, 'afternoon'), false);
  assert.equal(isAvailableInSlot(saved.slots, 4, 'afternoon'), true);
  assert.equal(isAvailableInSlot(saved.slots, 5, 'morning'), false);
});

test('la hora de la salida decide el turno', async () => {
  await emptyData();
  const driver = await createDriver({ firstName: 'Turno', lastName: 'Prueba', category: 'Publicador' });
  await updateDriverAvailability(2026, 9, driver.id, slots('2:morning', '2:afternoon'));

  const saved = (await getMonthlyDrivers(2026, 9))[0];
  assert.equal(turnOfTime('09:00'), 'morning');
  assert.equal(turnOfTime('11:59'), 'morning');
  assert.equal(turnOfTime('12:00'), 'morning', 'la mañana llega hasta las 12:00 inclusive');
  assert.equal(turnOfTime('12:01'), null, 'el hueco del mediodía no tiene turno');
  assert.equal(turnOfTime('13:00'), 'afternoon');
  assert.equal(turnOfTime('17:30'), 'afternoon');
  assert.equal(turnOfTime('21:00'), 'afternoon', 'la tarde llega hasta las 21:00 inclusive');
  assert.equal(isAvailableInSlot(saved.slots, 2, turnOfTime('09:30')), true);
  assert.equal(isAvailableInSlot(saved.slots, 2, turnOfTime('15:00')), true);
});

test('la disponibilidad de cada mes se guarda por separado', async () => {
  await emptyData();
  const driver = await createDriver({ firstName: 'Mes', lastName: 'Prueba', category: 'Publicador' });

  await updateDriverAvailability(2026, 9, driver.id, slots('2:morning', '4:afternoon'));
  await updateDriverAvailability(2026, 10, driver.id, slots('5:morning'));
  await updateDriverAvailability(2026, 11, driver.id, {});

  const september = (await getMonthlyDrivers(2026, 9)).find((item) => item.id === driver.id);
  const october = (await getMonthlyDrivers(2026, 10)).find((item) => item.id === driver.id);
  const november = (await getMonthlyDrivers(2026, 11)).find((item) => item.id === driver.id);

  assert.deepEqual(september.slots, { '2:morning': true, '4:afternoon': true });
  assert.deepEqual(october.slots, { '5:morning': true });
  assert.deepEqual(november.slots, {});
  assert.equal(september.active, true);
  assert.equal(october.active, true);
  assert.equal(november.active, false);

  // Volver a tocar septiembre no debe alterar octubre ni noviembre.
  await updateDriverAvailability(2026, 9, driver.id, slots('2:afternoon'));
  assert.deepEqual((await getMonthlyDrivers(2026, 9)).find((item) => item.id === driver.id).slots, { '2:afternoon': true });
  assert.deepEqual((await getMonthlyDrivers(2026, 10)).find((item) => item.id === driver.id).slots, { '5:morning': true });
  assert.deepEqual((await getMonthlyDrivers(2026, 11)).find((item) => item.id === driver.id).slots, {});
});

test('la disponibilidad sobrevive a un reinicio del backend', async () => {
  await emptyData();
  const driver = await createDriver({ firstName: 'Persistente', lastName: 'Prueba', category: 'Precursor' });
  await updateDriverAvailability(2026, 9, driver.id, slots('2:morning', '4:afternoon'));

  // Se vuelve a leer el archivo como lo haría un proceso recién iniciado.
  const reread = JSON.parse(await readFile(testDataFile, 'utf8'));
  const stored = reread.months['2026-09'].driverAvailability[driver.id].slots;
  assert.deepEqual(stored, { '2:morning': true, '4:afternoon': true });
});

test('cada categoría de la copia es independiente de las demás', async () => {
  await emptyData();
  const house1 = await createHouse({ name: 'Casa 1', group: '1', congregationalWeekend: false });
  const house2 = await createHouse({ name: 'Casa 2', group: '2', congregationalWeekend: false });
  const driver = await createDriver({ firstName: 'Ana', lastName: 'Prueba', category: 'Publicador' });

  await updateHouseAvailability(2026, 9, house1.id, true);
  await updateHouseAvailability(2026, 9, house2.id, false);
  await updateHouseRotation(2026, 9, '1', [house1.id]);
  await updateHouseRotation(2026, 9, '2', [house2.id]);
  await updateDriverAvailability(2026, 9, driver.id, slots('2:morning', '4:afternoon'));
  await saveConfiguration(2026, 9, [
    { id: 'tuesday', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
  ]);

  // El destino arranca con su propia configuración, distinta en todo.
  await updateHouseAvailability(2026, 10, house1.id, false);
  await updateHouseAvailability(2026, 10, house2.id, true);
  await updateHouseRotation(2026, 10, '2', []);
  await updateDriverAvailability(2026, 10, driver.id, slots('5:morning'));
  await saveConfiguration(2026, 10, [
    { id: 'friday', weekday: 5, time: '10:00', type: 'Especial', active: true },
  ]);

  // Copiar solo casas: no debe tocar conductores ni reglas.
  const soloCasas = await copyMonthConfiguration(2026, 9, 2026, 10, {
    recurringRules: false,
    groupConfigurations: false,
    houseAvailability: true,
    houseRotations: false,
    driverAvailability: false,
    driverRotations: false,
  });
  assert.deepEqual(soloCasas.houseAvailability, { [house1.id]: true, [house2.id]: false });
  assert.deepEqual(soloCasas.houseRotations, { '2': [] }, 'la rotación no se copió');
  assert.deepEqual(soloCasas.driverAvailability[driver.id].slots, { '5:morning': true });
  assert.deepEqual(soloCasas.configuration.map((rule) => rule.type), ['Especial']);

  // Copiar solo la disponibilidad de conductores, en un destino intacto.
  await copyMonthConfiguration(2026, 9, 2026, 12, {
    recurringRules: false,
    groupConfigurations: false,
    houseAvailability: false,
    houseRotations: false,
    driverAvailability: true,
    driverRotations: false,
  });
  const soloConductores = await getMonth(2026, 12);
  assert.deepEqual(soloConductores.driverAvailability[driver.id].slots, { '2:morning': true, '4:afternoon': true });
  assert.deepEqual(soloConductores.houseAvailability, {}, 'copiar conductores no toca las casas');
  assert.deepEqual(soloConductores.houseRotations, {});
});

test('copiar reglas recalcula las fechas del mes destino', async () => {
  await emptyData();
  await saveConfiguration(2026, 9, [
    { id: 'rule', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
  ]);
  const september = await getMonth(2026, 9);
  assert(september.outings.every((outing) => outing.date.startsWith('2026-09')));

  await copyMonthConfiguration(2026, 9, 2026, 11, {
    recurringRules: true,
    groupConfigurations: true,
    houseAvailability: false,
    houseRotations: false,
    driverAvailability: false,
    driverRotations: false,
  });

  const november = await getMonth(2026, 11);
  assert.equal(november.configuration.length, 1);
  assert.notEqual(november.configuration[0].id, 'rule');
  assert(november.outings.length > 0);
  assert(november.outings.every((outing) => outing.date.startsWith('2026-11')));
  assert(!november.outings.some((outing) => outing.date.startsWith('2026-09')));
});

test('copiar no arrastra las salidas individuales del origen', async () => {
  await emptyData();
  const manual = await addManualOuting(2026, 9, {
    date: '2026-09-07', time: '10:00', type: 'Manual',
    driver: '', driverId: null, placeId: null, placeType: 'location', territory: '38',
  });
  const destinationManual = await addManualOuting(2026, 10, {
    date: '2026-10-08', time: '11:00', type: 'Del destino',
    driver: '', driverId: null, placeId: null, placeType: 'location', territory: 'REVISITAS',
  });
  await saveConfiguration(2026, 9, [
    { id: 'rule', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
  ]);
  await saveConfiguration(2026, 10, [
    { id: 'rule', weekday: 4, time: '09:00', type: 'Congregacional', active: true },
  ]);

  await copyMonthConfiguration(2026, 9, 2026, 10, {
    recurringRules: true,
    groupConfigurations: true,
    houseAvailability: false,
    houseRotations: false,
    driverAvailability: false,
    driverRotations: false,
  });

  const novemberOutings = (await getMonth(2026, 10)).outings;
  assert(!novemberOutings.some((outing) => outing.id === manual.id), 'no debe copiar la manual del origen');
  assert(novemberOutings.some((outing) => outing.id === destinationManual.id && outing.territory === 'REVISITAS'));
});

test('el resumen indica qué configuración tiene el destino', async () => {
  await emptyData();
  const house = await createHouse({ name: 'Casa 1', group: '1', congregationalWeekend: false });
  const driver = await createDriver({ firstName: 'Ana', lastName: 'Prueba', category: 'Publicador' });
  await updateHouseAvailability(2026, 10, house.id, true);
  await updateDriverAvailability(2026, 10, driver.id, slots('2:morning'));
  await saveConfiguration(2026, 10, [
    { id: 'rule', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
  ]);

  const empty = await getMonthConfigurationSummary(2026, 9);
  assert.equal(empty.rules, 0);
  assert.equal(empty.housesAvailable, 0);
  assert.equal(empty.driversWithSlots, 0);

  const filled = await getMonthConfigurationSummary(2026, 10);
  assert.equal(filled.rules, 1);
  assert.equal(filled.housesAvailable, 1);
  assert.equal(filled.driversWithSlots, 1);
  assert.equal(filled.recurringOutings, 4);
});

test('la disponibilidad sobrevive a un reinicio del backend', async () => {
  await emptyData();
  const driver = await createDriver({ firstName: 'Persistente', lastName: 'Prueba', category: 'Precursor' });
  await updateDriverAvailability(2026, 9, driver.id, slots('2:morning', '4:afternoon'));

  // Se vuelve a leer el archivo como lo haría un proceso recién iniciado.
  const reread = JSON.parse(await readFile(testDataFile, 'utf8'));
  const stored = reread.months['2026-09'].driverAvailability[driver.id].slots;
  assert.deepEqual(stored, { '2:morning': true, '4:afternoon': true });
});

test('copiar configuración copia la disponibilidad por día y turno', async () => {
  await emptyData();
  const driver = await createDriver({ firstName: 'Karina', lastName: 'Prueba', category: 'Publicador' });
  await updateDriverAvailability(2026, 9, driver.id, slots('4:morning', '5:morning'));
  await updateDriverAvailability(2026, 10, driver.id, slots('4:afternoon'));

  await copyMonthConfiguration(2026, 9, 2026, 11, {
    recurringRules: true,
    houseAvailability: true,
    houseRotations: true,
    driverAvailability: true,
    driverRotations: true,
    groupConfigurations: true,
  });
  const november = (await getMonthlyDrivers(2026, 11)).find((item) => item.id === driver.id);
  assert.deepEqual(november.slots, { '4:morning': true, '5:morning': true });
  assert.deepEqual((await getMonthlyDrivers(2026, 10)).find((item) => item.id === driver.id).slots, { '4:afternoon': true });
});

// ---------------------------------------------------------------- regresión: casas y conductores

test('casas y conductores mantienen registros generales y disponibilidad independiente por mes', async () => {
  await emptyData();
  const house = await createHouse({ name: 'Casa de prueba', group: '2', congregationalWeekend: true });
  const driver = await createDriver({ firstName: 'Ana', lastName: 'Prueba', category: 'Publicador', group: '' });

  await updateHouseAvailability(2026, 9, house.id, true);
  await updateHouseAvailability(2026, 10, house.id, false);
  await updateHouseAvailability(2026, 11, house.id, true);
  await updateDriverAvailability(2026, 9, driver.id, slots('2:morning'));
  await updateDriverAvailability(2026, 10, driver.id, {});
  await updateDriverAvailability(2026, 11, driver.id, slots('5:afternoon'));

  assert.equal((await getMonthlyHouses(2026, 9)).find((item) => item.id === house.id).available, true);
  assert.equal((await getMonthlyHouses(2026, 10)).find((item) => item.id === house.id).available, false);
  assert.equal((await getMonthlyHouses(2026, 11)).find((item) => item.id === house.id).available, true);
  assert.deepEqual((await getMonthlyDrivers(2026, 9)).find((item) => item.id === driver.id).slots, { '2:morning': true });
  assert.deepEqual((await getMonthlyDrivers(2026, 10)).find((item) => item.id === driver.id).slots, {});
  assert.deepEqual((await getMonthlyDrivers(2026, 11)).find((item) => item.id === driver.id).slots, { '5:afternoon': true });

  await updateHouse(house.id, { ...house, active: false });
  await updateDriver(driver.id, { ...driver, active: false });
  assert.equal((await getMonthlyHouses(2026, 9)).find((item) => item.id === house.id).generalActive, false);
  assert.equal((await getMonthlyDrivers(2026, 9)).find((item) => item.id === driver.id).generalActive, false);
  assert.equal((await getMonthlyHouses(2026, 9)).find((item) => item.id === house.id).available, true);
});

test('copia opciones elegidas, regenera el destino y conserva solo su historial individual', async () => {
  const sourceManual = { id: 'source-manual', source: 'manual', date: '2026-10-01', time: '09:00' };
  const destinationManual = { id: 'destination-manual', source: 'manual', date: '2026-11-01', time: '10:00' };
  const destinationOldRecurring = { id: 'old-recurring', source: 'recurring', date: '2026-11-02', time: '11:00' };
  await writeFile(testDataFile, JSON.stringify({
    types: [{ id: 'congregacional', name: 'Congregacional', active: true }],
    houses: [
      { id: 'house-1', name: 'Casa 1', group: '1', active: true, congregationalWeekend: false },
      { id: 'house-2', name: 'Casa 2', group: '2', active: true, congregationalWeekend: true },
    ],
    drivers: [
      { id: 'precursor-1', firstName: 'Ana', lastName: 'Pérez', category: 'Precursor', active: true },
      { id: 'driver-2', firstName: 'Luis', lastName: 'Gómez', category: 'Publicador', group: '2', active: true },
    ],
    months: {
      '2026-10': {
        configuration: [
          { id: 'source-general', weekday: 2, time: '09:30', type: 'Congregacional', active: true },
          { id: 'source-group', weekday: 4, time: '17:30', type: 'Grupo 2', active: true },
        ],
        outings: [sourceManual],
        houseAvailability: { 'house-1': true, 'house-2': false },
        houseRotations: { '1': ['house-1'], '2': ['house-2'] },
        driverAvailability: {
          'precursor-1': { slots: { '2:morning': true, '4:morning': true } },
          'driver-2': { slots: {} },
        },
        driverRotations: { elders: { '1': ['precursor-1'] }, groupConductors: { '2': ['driver-2'] } },
      },
      '2026-11': {
        configuration: [
          { id: 'target-general', weekday: 1, time: '10:00', type: 'Antigua', active: true },
          { id: 'target-group', weekday: 1, time: '11:00', type: 'Grupo 4', active: true },
        ],
        outings: [destinationManual, destinationOldRecurring],
        houseAvailability: { 'house-1': false, 'house-2': true },
        houseRotations: { '1': [], '2': ['house-2'] },
        driverAvailability: {
          'precursor-1': { slots: { '3:morning': true } },
          'driver-2': { slots: { '1:morning': true } },
        },
        driverRotations: { elders: {}, groupConductors: {} },
      },
    },
  }));

  const copied = await copyMonthConfiguration(2026, 10, 2026, 11, {
    recurringRules: true,
    houseAvailability: true,
    houseRotations: true,
    driverAvailability: true,
    driverRotations: true,
    groupConfigurations: true,
  });

  // Al copiar reglas recurrentes, el destino toma las del mes origen.
  assert.deepEqual(copied.configuration.map((rule) => rule.type).sort(), ['Congregacional', 'Grupo 2']);
  assert.equal(copied.houseAvailability['house-1'], true);
  assert.equal(copied.houseAvailability['house-2'], false);
  assert.deepEqual(copied.houseRotations, { '1': ['house-1'], '2': ['house-2'] });
  // La disponibilidad se combina: el destino conserva sus turnos y suma los del origen.
  assert.deepEqual(copied.driverAvailability['precursor-1'].slots, { '2:morning': true, '3:morning': true, '4:morning': true });
  assert.deepEqual(copied.driverAvailability['driver-2'].slots, { '1:morning': true });
  assert.deepEqual(copied.driverRotations, { elders: { '1': ['precursor-1'] }, groupConductors: { '2': ['driver-2'] } });
  assert(copied.outings.some((outing) => outing.id === 'destination-manual'));
  assert(!copied.outings.some((outing) => outing.id === 'source-manual'));
  assert(!copied.outings.some((outing) => outing.id === 'old-recurring'));
  assert(copied.outings.some((outing) => outing.source === 'recurring' && outing.date.startsWith('2026-11')));

  await saveConfiguration(2026, 11, [
    { id: 'target-general-only', weekday: 1, time: '10:00', type: 'Destino', active: true },
    { id: 'target-group-only', weekday: 1, time: '11:00', type: 'Grupo 4', active: true },
  ]);
  const groupOnly = await copyMonthConfiguration(2026, 10, 2026, 11, {
    recurringRules: false, houseAvailability: false, driverAvailability: false, groupConfigurations: true,
  });
  // Al copiar solo configuraciones de grupo, las reglas generales del destino
  // ("Destino") se conservan y las de grupo se reemplazan por las del origen.
  assert.deepEqual(groupOnly.configuration.map((rule) => rule.type).sort(), ['Destino', 'Grupo 2']);
  assert.equal(groupOnly.houseAvailability['house-1'], true);
  assert(groupOnly.outings.some((outing) => outing.id === 'destination-manual'));
});

test('deshabilitar un registro general conserva asignaciones de meses anteriores', async () => {
  const historicalHouseId = 'history-house';
  const historicalDriverId = 'history-driver';
  await writeFile(testDataFile, JSON.stringify({
    houses: [{ id: historicalHouseId, name: 'Histórica', group: '1', congregationalWeekend: false, active: true }],
    drivers: [{ id: historicalDriverId, firstName: 'Eva', lastName: 'Histórica', category: 'Publicador', active: true }],
    months: {
      '2026-09': {
        configuration: [],
        outings: [
          { id: 'history', source: 'manual', placeId: historicalHouseId, driverId: historicalDriverId },
          { id: 'legacy-history', source: 'manual', driver: 'Eva Histórica' },
        ],
      },
    },
  }));

  await updateHouse(historicalHouseId, { name: 'Histórica', group: '1', congregationalWeekend: false, active: false });
  await updateDriver(historicalDriverId, { firstName: 'Eva Nueva', lastName: 'Histórica', category: 'Publicador', active: false });
  const history = await getMonth(2026, 9);
  assert.equal(history.outings[0].placeId, historicalHouseId);
  assert.equal(history.outings[0].driverId, historicalDriverId);
  assert.equal(history.outings[1].driver, 'Eva Histórica');
  assert.equal((await getMonthlyHouses(2026, 9))[0].generalActive, false);
  assert.equal((await getMonthlyDrivers(2026, 9))[0].generalActive, false);
  assert.equal((await getDrivers())[0].assignedCount, 2);
  assert.deepEqual(await deleteHouse(historicalHouseId), { deleted: false, assignedCount: 1 });
  assert.deepEqual(await deleteDriver(historicalDriverId), { deleted: false, assignedCount: 2 });

  const unusedHouse = await createHouse({ name: 'Sin historial', group: '1', congregationalWeekend: false });
  const unusedDriver = await createDriver({ firstName: 'Sin', lastName: 'Historial', category: 'Publicador' });
  assert.deepEqual(await deleteHouse(unusedHouse.id), { deleted: true, assignedCount: 0 });
  assert.deepEqual(await deleteDriver(unusedDriver.id), { deleted: true, assignedCount: 0 });
});

test('generar, editar una salida y agregar una manual conserva ambos flujos', async () => {
  await emptyData();
  const generated = await saveConfiguration(2026, 10, [{
    id: 'tuesday-rule', weekday: 2, time: '17:30', type: 'Grupo 2', active: true,
  }]);
  assert.equal(generated.outings.length, 4);

  const first = generated.outings[0];
  const edited = await updateOuting(2026, 10, first.id, { ...first, time: '18:00' });
  const manual = await addManualOuting(2026, 10, {
    date: '2026-10-07', weekday: 'miércoles', time: '10:00', type: 'Especial',
    driver: '', driverId: null, placeId: null, placeType: 'location', territory: '',
  });

  const saved = await getMonth(2026, 10);
  assert.equal(edited.time, '18:00');
  assert.equal(saved.outings.find((outing) => outing.id === first.id).time, '18:00');
  assert(saved.outings.some((outing) => outing.id === manual.id && outing.source === 'manual'));

  const regenerated = await saveConfiguration(2026, 10, [{
    id: 'tuesday-rule', weekday: 2, time: '17:30', type: 'Grupo 2', active: true,
  }]);
  assert.notEqual(regenerated.outings.find((outing) => outing.date === first.date).id, first.id);
  assert.equal(regenerated.outings.find((outing) => outing.date === first.date).time, '17:30');
  assert(regenerated.outings.some((outing) => outing.id === manual.id));
});

test('el lugar manual de una salida recurrente se conserva al regenerar', async () => {
  await emptyData();
  const house = await createHouse({ name: 'Casa 1', group: '1', congregationalWeekend: false });
  const location = await createTerritoryLocation({ name: 'Plaza de la Salud', territories: '1' });
  await updateHouseAvailability(2026, 10, house.id, true);
  await updateHouseRotation(2026, 10, '1', [house.id]);
  const configuration = [{
    id: 'thursday', weekday: 4, time: '17:30', type: 'Grupo 1', active: true,
  }];

  const first = await saveConfiguration(2026, 10, configuration);
  const date = first.outings[0].date;
  assert.equal(first.outings[0].placeId, house.id);

  await updateOuting(2026, 10, first.outings[0].id, { ...first.outings[0], placeId: location.id, placeType: 'location' });
  const regenerated = await saveConfiguration(2026, 10, configuration);
  assert.equal(regenerated.outings.find((outing) => outing.date === date).placeId, location.id);
  assert(regenerated.outings.filter((outing) => outing.date !== date).every((outing) => outing.placeId === house.id));
});

test('el color de la regla se guarda y las salidas lo heredan al regenerar', async () => {
  await emptyData();
  const configuration = [
    { id: 'tuesday', weekday: 2, time: '09:30', type: 'Congregacional', active: true, color: '#1565C0' },
    { id: 'thursday', weekday: 4, time: '18:00', type: 'Grupo 1', active: true, color: '#2E7D32' },
    { id: 'friday', weekday: 5, time: '18:00', type: 'Grupo 2', active: true },
  ];

  const saved = await saveConfiguration(2026, 10, configuration);
  // El color de la regla queda guardado y se vuelve a leer al reabrir la configuración.
  const reopened = await getMonth(2026, 10);
  assert.equal(reopened.configuration.find((rule) => rule.id === 'tuesday').color, '#1565c0');
  assert.equal(reopened.configuration.find((rule) => rule.id === 'friday').color, '');
  assert.equal(saved.outings.find((outing) => outing.configId === 'tuesday').color, '#1565c0');
  assert.equal(saved.outings.find((outing) => outing.configId === 'thursday').color, '#2e7d32');
  assert.equal(saved.outings.find((outing) => outing.configId === 'friday').color, '');
});

test('el color elegido en una salida tiene prioridad y sobrevive a la regeneracion', async () => {
  await emptyData();
  const configuration = [
    { id: 'tuesday', weekday: 2, time: '09:30', type: 'Congregacional', active: true, color: '#1565C0' },
  ];

  const first = await saveConfiguration(2026, 10, configuration);
  const date = first.outings[0].date;
  await updateOuting(2026, 10, first.outings[0].id, { ...first.outings[0], color: '#C62828' });

  const regenerated = await saveConfiguration(2026, 10, configuration);
  const edited = regenerated.outings.find((outing) => outing.date === date);
  assert.equal(edited.color, '#c62828');
  assert.equal(edited.colorManualOverride, true);
  // Las demás salidas del mismo mes siguen con el color de su regla.
  assert(regenerated.outings.filter((outing) => outing.date !== date)
    .every((outing) => outing.color === '#1565c0'));
});

test('quitar el color de una salida devuelve el de su regla', async () => {
  await emptyData();
  const configuration = [
    { id: 'tuesday', weekday: 2, time: '09:30', type: 'Congregacional', active: true, color: '#1565C0' },
  ];

  const first = await saveConfiguration(2026, 10, configuration);
  const date = first.outings[0].date;
  await updateOuting(2026, 10, first.outings[0].id, { ...first.outings[0], color: '#C62828' });
  await updateOuting(2026, 10, first.outings[0].id, { ...first.outings[0], color: '' });

  const regenerated = await saveConfiguration(2026, 10, configuration);
  const cleared = regenerated.outings.find((outing) => outing.date === date);
  assert.equal(cleared.color, '#1565c0');
  assert.equal(cleared.colorManualOverride, false);
});

test('una salida manual guarda su propio color', async () => {
  await emptyData();
  const created = await addManualOuting(2026, 10, {
    date: '2026-10-01', time: '10:00', type: 'Especial', territory: '', color: '#6A1B9A',
  });

  const month = await getMonth(2026, 10);
  assert.equal(month.outings.find((outing) => outing.id === created.id).color, '#6a1b9a');
});

test('asigna solo conductores disponibles en el día y el turno de la salida', async () => {
  await emptyData();
  const morning = await createDriver({ firstName: 'Mañana', lastName: 'Sola', category: 'Publicador' });
  const afternoon = await createDriver({ firstName: 'Tarde', lastName: 'Sola', category: 'Publicador' });
  const both = await createDriver({ firstName: 'Ambos', lastName: 'Turnos', category: 'Publicador' });

  await updateDriverAvailability(2026, 10, morning.id, slots('2:morning'));
  await updateDriverAvailability(2026, 10, afternoon.id, slots('2:afternoon'));
  await updateDriverAvailability(2026, 10, both.id, slots('2:morning', '2:afternoon'));

  const month = await saveConfiguration(2026, 10, [
    { id: 'manana', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
    { id: 'tarde', weekday: 3, time: '15:00', type: 'Congregacional', active: true },
  ]);

  const tuesday = primeraSemana(month.outings.filter((outing) => outing.weekday === 'martes'));
  const wednesday = primeraSemana(month.outings.filter((outing) => outing.weekday === 'miércoles'));

  // Nadie que solo puede por la mañana conduce una salida de la tarde, ni al revés.
  assert(tuesday.every((outing) => outing.time === '09:00'));
  assert(tuesday.every((outing) => [morning.id, both.id].includes(outing.driverId)));

  // Quien solo puede por la mañana nunca conduce una salida de la tarde.
  assert(wednesday.every((outing) => outing.driverId === null
    || [afternoon.id, both.id].includes(outing.driverId)));
  // Con dos candidatos para cuatro salidas, las demás quedan sin definir
  // en lugar de repetir a alguien en días seguidos.
  assert(wednesday.every((outing) => outing.driver === ''), 'no debe inventar un nombre');
});

test('no asigna a quien está inactivo o no disponible este mes', async () => {
  await emptyData();
  const active = await createDriver({ firstName: 'Activo', lastName: 'Mes', category: 'Publicador' });
  const withoutSlots = await createDriver({ firstName: 'Sin', lastName: 'Turnos', category: 'Publicador' });
  const disabled = await createDriver({ firstName: 'Inactivo', lastName: 'Registro', category: 'Publicador' });

  await updateDriverAvailability(2026, 10, active.id, slots('2:morning'));
  await updateDriverAvailability(2026, 10, withoutSlots.id, {});
  await updateDriverAvailability(2026, 10, disabled.id, slots('2:morning'));
  await updateDriver(disabled.id, {
    firstName: 'Inactivo', lastName: 'Registro', category: 'Publicador', active: false,
  });

  const month = await saveConfiguration(2026, 10, [
    { id: 'martes', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
  ]);
  // Solo quien está activo y con el turno marcado recibe la salida; con una
  // única persona, las semanas alternadas quedan sin conductor.
  assert(primeraSemana(month.outings).every((outing) => outing.driverId === active.id));
  assert(!month.outings.some((outing) => [withoutSlots.id, disabled.id].includes(outing.driverId)));
});

test('con varios candidatos reparte y respeta las semanas alternadas', async () => {
  await emptyData();
  const drivers = [];
  for (const name of ['Ana', 'Beto', 'Ciro', 'Dina']) {
    const driver = await createDriver({ firstName: name, lastName: 'Sala', category: 'Publicador' });
    drivers.push(driver);
    await updateDriverAvailability(2026, 10, driver.id, slots('2:morning', '2:afternoon', '4:morning'));
  }

  const month = await saveConfiguration(2026, 10, [
    { id: 'martes', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
  ]);
  const assigned = month.outings.map((outing) => outing.driverId);

  // Ninguna persona toma dos semanas seguidas, aunque haya cuatro candidatas.
  for (const driver of drivers) {
    const weeks = month.outings
      .filter((outing) => outing.driverId === driver.id)
      .map((outing) => weekOf(outing.date));
    for (let index = 1; index < weeks.length; index += 1) {
      assert(weeks[index] - weeks[index - 1] >= 2, 'no debe tomar dos semanas seguidas');
    }
  }
  // Con una salida por semana, las semanas intermedias se cubren rotando entre
  // las personas disponibles: ninguna repite dos semanas seguidas.
  assert(assigned.some(Boolean), 'las salidas tienen conductor');
  // Y se reparte entre las distintas personas disponibles.
  const distintos = new Set(assigned.filter(Boolean));
  assert(distintos.size >= 2, 'el reparto debe usar más de una persona');
});

test('sin candidatos la salida queda sin definir, sin inventar personas', async () => {
  await emptyData();
  const driver = await createDriver({ firstName: 'Única', lastName: 'Persona', category: 'Publicador' });
  // Solo puede los martes por la mañana, pero la salida es los jueves.
  await updateDriverAvailability(2026, 10, driver.id, slots('2:morning'));

  const month = await saveConfiguration(2026, 10, [
    { id: 'jueves', weekday: 4, time: '17:30', type: 'Congregacional', active: true },
  ]);
  // Octubre 2026 tiene cinco jueves.
  assert.equal(month.outings.length, 5);
  assert(month.outings.every((outing) => outing.driverId === null));
  assert(month.outings.every((outing) => outing.driver === ''), 'no debe inventar un nombre');
});

test('la corrección manual de una salida se conserva al regenerar', async () => {
  await emptyData();
  const first = await createDriver({ firstName: 'Ana', lastName: 'Original', category: 'Publicador' });
  const second = await createDriver({ firstName: 'Beto', lastName: 'Alternativa', category: 'Publicador' });
  for (const driver of [first, second]) {
    await updateDriverAvailability(2026, 10, driver.id, slots('2:morning', '2:afternoon', '4:morning', '4:afternoon'));
  }

  const configuration = [
    { id: 'martes', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
    { id: 'jueves', weekday: 4, time: '17:30', type: 'Congregacional', active: true },
  ];
  const month = await saveConfiguration(2026, 10, configuration);
  const target = month.outings[0];
  // Se toma el conductor de una salida del mismo día y turno, para que el cambio
  // sea plausible y la comparación sea directa.
  const corrected = target.driverId === second.id ? first.id : second.id;
  assert.notEqual(corrected, target.driverId, 'la corrección debe cambiar el conductor');

  // El usuario corrige a mano una sola salida.
  await updateOuting(2026, 10, target.id, { ...target, driverId: corrected, driver: '' });

  // La disponibilidad y la rotación general no se tocan.
  assert.deepEqual((await getMonthlyDrivers(2026, 10)).find((d) => d.id === first.id).slots, slots('2:morning', '2:afternoon', '4:morning', '4:afternoon'));
  assert.deepEqual(await getMonthlyDriverRotations(2026, 10), { elders: {}, groupConductors: {} });

  // Regenerar conserva la corrección y no la pisa. Las demás pueden reasignarse:
  // al ocupar el conductor corregido, el reparto automático se reacomoda.
  const regenerated = await saveConfiguration(2026, 10, configuration);
  const correctedOuting = regenerated.outings.find((outing) => outing.date === target.date);
  assert.equal(correctedOuting.driverId, corrected);
  assert.equal(correctedOuting.driverManualOverride, true);
  // Nadie más quedó marcado como corrección manual.
  assert.equal(regenerated.outings.filter((outing) => outing.driverManualOverride).length, 1);
  // Y todas las salidas siguen teniendo un conductor posible según disponibilidad.
  assert(regenerated.outings.every((outing) => outing.driverId === first.id || outing.driverId === second.id));
});

test('asigna rotaciones independientes por grupo y usa conductores de grupo como alternativa', async () => {
  const drivers = [
    { id: 'elder-a', firstName: 'Ana', lastName: 'Anciana', category: 'Anciano', group: '1', active: true },
    { id: 'elder-b', firstName: 'Beto', lastName: 'Anciano', category: 'Anciano', group: '1', active: true },
    { id: 'elder-c', firstName: 'Ciro', lastName: 'Anciano', category: 'Anciano', group: '2', active: true },
    { id: 'ministerial', firstName: 'Dina', lastName: 'Ministra', category: 'Siervo ministerial', group: '1', active: true },
  ];
  const availability = Object.fromEntries(drivers.map((driver) => [driver.id, { slots: { '4:afternoon': true } }]));
  await writeFile(testDataFile, JSON.stringify({
    drivers,
    houses: [],
    months: {
      '2026-10': {
        configuration: [],
        outings: [],
        driverAvailability: availability,
        driverRotations: { elders: { '1': ['elder-b', 'elder-a'], '2': ['elder-c'] }, groupConductors: { '1': ['ministerial'] } },
      },
    },
  }));

  const configuration = [
    { id: 'group-one', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
    { id: 'group-two', weekday: 4, time: '18:00', type: 'Grupo 2', active: true },
  ];
  const october = await saveConfiguration(2026, 10, configuration);
  assert.deepEqual(october.outings.filter((outing) => outing.type === 'Grupo 1').map((outing) => outing.driverId), [
    'elder-b', 'elder-a', 'elder-b', 'elder-a', 'elder-b',
  ]);
  assert.deepEqual(october.outings.filter((outing) => outing.type === 'Grupo 2').map((outing) => outing.driverId), [
    'elder-c', 'elder-c', 'elder-c', 'elder-c', 'elder-c',
  ]);

  await updateDriverAvailability(2026, 10, 'elder-a', {});
  await updateDriverAvailability(2026, 10, 'elder-b', {});
  const fallback = await saveConfiguration(2026, 10, configuration);
  // Sin los ancianos disponibles, el ministerial del grupo cubre las salidas.
  // No está sujeto a las semanas alternadas: las semanas de descanso quedan
  // sin conductor en vez de repetirlo.
  const conMinisterial = fallback.outings.filter((outing) => outing.type === 'Grupo 1');
  assert(conMinisterial.some((outing) => outing.driverId === 'ministerial'));
  assert(!conMinisterial.some((outing) => outing.driverId === 'elder-a' || outing.driverId === 'elder-b'));
  assert.deepEqual(await getMonthlyDriverRotations(2026, 10), {
    elders: { '1': ['elder-b', 'elder-a'], '2': ['elder-c'] },
    groupConductors: { '1': ['ministerial'] },
  });
});

test('respeta la disponibilidad por día y por turno, y aplica semanas alternadas', async () => {
  const drivers = [
    { id: 'precursor', firstName: 'Eva', lastName: 'Precursor', category: 'Precursor', group: '', active: true },
    { id: 'other', firstName: 'Leo', lastName: 'Publicador', category: 'Publicador', group: '', active: true },
  ];
  await writeFile(testDataFile, JSON.stringify({
    drivers,
    houses: [],
    months: {
      '2026-10': {
        configuration: [],
        outings: [],
        driverAvailability: {
          precursor: { slots: { '2:morning': true } },
          other: { slots: { '2:morning': true, '3:morning': true } },
        },
        driverRotations: { elders: {}, groupConductors: {} },
      },
    },
  }));

  const weekdaySchedule = await saveConfiguration(2026, 10, [
    { id: 'tuesday', weekday: 2, time: '09:30', type: 'Congregacional', active: true },
    { id: 'wednesday', weekday: 3, time: '09:30', type: 'Congregacional', active: true },
  ]);
  // Martes 6 y miércoles 7 caen en la MISMA semana: Eva conduce el martes y
  // el miércoles es la única vez que Leo puede ese día (Eva solo tiene martes).
  assert.equal(weekdaySchedule.outings.find((outing) => outing.date === '2026-10-06').driverId, 'precursor');
  assert.equal(weekdaySchedule.outings.find((outing) => outing.date === '2026-10-07').driverId, 'other');
  // Semana del 13: ambos ya condujeron la semana anterior, así que las dos
  // salidas quedan sin definir. La regla no se rompe para llenarlas.
  assert.equal(weekdaySchedule.outings.find((outing) => outing.date === '2026-10-13').driverId, null);
  assert.equal(weekdaySchedule.outings.find((outing) => outing.date === '2026-10-14').driverId, null);
  // Semana del 20: ya nadie condujo la semana anterior, así que ambos vuelven.
  assert.equal(weekdaySchedule.outings.find((outing) => outing.date === '2026-10-20').driverId, 'precursor');
  assert.equal(weekdaySchedule.outings.find((outing) => outing.date === '2026-10-21').driverId, 'other');

  await writeFile(testDataFile, JSON.stringify({
    drivers: [drivers[1]],
    houses: [],
    months: {
      '2026-10': {
        configuration: [], outings: [],
        driverAvailability: { other: { slots: { '1:morning': true, '2:morning': true } } },
        driverRotations: { elders: {}, groupConductors: {} },
      },
    },
  }));
  const consecutiveSchedule = await saveConfiguration(2026, 10, [
    { id: 'monday', weekday: 1, time: '09:00', type: 'Congregacional', active: true },
    { id: 'tuesday-again', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
  ]);
  // Lunes 5 y martes 6 son la MISMA semana: la persona puede conducir las dos,
  // la regla solo separa semanas, no días.
  const lunes = consecutiveSchedule.outings.find((outing) => outing.date === '2026-10-05');
  const martes = consecutiveSchedule.outings.find((outing) => outing.date === '2026-10-06');
  assert.equal(lunes.driverId, 'other');
  assert.equal(martes.driverId, 'other');
  // Lunes 12 ya es la semana siguiente: conduce la semana anterior, no puede.
  const siguiente = consecutiveSchedule.outings.find((outing) => outing.date === '2026-10-12');
  assert.equal(siguiente.driverId, null);
  assert.equal(siguiente.driver, '', 'no debe inventar un nombre');
  // En la semana posterior vuelve a estar disponible.
  assert.equal(consecutiveSchedule.outings.find((outing) => outing.date === '2026-10-19').driverId, 'other');
});

test('la tarde no se toma de quien solo puede por la mañana', async () => {
  const drivers = [
    { id: 'morning-only', firstName: 'Ana', lastName: 'Mañana', category: 'Publicador', group: '', active: true },
    { id: 'afternoon', firstName: 'Beto', lastName: 'Tarde', category: 'Publicador', group: '', active: true },
  ];
  await writeFile(testDataFile, JSON.stringify({
    drivers,
    houses: [],
    months: {
      '2026-10': {
        configuration: [], outings: [],
        driverAvailability: {
          'morning-only': { slots: { '2:morning': true } },
          afternoon: { slots: { '2:afternoon': true } },
        },
        driverRotations: { elders: {}, groupConductors: {} },
      },
    },
  }));

  const schedule = await saveConfiguration(2026, 10, [
    { id: 'morning', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
    { id: 'afternoon', weekday: 2, time: '15:00', type: 'Congregacional', active: true },
  ]);
  assert.equal(schedule.outings.find((outing) => outing.time === '09:00').driverId, 'morning-only');
  assert.equal(schedule.outings.find((outing) => outing.time === '15:00').driverId, 'afternoon');
});

test('no asigna el mismo anciano sábado y domingo seguidos y permite corregir una salida sin cambiar la rotación', async () => {
  const drivers = [
    { id: 'elder-a', firstName: 'Ana', lastName: 'Anciana', category: 'Anciano', group: '1', active: true },
    { id: 'elder-b', firstName: 'Beto', lastName: 'Anciano', category: 'Anciano', group: '1', active: true },
    { id: 'general', firstName: 'Ciro', lastName: 'Publicador', category: 'Publicador', group: '', active: true },
  ];
  await writeFile(testDataFile, JSON.stringify({
    drivers,
    houses: [],
    months: {
      '2026-10': {
        configuration: [], outings: [],
        driverAvailability: {
          'elder-a': { slots: { '4:afternoon': true, '6:morning': true, '0:morning': true } },
          'elder-b': { slots: { '4:afternoon': true, '6:morning': true, '0:morning': true } },
          general: { slots: { '6:morning': true, '0:morning': true } },
        },
        driverRotations: { elders: { '1': ['elder-a', 'elder-b'] }, groupConductors: {} },
      },
    },
  }));

  const configuration = [
    { id: 'group-thursday', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
    { id: 'saturday', weekday: 6, time: '09:00', type: 'Congregacional', active: true },
    { id: 'sunday', weekday: 0, time: '09:00', type: 'Congregacional', active: true },
  ];
  const weekend = await saveConfiguration(2026, 10, configuration);
  const saturday = weekend.outings.find((outing) => outing.date === '2026-10-03');
  const sunday = weekend.outings.find((outing) => outing.date === '2026-10-04');
  assert(saturday.driverId);
  assert(sunday.driverId);
  assert.notEqual(saturday.driverId, sunday.driverId);

  const rotationBeforeEdit = await getMonthlyDriverRotations(2026, 10);
  await saveConfiguration(2026, 10, [configuration[0]]);
  const groupOutings = await getMonth(2026, 10);
  const firstGroupOuting = groupOutings.outings.find((outing) => outing.configId === 'group-thursday' && outing.date === '2026-10-01');
  await updateOuting(2026, 10, firstGroupOuting.id, { ...firstGroupOuting, driverId: 'elder-b', driver: '' });
  const regenerated = await saveConfiguration(2026, 10, [configuration[0]]);
  assert.equal(regenerated.outings.find((outing) => outing.date === '2026-10-01').driverId, 'elder-b');
  assert.equal(regenerated.outings.find((outing) => outing.date === '2026-10-08').driverId, 'elder-b');
  assert.deepEqual(await getMonthlyDriverRotations(2026, 10), rotationBeforeEdit);
});

test('la rotación reparte las salidas del grupo en orden y reinicia el ciclo', async () => {
  await emptyData();
  const rotation = ['Vigneau', 'Stoery', 'Molina', 'Pérez'];
  for (const name of rotation) {
    await createHouse({ name: `Flia. ${name}`, group: '3', congregationalWeekend: false });
  }
  const houses = await getHouses();
  assert.equal(houses.length, 4);
  for (const house of houses) {
    await updateHouseAvailability(2026, 10, house.id, true);
  }
  assert.deepEqual((await updateHouseRotation(2026, 10, '3', houses.map((house) => house.id)))['3'], houses.map((house) => house.id));

  // Jueves y sábado generan 5 salidas cada uno; se revisa el ciclo completo de 4 casas.
  const configuration = [
    { id: 'g3-a', weekday: 4, time: '17:30', type: 'Grupo 3', active: true },
    { id: 'g3-b', weekday: 6, time: '09:00', type: 'Grupo 3', active: true },
  ];
  const month = await saveConfiguration(2026, 10, configuration);
  const groupThree = month.outings.filter((outing) => outing.type === 'Grupo 3');
  assert.equal(groupThree.length, 10);
  assert.deepEqual(
    groupThree.map((outing) => outing.placeId),
    [0, 1, 2, 3, 0, 1, 2, 3, 0, 1].map((index) => houses[index].id),
  );
  assert(groupThree.every((outing) => outing.placeType === 'house'));

  // Generar de nuevo reinicia el ciclo en la misma posición.
  const again = await saveConfiguration(2026, 10, configuration);
  assert.deepEqual(
    again.outings.filter((outing) => outing.type === 'Grupo 3').map((outing) => outing.placeId),
    [0, 1, 2, 3, 0, 1, 2, 3, 0, 1].map((index) => houses[index].id),
  );
});

test('cada grupo rota solo con las casas de ese grupo', async () => {
  await emptyData();
  const g1 = await createHouse({ name: 'Grupo 1 A', group: '1', congregationalWeekend: false });
  const g1b = await createHouse({ name: 'Grupo 1 B', group: '1', congregationalWeekend: false });
  const g2 = await createHouse({ name: 'Grupo 2 A', group: '2', congregationalWeekend: false });

  for (const house of [g1, g1b, g2]) await updateHouseAvailability(2026, 10, house.id, true);
  await updateHouseRotation(2026, 10, '1', [g1.id, g1b.id]);
  await updateHouseRotation(2026, 10, '2', [g2.id]);

  const month = await saveConfiguration(2026, 10, [
    { id: 'g1', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
    { id: 'g2', weekday: 4, time: '18:00', type: 'Grupo 2', active: true },
  ]);

  const groupOne = month.outings.filter((outing) => outing.type === 'Grupo 1');
  const groupTwo = month.outings.filter((outing) => outing.type === 'Grupo 2');
  assert.deepEqual(groupOne.map((outing) => outing.placeId), [g1.id, g1b.id, g1.id, g1b.id, g1.id]);
  assert(groupTwo.every((outing) => outing.placeId === g2.id));
  // Ninguna casa se cruza de grupo.
  assert(!groupOne.some((outing) => outing.placeId === g2.id));
  assert(!groupTwo.some((outing) => outing.placeId === g1.id));
});

test('las congregacionales no toman la rotación de ningún grupo', async () => {
  await emptyData();
  const g1 = await createHouse({ name: 'Grupo 1 A', group: '1', congregationalWeekend: true });
  const g2 = await createHouse({ name: 'Grupo 2 A', group: '2', congregationalWeekend: true });
  for (const house of [g1, g2]) await updateHouseAvailability(2026, 10, house.id, true);
  await updateHouseRotation(2026, 10, '1', [g1.id]);
  await updateHouseRotation(2026, 10, '2', [g2.id]);

  const month = await saveConfiguration(2026, 10, [
    { id: 'congregational', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
    { id: 'g1', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
  ]);

  const congregational = month.outings.filter((outing) => outing.type === 'Congregacional');
  assert.equal(congregational.length, 4);
  assert(congregational.every((outing) => outing.placeId === null), 'no debe tomar una casa por rotación');
  assert(congregational.every((outing) => outing.placeType === 'location'));
  // La salida del grupo sí usa su rotación.
  assert(month.outings.filter((outing) => outing.type === 'Grupo 1').every((outing) => outing.placeId === g1.id));
});

test('una congregacional puede usar una casa o una ubicación por territorio como lugar de encuentro', async () => {
  await emptyData();
  const house = await createHouse({ name: 'Flia. Espinoza', group: '1', congregationalWeekend: true });
  const location = await createTerritoryLocation({ name: 'Plaza de la Salud', territories: '1', mapsUrl: 'https://maps.google.com/?q=plaza' });
  await updateHouseAvailability(2026, 10, house.id, true);

  const withHouse = await addManualOuting(2026, 10, {
    date: '2026-10-03', time: '09:00', type: 'Congregacional',
    driver: '', driverId: null, placeId: house.id, placeType: 'house', territory: '',
  });
  const withLocation = await addManualOuting(2026, 10, {
    date: '2026-10-04', time: '09:00', type: 'Congregacional',
    driver: '', driverId: null, placeId: location.id, placeType: 'location', territory: '',
  });

  assert.equal(withHouse.placeType, 'house');
  assert.equal(withLocation.placeType, 'location');
  assert.equal((await getHouses())[0].assignedCount, 1);
  assert.equal((await getTerritoryLocations())[0].assignedCount, 1);
  // Ambas cuentas igual como lugar de encuentro, sin columna Casa.
  assert(withHouse.placeId && withLocation.placeId);
});

test('editar el lugar de una salida no cambia la rotación ni las demás salidas', async () => {
  await emptyData();
  const first = await createHouse({ name: 'Flia. Vigneau', group: '3', congregationalWeekend: false });
  const second = await createHouse({ name: 'Flia. Stoery', group: '3', congregationalWeekend: false });
  const location = await createTerritoryLocation({ name: 'Plaza de la Salud', territories: '3' });
  for (const house of [first, second]) await updateHouseAvailability(2026, 10, house.id, true);
  await updateHouseRotation(2026, 10, '3', [first.id, second.id]);

  const configuration = [{ id: 'g3', weekday: 4, time: '17:30', type: 'Grupo 3', active: true }];
  const month = await saveConfiguration(2026, 10, configuration);
  const target = month.outings[0];
  const rotationBefore = await getMonthlyHouseRotations(2026, 10);

  await updateOuting(2026, 10, target.id, {
    ...target, placeId: location.id, placeType: 'location',
  });

  const saved = await getMonth(2026, 10);
  assert.equal(saved.outings.find((outing) => outing.id === target.id).placeId, location.id);
  assert.equal(saved.outings.find((outing) => outing.id === target.id).placeType, 'location');
  // El resto de las salidas conserva la casa que le tocó.
  assert.deepEqual(
    saved.outings.filter((outing) => outing.id !== target.id).map((outing) => outing.placeId),
    month.outings.filter((outing) => outing.id !== target.id).map((outing) => outing.placeId),
  );
  // La rotación no se toca.
  assert.deepEqual(await getMonthlyHouseRotations(2026, 10), rotationBefore);
});

test('la casa no aparece como columna propia: todo vive en el lugar de encuentro', async () => {
  await emptyData();
  const house = await createHouse({ name: 'Flia. Vigneau', group: '1', congregationalWeekend: false });
  await updateHouseAvailability(2026, 10, house.id, true);
  await updateHouseRotation(2026, 10, '1', [house.id]);
  const month = await saveConfiguration(2026, 10, [
    { id: 'g1', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
  ]);

  for (const outing of month.outings) {
    // La salida solo tiene lugar de encuentro: no hay campo de casa.
    assert.equal(outing.houseId, undefined);
    assert.equal(outing.meetingPlace, undefined);
    assert(outing.placeId);
  }
});

test('la rotación de casas respeta las casas no elegibles del mes', async () => {
  await emptyData();
  const disabled = await createHouse({ name: 'Deshabilitada', group: '1', congregationalWeekend: false });
  const unavailable = await createHouse({ name: 'No disponible', group: '1', congregationalWeekend: false });
  const active = await createHouse({ name: 'Disponible', group: '1', congregationalWeekend: false });

  // Solo "Disponible" está habilitada en el registro y disponible este mes.
  await updateHouse(disabled.id, { name: 'Deshabilitada', group: '1', congregationalWeekend: false, active: false });
  await updateHouseAvailability(2026, 10, disabled.id, true);
  await updateHouseAvailability(2026, 10, unavailable.id, false);
  await updateHouseAvailability(2026, 10, active.id, true);
  await updateHouseRotation(2026, 10, '1', [disabled.id, unavailable.id, active.id]);

  const month = await saveConfiguration(2026, 10, [
    { id: 'g1', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
  ]);
  assert(month.outings.every((outing) => outing.placeId === active.id));
  assert(!month.outings.some((outing) => outing.placeId === disabled.id || outing.placeId === unavailable.id));
});

test('rota casas en orden, reinicia el ciclo y mantiene grupos y meses independientes', async () => {
  const houses = [
    { id: 'g1-first', name: 'Primera', group: '1', active: true, congregationalWeekend: false },
    { id: 'g1-second', name: 'Segunda', group: '1', active: true, congregationalWeekend: false },
    { id: 'g1-disabled', name: 'Deshabilitada', group: '1', active: false, congregationalWeekend: false },
    { id: 'g1-month-unavailable', name: 'No disponible en octubre', group: '1', active: true, congregationalWeekend: false },
    { id: 'g2-only', name: 'Grupo dos', group: '2', active: true, congregationalWeekend: false },
  ];
  await writeFile(testDataFile, JSON.stringify({
    drivers: [],
    houses,
    months: {
      '2026-10': {
        configuration: [],
        outings: [],
        houseAvailability: Object.fromEntries(houses.map((house) => [house.id, house.id !== 'g1-month-unavailable'])),
        houseRotations: { '1': ['g1-second', 'g1-disabled', 'g1-month-unavailable', 'g1-first'], '2': ['g2-only'] },
      },
      '2026-11': {
        configuration: [],
        outings: [],
        houseAvailability: { 'g1-first': true, 'g1-second': false, 'g1-disabled': true, 'g1-month-unavailable': true, 'g2-only': true },
        houseRotations: { '1': ['g1-first'], '2': ['g2-only'] },
      },
    },
  }));

  const configuration = [
    { id: 'group-1-rule', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
    { id: 'group-2-rule', weekday: 4, time: '18:00', type: 'Grupo 2', active: true },
  ];
  const october = await saveConfiguration(2026, 10, configuration);
  assert.deepEqual(october.outings.filter((outing) => outing.type === 'Grupo 1').map((outing) => outing.placeId), [
    'g1-second', 'g1-first', 'g1-second', 'g1-first', 'g1-second',
  ]);
  assert.deepEqual(october.outings.filter((outing) => outing.type === 'Grupo 2').map((outing) => outing.placeId), [
    'g2-only', 'g2-only', 'g2-only', 'g2-only', 'g2-only',
  ]);
  assert(!october.outings.some((outing) => ['g1-disabled', 'g1-month-unavailable'].includes(outing.placeId)));

  await updateHouseRotation(2026, 10, '1', ['g1-first', 'g1-second']);
  assert.deepEqual(await getMonthlyHouseRotations(2026, 10), {
    '1': ['g1-first', 'g1-second'],
    '2': ['g2-only'],
  });
  assert.deepEqual(await getMonthlyHouseRotations(2026, 11), {
    '1': ['g1-first'],
    '2': ['g2-only'],
  });

  const november = await saveConfiguration(2026, 11, configuration);
  assert(november.outings.filter((outing) => outing.type === 'Grupo 1').every((outing) => outing.placeId === 'g1-first'));
});

// ---------------------------------------------------------------- territorios

test('registra territorios manualmente y los conserva al regenerar el mes', async () => {
  await emptyData();

  const number = await createTerritory({ name: '38' });
  const multiple = await createTerritory({ name: ' 38 ,  33 ' });
  const revisits = await createTerritory({ name: 'REVISITAS' });
  const rural = await createTerritory({ name: 'RURAL' });
  assert.equal(multiple.name, '38, 33');
  assert.equal(number.active, true);
  assert.equal(rural.assignedCount, 0);
  assert.deepEqual((await getTerritories()).map((territory) => territory.name), ['38', '38, 33', 'REVISITAS', 'RURAL']);

  const configuration = [{ id: 'tuesday-rule', weekday: 2, time: '17:30', type: 'Grupo 2', active: true }];
  const generated = await saveConfiguration(2026, 10, configuration);
  assert.equal(generated.outings[0].territory, '');

  const edited = await updateOuting(2026, 10, generated.outings[0].id, {
    ...generated.outings[0], territory: '38, 33',
  });
  assert.equal(edited.territory, '38, 33');
  assert.equal(edited.territoryManualOverride, true);

  const regenerated = await saveConfiguration(2026, 10, configuration);
  assert.equal(regenerated.outings.find((outing) => outing.date === generated.outings[0].date).territory, '38, 33');
  assert(regenerated.outings.filter((outing) => outing.date !== generated.outings[0].date).every((outing) => outing.territory === ''));

  const manual = await addManualOuting(2026, 10, {
    date: '2026-10-07', weekday: 'miércoles', time: '10:00', type: 'Especial',
    driver: '', driverId: null, placeId: null, placeType: 'location', territory: 'REVISITAS',
  });
  await updateOuting(2026, 10, manual.id, { ...manual, territory: 'RURAL' });
  const saved = await getMonth(2026, 10);
  assert.equal(saved.outings.find((outing) => outing.id === manual.id).territory, 'RURAL');
  assert.equal(saved.outings.find((outing) => outing.date === generated.outings[0].date).territory, '38, 33');

  assert.equal((await getTerritories()).find((territory) => territory.id === multiple.id).assignedCount, 1);
  assert.equal((await getTerritories()).find((territory) => territory.id === number.id).assignedCount, 1);
  assert.equal((await getTerritories()).find((territory) => territory.id === revisits.id).assignedCount, 0);

  assert.deepEqual(await deleteTerritory(multiple.id), { deleted: false, assignedCount: 1 });
  await updateTerritory(revisits.id, { name: 'REVISITAS', active: false });
  assert.equal((await getTerritories()).find((territory) => territory.id === revisits.id).active, false);
  assert.deepEqual(await deleteTerritory(revisits.id), { deleted: true, assignedCount: 0 });
  assert.equal((await getTerritories()).some((territory) => territory.id === revisits.id), false);
});

test('cuenta como asignados los territorios que aparecen dentro de una lista de varios', async () => {
  await emptyData();
  const territory = await createTerritory({ name: '38' });
  const other = await createTerritory({ name: '38, 33' });

  await addManualOuting(2026, 9, {
    date: '2026-09-02', weekday: 'miércoles', time: '10:00', type: 'Especial',
    driver: '', driverId: null, placeId: null, placeType: 'location', territory: '38, 33',
  });

  assert.equal((await getTerritories()).find((item) => item.id === territory.id).assignedCount, 1);
  assert.equal((await getTerritories()).find((item) => item.id === other.id).assignedCount, 1);
  assert.deepEqual(await deleteTerritory(territory.id), { deleted: false, assignedCount: 1 });
});

// ------------------------------------------------- disponibilidad y asignación

test('el algoritmo solo asigna a quien tiene el turno marcado en ese día', async () => {
  // Un día por mes para aislar la disponibilidad de la regla de semanas
  // alternadas, que sí se aplica dentro de cada mes.
  const casos = [
    { mes: 1, weekday: 2, manana: '09:00', tarde: '18:00' },
    { mes: 2, weekday: 3, manana: '10:00', tarde: '18:00' },
    { mes: 3, weekday: 4, manana: '11:00', tarde: '19:00' },
    { mes: 4, weekday: 5, manana: '06:00', tarde: '21:00' },
  ];

  for (const caso of casos) {
    await emptyData();
    // María: solo la mañana de ese día.
    const maria = await createDriver({ firstName: 'María', lastName: 'Pérez', category: 'Precursor' });
    await updateDriverAvailability(2026, caso.mes, maria.id, slots(`${caso.weekday}:morning`));

    const month = await saveConfiguration(2026, caso.mes, [
      { id: 'manana', weekday: caso.weekday, time: caso.manana, type: 'Congregacional', active: true },
      { id: 'tarde', weekday: caso.weekday, time: caso.tarde, type: 'Congregacional', active: true },
    ]);
    const en = (ruleId) => month.outings.filter((outing) => outing.configId === ruleId);

    // 09:00, 10:00, 11:00 y 06:00 son mañana: María es candidata. Tomar la salida
    // de la tarde de la misma semana no se le permite, así que solo puede
    // conducir la salida de mañana de esa semana.
    assert(en('manana').length > 0, `mes ${caso.mes}: la salida de mañana debería existir`);
    assert(en('manana').some((outing) => outing.driverId === maria.id), `mes ${caso.mes}: ${caso.manana} es de mañana`);
    // María es la única con ese turno: donde hay conductor, es ella; el resto
    // queda libre por la regla de semanas alternadas.
    assert(en('manana').every((outing) => [maria.id, null].includes(outing.driverId)), `mes ${caso.mes}: solo María puede por la mañana`);
    // 18:00, 19:00 y 21:00 son tarde: María no tiene ese turno marcado.
    assert(en('tarde').length > 0, `mes ${caso.mes}: la salida de tarde debería existir`);
    assert(en('tarde').every((outing) => outing.driverId === null), `mes ${caso.mes}: ${caso.tarde} es de tarde`);
  }
});

test('la disponibilidad se toma del mes que se está generando', async () => {
  await emptyData();
  const maria = await createDriver({ firstName: 'María', lastName: 'Pérez', category: 'Precursor' });
  const rule = { id: 'martes', weekday: 2, time: '09:00', type: 'Congregacional', active: true };

  // Octubre: María no tiene ningún turno.
  await updateDriverAvailability(2026, 10, maria.id, {});
  const october = await saveConfiguration(2026, 10, [rule]);
  assert(october.outings.every((outing) => outing.driverId === null));

  // Noviembre: solo la tarde del martes. La misma salida de mañana no la toma.
  await updateDriverAvailability(2026, 11, maria.id, slots('2:afternoon'));
  const november = await saveConfiguration(2026, 11, [rule]);
  assert(november.outings.every((outing) => outing.driverId === null));

  // Diciembre: la mañana del martes. Ahí sí se le asigna alguna vez.
  await updateDriverAvailability(2026, 12, maria.id, slots('2:morning'));
  const december = await saveConfiguration(2026, 12, [rule]);
  assert(december.outings.some((outing) => outing.driverId === maria.id));

  // Volver a octubre no toma la disponibilidad de diciembre.
  const octoberAgain = await saveConfiguration(2026, 10, [rule]);
  assert(octoberAgain.outings.every((outing) => outing.driverId === null));
});

test('una salida fuera de los rangos de turno no recibe conductor automático', async () => {
  await emptyData();
  const maria = await createDriver({ firstName: 'María', lastName: 'Pérez', category: 'Precursor' });
  // Se habilitan los dos turnos: aun así, una hora sin turno no puede asignarse.
  await updateDriverAvailability(2026, 10, maria.id, slots('2:morning', '2:afternoon', '3:morning', '3:afternoon'));

  const configuration = [
    { id: 'hueco', weekday: 2, time: '12:30', type: 'Congregacional', active: true },
    { id: 'madrugada', weekday: 2, time: '05:00', type: 'Congregacional', active: true },
    { id: 'noche', weekday: 2, time: '22:00', type: 'Congregacional', active: true },
    { id: 'valida', weekday: 3, time: '09:00', type: 'Congregacional', active: true },
  ];

  const month = await saveConfiguration(2026, 10, configuration);
  const en = (ruleId) => month.outings.filter((outing) => outing.configId === ruleId);

  for (const ruleId of ['hueco', 'madrugada', 'noche']) {
    assert(en(ruleId).length > 0, `${ruleId} debería generarse`);
    assert(en(ruleId).every((outing) => outing.driverId === null), `${ruleId} no debería tener conductor`);
    assert(en(ruleId).every((outing) => outing.turnOutOfRange === true), `${ruleId} se marca fuera de rango`);
    assert(en(ruleId).every((outing) => outing.turn === null), `${ruleId} no tiene turno`);
  }
  // Una hora válida sigue funcionando normal.
  assert(en('valida').some((outing) => outing.driverId === maria.id));
  assert(en('valida').every((outing) => [maria.id, null].includes(outing.driverId)));
  assert(en('valida').every((outing) => outing.turnOutOfRange === false));
});

// ------------------------------------------- ubicaciones por territorio

test('guarda una ubicación con sus territorios cercanos y la conserva al reabrir', async () => {
  await emptyData();
  const created = await createTerritoryLocation({
    name: 'Plaza de la Salud',
    territories: '1, 2, 3, 4',
    mapsUrl: 'https://maps.google.com/?q=plaza',
  });

  assert.equal(created.territories, '1, 2, 3, 4');
  assert.equal(created.active, true);
  assert.equal(created.assignedCount, 0);

  const reopened = await getTerritoryLocations();
  assert.equal(reopened.length, 1);
  assert.equal(reopened[0].name, 'Plaza de la Salud');
  assert.equal(reopened[0].territories, '1, 2, 3, 4');
  assert.equal(reopened[0].mapsUrl, 'https://maps.google.com/?q=plaza');
});

test('acepta una ubicación sin enlace de Google Maps', async () => {
  await emptyData();
  const created = await createTerritoryLocation({ name: 'Esquina X', territories: '4' });
  assert.equal(created.mapsUrl, '');
  const [saved] = await getTerritoryLocations();
  assert.equal(saved.territories, '4');
});

test('normaliza los territorios al guardar y al editar', async () => {
  await emptyData();
  const created = await createTerritoryLocation({ name: 'Plaza', territories: ' 1 , 2 ,1, 3 ' });
  assert.equal(created.territories, '1, 2, 3');

  const updated = await updateTerritoryLocation(created.id, { name: 'Plaza', territories: '5, 5, 6' });
  assert.equal(updated.territories, '5, 6');
});

test('activa y desactiva una ubicación', async () => {
  await emptyData();
  const created = await createTerritoryLocation({ name: 'Plaza', territories: '1' });
  const off = await updateTerritoryLocation(created.id, { name: 'Plaza', territories: '1', active: false });
  assert.equal(off.active, false);
  assert.equal((await getTerritoryLocations())[0].active, false);
});

test('elimina una ubicación sin historial y protege la que sí lo tiene', async () => {
  await emptyData();
  const libre = await createTerritoryLocation({ name: 'Plaza', territories: '1' });
  const usada = await createTerritoryLocation({ name: 'Esquina', territories: '2' });

  const result = await deleteTerritoryLocation(libre.id);
  assert.equal(result.deleted, true);
  assert.equal((await getTerritoryLocations()).length, 1);

  // Con salidas asignadas solo se puede deshabilitar, para no romper el historial.
  await addManualOuting(2026, 10, {
    date: '2026-10-01', time: '10:00', type: 'Especial', territory: '', placeId: usada.id,
  });
  const protegida = await deleteTerritoryLocation(usada.id);
  assert.equal(protegida.deleted, false);
  assert.equal(protegida.assignedCount, 1);
  assert.equal((await getTerritoryLocations())[0].assignedCount, 1);
});

test('varias ubicaciones pueden compartir un territorio', async () => {
  await emptyData();
  await createTerritoryLocation({ name: 'Plaza de la Salud', territories: '1, 2, 3, 4' });
  await createTerritoryLocation({ name: 'Esquina X', territories: '4, 5' });
  await createTerritoryLocation({ name: 'Casa de la Familia Pérez', territories: '10, 11, 12' });

  const saved = await getTerritoryLocations();
  assert.equal(saved.length, 3);
  // El territorio 4 aparece en dos, sin perder ninguno.
  assert.equal(saved.filter((location) => location.territories.includes('4')).length, 2);
});

test('aceptar una sugerencia no modifica la regla recurrente', async () => {
  await emptyData();
  const location = await createTerritoryLocation({ name: 'Plaza', territories: '1, 2' });
  const configuration = [
    { id: 'jueves', weekday: 4, time: '09:00', type: 'Congregacional', active: true },
  ];

  const first = await saveConfiguration(2026, 10, configuration);
  const date = first.outings[0].date;
  // El usuario elige la sugerencia: solo cambia esa salida.
  await updateOuting(2026, 10, first.outings[0].id, { ...first.outings[0], placeId: location.id });

  const regenerated = await saveConfiguration(2026, 10, configuration);
  const editada = regenerated.outings.find((outing) => outing.date === date);
  assert.equal(editada.placeId, location.id, 'la elección se conserva');
  // El resto de las salidas no se tocaron.
  assert(regenerated.outings.filter((outing) => outing.date !== date)
    .every((outing) => outing.placeId === null));
  // Y la regla recurrente sigue igual.
  assert.equal(regenerated.configuration[0].type, 'Congregacional');
  assert.equal(regenerated.configuration[0].weekday, 4);
});

test('después de aceptar una sugerencia se puede cambiar el lugar a mano', async () => {
  await emptyData();
  const sugerida = await createTerritoryLocation({ name: 'Plaza', territories: '1' });
  const casa = await createHouse({ name: 'Flia. Espinoza', group: '1', congregationalWeekend: false });
  const configuration = [
    { id: 'jueves', weekday: 4, time: '09:00', type: 'Congregacional', active: true },
  ];

  const first = await saveConfiguration(2026, 10, configuration);
  const salida = first.outings[0];
  await updateOuting(2026, 10, salida.id, { ...salida, placeId: sugerida.id });
  // Luego el usuario corrige a mano: la sugerencia no bloquea.
  await updateOuting(2026, 10, salida.id, { ...salida, placeId: casa.id, placeType: 'house' });

  const regenerated = await saveConfiguration(2026, 10, configuration);
  const final = regenerated.outings.find((outing) => outing.date === salida.date);
  assert.equal(final.placeId, casa.id, 'la edición manual gana');
  assert.equal(final.placeType, 'house');
});
