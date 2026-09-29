import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AFTERNOON_ENDS_AT_HOUR,
  AFTERNOON_STARTS_AT_HOUR,
  MORNING_ENDS_AT_HOUR,
  MORNING_STARTS_AT_HOUR,
  isTimeInTurnRange,
  turnOfTime,
} from './availability.js';
import { isAvailableInSlot, slotKey } from '../backend/services/domain.js';

test('la mañana va de 06:00 a 12:00 inclusive', () => {
  assert.equal(turnOfTime('06:00'), 'morning');
  assert.equal(turnOfTime('09:00'), 'morning');
  assert.equal(turnOfTime('11:59'), 'morning');
  assert.equal(turnOfTime('12:00'), 'morning', 'el mediodía todavía es mañana');
  assert.equal(MORNING_STARTS_AT_HOUR, 6);
  assert.equal(MORNING_ENDS_AT_HOUR, 12);
});

test('la tarde va de 13:00 a 21:00 inclusive', () => {
  assert.equal(turnOfTime('13:00'), 'afternoon');
  assert.equal(turnOfTime('18:00'), 'afternoon');
  assert.equal(turnOfTime('21:00'), 'afternoon', 'las 21:00 todavía es tarde');
  assert.equal(AFTERNOON_STARTS_AT_HOUR, 13);
  assert.equal(AFTERNOON_ENDS_AT_HOUR, 21);
});

test('una hora fuera de los rangos no asume turno', () => {
  // El hueco del mediodía y las horas extremas no se asignan a ningún turno.
  for (const time of ['00:00', '05:59', '12:01', '12:30', '12:59', '22:00', '23:59']) {
    assert.equal(turnOfTime(time), null, `${time} no debería tener turno`);
    assert.equal(isTimeInTurnRange(time), false, `${time} está fuera de rango`);
  }
  assert.equal(isTimeInTurnRange('09:00'), true);
  assert.equal(isTimeInTurnRange('19:00'), true);
  // Un texto inválido tampoco inventa un turno.
  assert.equal(turnOfTime(''), null);
  assert.equal(turnOfTime('abc'), null);
});

test('un turno desconocido nunca cuenta como disponibilidad', () => {
  const slots = { [slotKey(2, 'morning')]: true, [slotKey(2, 'afternoon')]: true };
  assert.equal(isAvailableInSlot(slots, 2, 'morning'), true);
  assert.equal(isAvailableInSlot(slots, 2, 'afternoon'), true);
  assert.equal(isAvailableInSlot(slots, 2, null), false);
});

// El caso del enunciado: María solo puede por la mañana de martes a viernes.
function maria() {
  const slots = {};
  for (const weekday of [2, 3, 4, 5]) slots[slotKey(weekday, 'morning')] = true;
  return { id: 'maria', firstName: 'María', lastName: 'Pérez', slots };
}

test('María: por la mañana sí, por la tarde no, en todos los días', () => {
  const days = { 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' };
  for (const [weekday, label] of Object.entries(days)) {
    const slots = maria().slots;
    assert.equal(isAvailableInSlot(slots, Number(weekday), turnOfTime('09:00')), true, `${label} 09:00`);
    assert.equal(isAvailableInSlot(slots, Number(weekday), turnOfTime('10:00')), true, `${label} 10:00`);
    assert.equal(isAvailableInSlot(slots, Number(weekday), turnOfTime('18:00')), false, `${label} 18:00`);
    assert.equal(isAvailableInSlot(slots, Number(weekday), turnOfTime('13:00')), false, `${label} 13:00`);
  }

  // Sábado y domingo nunca están habilitados para ella.
  assert.equal(isAvailableInSlot(maria().slots, 6, turnOfTime('09:00')), false);
  assert.equal(isAvailableInSlot(maria().slots, 0, turnOfTime('09:00')), false);
});

test('el cuadro de disponibilidad es el que decide, no la categoría', () => {
  // Las cuatro categorías se rigen por la misma grilla.
  for (const category of ['Anciano', 'Siervo ministerial', 'Publicador', 'Precursor']) {
    const slots = maria().slots;
    assert.equal(isAvailableInSlot(slots, 2, turnOfTime('09:00')), true, `${category} martes 09:00`);
    assert.equal(isAvailableInSlot(slots, 2, turnOfTime('18:00')), false, `${category} martes 18:00`);
  }
});
