import assert from 'node:assert/strict';
import test from 'node:test';
import { generateOutings, weekdayForDate } from './scheduleGenerator.js';

test('genera todas las salidas de los dias configurados', () => {
  const outings = generateOutings(2026, 10, [
    { id: 'tuesday-morning', weekday: 2, time: '09:45', type: 'Congregacional', active: true },
    { id: 'tuesday-evening', weekday: 2, time: '17:30', type: 'Grupo 1', active: true },
    { id: 'inactive-rule', weekday: 4, time: '17:30', type: 'Grupo 2', active: false },
  ]);

  assert.equal(outings.length, 8);
  assert.equal(outings[0].date, '2026-10-06');
  assert.equal(outings[0].weekday, 'martes');
  assert.equal(outings[0].time, '09:45');
  assert.equal(outings[1].date, outings[0].date);
  assert.equal(outings[1].time, '17:30');
  assert.equal(outings[0].driver, '');
  assert.equal(outings[0].source, 'recurring');
});

test('calcula el dia de la semana a partir de la fecha', () => {
  assert.equal(weekdayForDate('2026-10-15'), 'jueves');
});

test('las salidas congregacionales no reciben una casa de rotación', () => {
  const [outing] = generateOutings(2026, 10, [
    { id: 'congregational-rule', weekday: 2, time: '09:30', type: 'Congregacional', active: true },
  ], { '1': ['house-1'] });

  assert.equal(outing.placeId, null);
  assert.equal(outing.placeType, 'location');
});

test('el tipo identifica el grupo sin un campo grupo aparte', () => {
  const outings = generateOutings(2026, 10, [
    { id: 'group-three', weekday: 4, time: '17:30', type: 'Grupo 3', active: true },
  ], { '3': ['house-three'] });

  assert.equal(outings[0].placeId, 'house-three');
  assert.equal(outings[0].group, undefined);
});

test('un grupo nuevo funciona sin cambiar el codigo', () => {
  const outings = generateOutings(2026, 10, [
    { id: 'group-seven', weekday: 4, time: '17:30', type: 'Grupo 7', active: true },
  ], { '7': ['house-seven', 'house-seven-bis'] });

  assert.equal(outings.length, 5);
  assert.equal(outings[0].placeId, 'house-seven');
  assert.equal(outings[1].placeId, 'house-seven-bis');
});

test('las salidas heredan el color de su regla', () => {
  const outings = generateOutings(2026, 10, [
    { id: 'tuesday', weekday: 2, time: '09:30', type: 'Congregacional', active: true, color: '#1565C0' },
    { id: 'group-one', weekday: 2, time: '18:00', type: 'Grupo 1', active: true, color: '#2E7D32' },
    { id: 'no-color', weekday: 4, time: '18:00', type: 'Grupo 2', active: true },
  ]);

  const de = (ruleId) => outings.find((outing) => outing.configId === ruleId);
  assert.equal(de('tuesday').color, '#1565c0');
  assert.equal(de('group-one').color, '#2e7d32');
  // Una regla sin color deja la salida vacía: el PDF usa el predeterminado.
  assert.equal(de('no-color').color, '');
  assert.equal(de('no-color').colorManualOverride, false);
});

test('el color elegido en una salida tiene prioridad sobre el de su regla', () => {
  const rule = { id: 'group-one', weekday: 2, time: '18:00', type: 'Grupo 1', active: true, color: '#2E7D32' };
  const outings = generateOutings(2026, 10, [rule], {}, {
    preservedColors: { 'group-one:2026-10-06': '#c62828' },
  });

  assert.equal(outings[0].color, '#c62828');
  assert.equal(outings[0].colorManualOverride, true);
});

// ------------------------------------------------- semanas alternadas

// Semana natural de una fecha, contada desde el lunes.
function weekOf(date) {
  const [year, month, day] = date.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const monday = new Date(utc - ((new Date(utc).getUTCDay() + 6) % 7) * 86400000);
  return Math.floor(monday.getTime() / (7 * 86400000));
}

function persona(id, category = 'Precursor', group = '') {
  return {
    id,
    firstName: id,
    lastName: 'Prueba',
    category,
    group,
    generalActive: true,
    monthlyEnabled: true,
    slots: {},
  };
}

test('no repite la semana siguiente y vuelve en la posterior', () => {
  const maria = {
    ...persona('maria'),
    slots: { '1:morning': true, '4:morning': true },
  };
  const salidas = generateOutings(2026, 3, [
    { id: 'lunes', weekday: 1, time: '09:00', type: 'Congregacional', active: true },
    { id: 'jueves', weekday: 4, time: '09:00', type: 'Congregacional', active: true },
  ], {}, { drivers: [maria] });

  const semana1 = salidas.filter((outing) => weekOf(outing.date) === weekOf('2026-03-02'));
  const semana2 = salidas.filter((outing) => weekOf(outing.date) === weekOf('2026-03-09'));
  const semana3 = salidas.filter((outing) => weekOf(outing.date) === weekOf('2026-03-16'));

  // Semana del lunes 2: María. Semana del 9: descansa. Semana del 16: vuelve.
  assert(semana1.every((outing) => outing.driverId === 'maria'), 'semana del 2 al 8: María');
  assert(semana2.every((outing) => outing.driverId === null), 'semana del 9 al 15: nadie');
  assert(semana3.every((outing) => outing.driverId === 'maria'), 'semana del 16 al 22: María vuelve');
});

