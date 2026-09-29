// Reglas de dominio compartidas por el backend, el frontend y las pruebas.
// Los grupos viven en los datos (no en el código) para poder agregar grupos nuevos
// sin tocar la lógica.

import { TURNS, isValidSlotKey, slotKey, turnOfTime } from '../../shared/availability.js';

export { TURNS, isValidSlotKey, slotKey, turnOfTime };

export const CONGREGATIONAL_TYPE = 'congregacional';

// Identificador estable del tipo. Se usa en el modelo y la generación,
// pero nunca se muestra: la interfaz trabaja con el nombre.
export function typeId(typeName) {
  return (typeName || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/^grupo\s*/, '')
    .replace(/\s+/g, '-');
}

// Un tipo pertenece a un grupo cuando su nombre lo declara: "Grupo 3", "Grupo 12".
// Cualquier otro nombre (Congregacional, Especial, Antigua...) no pertenece a ninguno,
// así que se pueden agregar nuevos grupos sin tocar el código.
export function isGroupType(typeName) {
  return /^grupo\s*\d+$/i.test((typeName || '').trim());
}

// Grupo al que pertenece un tipo, o '' si no es un tipo de grupo.
// "Grupo 3" -> "3", "Grupo 10" -> "10", "Congregacional" -> "".
export function groupOfType(typeName) {
  return isGroupType(typeName) ? typeId(typeName) : '';
}

export function isCongregational(typeName) {
  return (typeName || '').trim().toLocaleLowerCase() === CONGREGATIONAL_TYPE;
}

// "1" -> "grupo-1"; convierte una clave de grupo en id de tipo.
export function groupKey(group) {
  return `grupo-${(group || '').toString().trim().toLocaleLowerCase()}`;
}

export function groupLabel(group) {
  return `Grupo ${group}`;
}

// Normaliza cualquier forma de escribir un grupo: "Grupo 2", "grupo 2", " 2 " -> "2".
export function normalizeGroupValue(group) {
  return (group || '').toString().trim().toLocaleLowerCase().replace(/^grupo\s*/, '');
}

export const TURN_LABELS = { morning: 'mañana', afternoon: 'tarde' };

// ¿Está el conductor habilitado en ese turno concreto de ese día?
// Un turno desconocido (null) nunca es una coincidencia: una salida fuera de
// rango no se asigna a nadie por la disponibilidad de mañana o tarde.
export function isAvailableInSlot(slots, weekday, turn) {
  if (!turn) return false;
  if (Array.isArray(slots)) {
    // Formato anterior: lista de días sin turno, solo para precursores por la mañana.
    return weekday >= 2 && weekday <= 5 && slots.includes(weekday);
  }
  return Boolean(slots?.[slotKey(weekday, turn)]);
}
