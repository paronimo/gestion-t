import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availabilityInquiries,
  buildAvailabilityMessage,
  dateParts,
  formatOutingLine,
  formatTime,
  houseOutings,
} from './messaging.js';

const casa = { id: 'vigneau', name: 'Flia. Vigneau', askAvailability: true };

test('la hora se formatea en 12 horas con AM/PM', () => {
  assert.equal(formatTime('10:00'), '10:00 AM');
  assert.equal(formatTime('10:30'), '10:30 AM');
  assert.equal(formatTime('00:15'), '12:15 AM');
  assert.equal(formatTime('12:00'), '12:00 PM');
  assert.equal(formatTime('15:30'), '3:30 PM');
  assert.equal(formatTime('23:05'), '11:05 PM');
  assert.equal(formatTime(''), '');
  assert.equal(formatTime('no-es-hora'), '');
});

test('la fecha trae el día de la semana real, sin corrimiento por zona horaria', () => {
  assert.deepEqual(dateParts('2026-10-27'), { day: 27, month: 10, weekday: 'Martes' });
  assert.deepEqual(dateParts('2026-10-03'), { day: 3, month: 10, weekday: 'Sábado' });
  assert.deepEqual(dateParts('2026-10-04'), { day: 4, month: 10, weekday: 'Domingo' });
  assert.equal(dateParts('27/10/2026'), null);
  assert.equal(dateParts(''), null);
});

test('la línea de salida usa la fecha y la hora reales', () => {
  assert.equal(
    formatOutingLine({ date: '2026-10-27', time: '10:00' }),
    '🟤 Martes 27 a las 10:00 AM',
  );
  assert.equal(
    formatOutingLine({ date: '2026-10-03', time: '15:30' }),
    '🟤 Sábado 3 a las 3:30 PM',
  );
});

test('una sola fecha usa el mensaje en singular', () => {
  const outings = [{ id: 'o1', placeId: 'vigneau', date: '2026-10-27', time: '10:00' }];
  assert.equal(
    buildAvailabilityMessage(casa, outings),
    '¿Estaría disponible tu casa para esta fecha?\n\n🟤 Martes 27 a las 10:00 AM',
  );
});

test('varias fechas usan el mensaje en plural, una línea por fecha real', () => {
  const outings = [
    { id: 'o1', placeId: 'vigneau', date: '2026-10-03', time: '10:30' },
    { id: 'o2', placeId: 'vigneau', date: '2026-10-10', time: '10:00' },
    { id: 'o3', placeId: 'vigneau', date: '2026-10-17', time: '10:00' },
  ];
  assert.equal(
    buildAvailabilityMessage(casa, outings),
    '¿Estaría disponible tu casa para estas fechas?\n\n'
    + '🟤 Sábado 3 a las 10:30 AM\n'
    + '🟤 Sábado 10 a las 10:00 AM\n'
    + '🟤 Sábado 17 a las 10:00 AM',
  );
});

test('las fechas se ordenan por día y hora, aunque lleguen desordenadas', () => {
  const outings = [
    { id: 'o2', placeId: 'vigneau', date: '2026-10-17', time: '10:00' },
    { id: 'o1', placeId: 'vigneau', date: '2026-10-03', time: '10:30' },
    { id: 'o3', placeId: 'vigneau', date: '2026-10-10', time: '10:00' },
  ];
  assert.deepEqual(houseOutings(casa, outings).map((outing) => outing.id), ['o1', 'o3', 'o2']);
});

test('solo cuentan las salidas de esa casa', () => {
  const outings = [
    { id: 'o1', placeId: 'vigneau', date: '2026-10-27', time: '10:00' },
    { id: 'o2', placeId: 'otra', date: '2026-10-28', time: '10:00' },
  ];
  assert.equal(houseOutings(casa, outings).length, 1);
});

test('sin salidas no hay mensaje', () => {
  assert.equal(buildAvailabilityMessage(casa, []), '');
});

test('solo se listan las casas con Preguntar disponibilidad activado', () => {
  const houses = [
    casa,
    { id: 'sin-marca', name: 'Flia. Sin marca', askAvailability: false },
    { id: 'sin-campo', name: 'Flia. Antigua' },
  ];
  const outings = [
    { id: 'o1', placeId: 'vigneau', date: '2026-10-27', time: '10:00' },
    { id: 'o2', placeId: 'sin-marca', date: '2026-10-28', time: '10:00' },
    { id: 'o3', placeId: 'sin-campo', date: '2026-10-29', time: '10:00' },
  ];

  const inquiries = availabilityInquiries(houses, outings, { year: 2026, month: 10 });
  assert.equal(inquiries.length, 1);
  assert.equal(inquiries[0].houseId, 'vigneau');
  assert.equal(inquiries[0].dates.length, 1);
  assert.equal(inquiries[0].dates[0].outingId, 'o1');
});

test('una casa marcada pero sin salidas este mes no genera consulta', () => {
  const inquiries = availabilityInquiries([casa], [], { year: 2026, month: 10 });
  assert.deepEqual(inquiries, []);
});

test('la consulta incluye el estado de confirmación del mes', () => {
  const confirmed = { ...casa, availabilityConfirmed: { '2026-10': '2026-10-01T10:00:00.000Z' } };
  const outings = [{ id: 'o1', placeId: 'vigneau', date: '2026-10-27', time: '10:00' }];

  const [inquiry] = availabilityInquiries([confirmed], outings, { year: 2026, month: 10 });
  assert.equal(inquiry.confirmedAt, '2026-10-01T10:00:00.000Z');

  const [sinConfirmar] = availabilityInquiries([casa], outings, { year: 2026, month: 10 });
  assert.equal(sinConfirmar.confirmedAt, null);
});