test('nadie aparece en dos semanas consecutivas, con varias personas', () => {
  const drivers = ['ana', 'beto', 'ciro'].map((id) => ({
    ...persona(id),
    slots: { '2:morning': true, '3:morning': true, '4:morning': true, '5:morning': true },
  }));
  const salidas = generateOutings(2026, 3, [
    { id: 'm', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
    { id: 'x', weekday: 3, time: '09:00', type: 'Congregacional', active: true },
    { id: 'j', weekday: 4, time: '09:00', type: 'Congregacional', active: true },
    { id: 'v', weekday: 5, time: '09:00', type: 'Congregacional', active: true },
  ], {}, { drivers });

  assert(new Set(salidas.map((outing) => weekOf(outing.date))).size > 2, 'debe haber varias semanas');
  for (const salida of salidas) {
    const enSemanaAnterior = salidas.some((otra) => weekOf(otra.date) === weekOf(salida.date) - 1
      && otra.driverId === salida.driverId);
    assert.equal(enSemanaAnterior, false, `${salida.date}: semanas alternadas`);
  }
  // Con tres personas hay reparto real (las semanas de descanso quedan sin
  // conductor, no con un nombre inventado).
  const usados = new Set(salidas.map((salida) => salida.driverId).filter(Boolean));
  assert.equal(usados.size, 3, `deben participar las tres, vio ${[...usados]}`);
});

test('los ancianos no descansan ninguna semana', () => {
  const anciano = { ...persona('anciano', 'Anciano', '1'), slots: { '4:afternoon': true } };
  const salidas = generateOutings(2026, 3, [
    { id: 'jueves', weekday: 4, time: '17:30', type: 'Grupo 1', active: true },
  ], {}, {
    drivers: [anciano],
    rotations: { elders: { '1': ['anciano'] }, groupConductors: {} },
  });

  assert(salidas.length > 3, 'debe haber varias semanas');
  assert(salidas.every((salida) => salida.driverId === 'anciano'), 'el anciano conduce todas las semanas');
});

test('la regla no se rompe entre un mes y el siguiente', () => {
  const maria = { ...persona('maria'), slots: { '2:morning': true } };
  const reglas = [{ id: 'm', weekday: 2, time: '09:00', type: 'Congregacional', active: true }];

  const marzo = generateOutings(2026, 3, reglas, {}, { drivers: [maria] });
  const ultimaSemanaMarzo = weekOf(marzo[marzo.length - 1].date);

  // Abril se genera con el historial de marzo, como hace el sistema real: las
  // asignaciones de meses anteriores llegan en existingAssignments.
  const historial = marzo
    .filter((salida) => salida.driverId)
    .map((salida) => ({ driverId: salida.driverId, date: salida.date }));
  const abril = generateOutings(2026, 4, reglas, {}, { drivers: [maria], existingAssignments: historial });

  const primeraSemanaAbril = weekOf(abril[0].date);
  assert.equal(primeraSemanaAbril - ultimaSemanaMarzo, 1, 'abril sigue a marzo');

  // Si María condujo en la última semana de marzo, la primera de abril queda libre.
  const condujoUltimaSemana = marzo
    .filter((salida) => weekOf(salida.date) === ultimaSemanaMarzo)
    .some((salida) => salida.driverId === 'maria');
  const primeraSemana = abril.filter((salida) => weekOf(salida.date) === primeraSemanaAbril);
  assert(primeraSemana.length > 0, 'abril tiene salidas en su primera semana');
  if (condujoUltimaSemana) {
    assert(primeraSemana.every((salida) => salida.driverId !== 'maria'), 'no repite en la semana siguiente');
  } else {
    assert(primeraSemana.every((salida) => salida.driverId === 'maria'), 'sin semana previa, conduce');
  }
});

test('una corrección manual no la bloquea la regla de semanas', () => {
  const drivers = [
    { ...persona('maria'), slots: { '2:morning': true, '3:morning': true } },
    { ...persona('ana'), slots: { '2:morning': true, '3:morning': true } },
  ];
  const reglas = [
    { id: 'm', weekday: 2, time: '09:00', type: 'Congregacional', active: true },
    { id: 'x', weekday: 3, time: '09:00', type: 'Congregacional', active: true },
  ];

  const inicial = generateOutings(2026, 3, reglas, {}, { drivers });
  const primera = inicial.find((salida) => salida.driverId);
  assert(primera, 'debe haber una asignación');

  // El usuario corrige a mano la otra salida de la misma semana.
  const target = inicial.find((salida) => salida !== primera && salida.weekday === 'miércoles');
  const corregida = generateOutings(2026, 3, reglas, {}, {
    drivers,
    preservedAssignments: { [`${target.configId}:${target.date}`]: { driverId: 'maria', driver: '' } },
  });

  const guardada = corregida.find((salida) => salida.date === target.date);
  assert.equal(guardada.driverId, 'maria', 'la corrección manual se respeta');
  assert.equal(guardada.driverManualOverride, true);
});
