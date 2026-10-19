#!/usr/bin/env node
// ============================================================================
// dryRunValidation.js — Validación de SOLO LECTURA de backend/data/months.json
// ----------------------------------------------------------------------------
// Objetivo: comprobar la integridad de los datos antes de una eventual
// migración a Firestore. Este script:
//   * NO se conecta a Firebase ni a ninguna red;
//   * NO escribe ni modifica months.json ni ningún otro archivo;
//   * NO instala ni importa dependencias externas (solo módulos nativos de Node).
//
// Uso:
//   node backend/scripts/dryRunValidation.js [ruta/a/months.json]
//
// Salida: informe legible por consola + código de salida 0 (sin hallazgos) o
//         1 (con hallazgos). Las inconsistencias se informan, nunca se corrigen.
// ============================================================================
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const defaultDataFile = resolve(here, '..', 'data', 'months.json');
const dataFile = process.argv[2] ? resolve(process.argv[2]) : defaultDataFile;

// ---------------------------------------------------------------- conteos esperados
// Referencia registrada antes de la migración (Fase 0).
const EXPECTED = {
  months: 3,
  outings: 144,
  drivers: 29,
  houses: 32,
  territories: 30,
  types: 5,
};

// Días y turnos según shared/availability.js: mañana 06:00-12:00, tarde 13:00-21:00.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const TURNS = ['morning', 'afternoon'];
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ---------------------------------------------------------------- utilidades
const findings = [];
const notes = [];

function finding(category, message, detail) {
  findings.push({ category, message, detail });
}
function note(message) {
  notes.push(message);
}
function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function toMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
function turnOfTime(time) {
  const minutes = toMinutes(time);
  if (minutes === null) return null;
  if (minutes >= 6 * 60 && minutes <= 12 * 60) return 'morning';
  if (minutes >= 13 * 60 && minutes <= 21 * 60) return 'afternoon';
  return null;
}
function weekdayOf(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDay();
}
// Formato de slotKey: "<weekday>:<turn>" p. ej. "2:morning".
function isValidSlotKey(key) {
  const [weekday, turn] = String(key).split(':');
  return TURNS.includes(turn) && WEEKDAYS.includes(Number(weekday)) && String(Number(weekday)) === weekday;
}
// Clave de documento admisible en Firestore: no puede contener "/" ni ser "." o "..".
function isFirestoreSafeId(id) {
  if (typeof id !== 'string' || id.length === 0) return false;
  if (id.includes('/')) return false;
  if (id === '.' || id === '..') return false;
  if (id !== id.trim()) return false;
  return true;
}
function duplicates(ids) {
  const seen = new Set();
  const dup = new Set();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    else seen.add(id);
  }
  return [...dup];
}

// ---------------------------------------------------------------- carga
const raw = await readFile(dataFile);
const originalHash = sha256(raw);
const data = JSON.parse(raw.toString('utf8'));

// ---------------------------------------------------------------- entidades raíz
const types = Array.isArray(data.types) ? data.types : [];
const drivers = Array.isArray(data.drivers) ? data.drivers : [];
const houses = Array.isArray(data.houses) ? data.houses : [];
const locations = Array.isArray(data.locations) ? data.locations : [];
const territoryLocations = Array.isArray(data.territoryLocations) ? data.territoryLocations : [];
const territories = Array.isArray(data.territories) ? data.territories : [];
const months = isPlainObject(data.months) ? data.months : {};

const monthKeys = Object.keys(months);

// ---------------------------------------------------------------- 1. conteos vs esperado
const actual = {
  months: monthKeys.length,
  outings: monthKeys.reduce((t, k) => t + ((months[k].outings || []).length), 0),
  drivers: drivers.length,
  houses: houses.length,
  territories: territories.length,
  types: types.length,
};
for (const [key, expected] of Object.entries(EXPECTED)) {
  if (actual[key] !== expected) {
    finding('conteos', `${key}: se esperaban ${expected} y hay ${actual[key]}`, null);
  }
}

// ---------------------------------------------------------------- 2. IDs únicos y seguros
const driverIds = drivers.map((d) => d?.id);
const houseIds = houses.map((h) => h?.id);
const territoryIds = territories.map((t) => t?.id);
const typeIds = types.map((t) => t?.id);
const typeNames = types.map((t) => String(t?.name ?? '').trim());
const territoryNames = territories.map((t) => String(t?.name ?? '').trim());

const idGroups = [
  ['drivers', driverIds],
  ['houses', houseIds],
  ['territories', territoryIds],
  ['types', typeIds],
];
for (const [name, ids] of idGroups) {
  const invalid = ids.filter((id) => !isFirestoreSafeId(id));
  if (invalid.length) {
    finding('ids', `${name}: ${invalid.length} id(s) vacíos o no válidos como clave de Firestore`, invalid.slice(0, 10));
  }
  const dup = duplicates(ids);
  if (dup.length) {
    finding('ids', `${name}: ids duplicados`, dup.slice(0, 10));
  }
}

// Espacio de placeId: casas + ubicaciones + ubicaciones de territorio.
// Una salida a "casa" apunta a houses; una salida de territorio puede apuntar
// a territoryLocations (punto de encuentro) o a locations.
const placeById = new Map();
for (const h of houses) placeById.set(h?.id, 'house');
for (const l of locations) placeById.set(l?.id, 'location');
for (const t of territoryLocations) placeById.set(t?.id, 'territoryLocation');
const placeDupAcross = [];
for (const [name, list] of [['houses', houses], ['locations', locations], ['territoryLocations', territoryLocations]]) {
  for (const item of list) {
    const id = item?.id;
    if (!id) continue;
    const owners = [['houses', houses], ['locations', locations], ['territoryLocations', territoryLocations]]
      .filter(([, l]) => l.some((x) => x?.id === id))
      .map(([n]) => n);
    if (owners.length > 1) placeDupAcross.push(`${id} (${owners.join(' + ')})`);
  }
}
if (placeDupAcross.length) {
  finding('ids', 'ids compartidos entre colecciones de lugares (placeId ambiguo)', placeDupAcross.slice(0, 10));
}

// ---------------------------------------------------------------- 3. meses: claves, outings y reglas
const allOutingIds = [];
const perMonthOutings = {};

// Reglas recurrentes (configuration). Cada regla usa "weekday" (número) y "time".
const rules = [];
const ruleIndex = new Map(); // id de regla -> regla
const ruleTypeKeys = new Map(); // clave mes|tipo|día|hora -> id de regla

for (const mk of monthKeys) {
  const month = months[mk];
  if (!/^\d{4}-\d{2}$/.test(mk)) {
    finding('meses', `clave de mes con formato inesperado: "${mk}"`, null);
  }
  const [yearStr, monthStr] = mk.split('-');
  const monthNum = Number(monthStr);
  if (monthNum < 1 || monthNum > 12) {
    finding('meses', `mes fuera de rango en "${mk}"`, null);
  }
  const outings = Array.isArray(month.outings) ? month.outings : [];
  perMonthOutings[mk] = outings.length;

  const configuration = Array.isArray(month.configuration) ? month.configuration : [];

  for (const rule of configuration) {
    const id = rule?.id;
    if (id !== undefined) {
      if (ruleIndex.has(id)) {
        finding('reglas', `id de regla duplicado: "${id}" (${mk})`, null);
      } else {
        ruleIndex.set(id, { ...rule, _month: mk });
      }
    }
    const typeName = String(rule?.type ?? '').trim();
    const weekday = Number(rule?.weekday);
    const time = rule?.time;
    const turn = turnOfTime(time);
    if (!WEEKDAYS.includes(weekday)) {
      finding('reglas', `día inválido (${rule?.weekday}) en regla "${id ?? '(sin id)'}" de ${mk}`, null);
    }
    if (turn === null) {
      finding('reglas', `hora "${time}" fuera de rango (sin turno) en regla "${id ?? '(sin id)'}" de ${mk}`, null);
    } else if (WEEKDAYS.includes(weekday)) {
      const key = `${mk}|${typeName}|${weekday}|${String(time).trim()}`;
      if (ruleTypeKeys.has(key)) {
        finding('reglas', `regla duplicada exacta (mismo tipo, día y hora) en ${mk}: ${typeName} wd=${weekday} ${time}`, [ruleTypeKeys.get(key), id ?? '(sin id)']);
      } else {
        ruleTypeKeys.set(key, id ?? '(sin id)');
      }
    }
    rules.push({ id, type: typeName, weekday, time, turn, active: rule?.active, _month: mk });
  }

  for (const outing of outings) {
    const id = outing?.id;
    allOutingIds.push(id);

    // Fecha válida, dentro del mes de su clave, y día de la semana coherente.
    const wd = weekdayOf(outing?.date);
    if (wd === null) {
      finding('salidas', `fecha inválida ("${outing?.date}") en salida "${id}" de ${mk}`, null);
    } else {
      const prefix = `${yearStr}-${monthStr}`;
      if (!String(outing.date).startsWith(prefix)) {
        finding('salidas', `fecha "${outing.date}" no pertenece al mes "${mk}" (salida "${id}")`, null);
      }
      const declared = String(outing?.weekday ?? '').trim().toLowerCase();
      if (declared && WEEKDAY_NAMES[wd] !== declared) {
        finding('salidas', `salida "${id}": weekday declarado "${outing.weekday}" no coincide con la fecha ${outing.date} (${WEEKDAY_NAMES[wd]})`, null);
      }
    }

    // Tipo declarado y pertenencia al catálogo.
    const typeName = String(outing?.type ?? '').trim();
    if (!typeName) {
      finding('salidas', `salida "${id}" de ${mk} sin tipo`, null);
    } else if (!typeNames.includes(typeName)) {
      finding('salidas-tipos', `salida "${id}" usa un tipo que no está en el catálogo: "${typeName}"`, null);
    }

    // Turno coherente con la hora (salvo que esté marcado turnOutOfRange).
    const turn = turnOfTime(outing?.time);
    if (turn === null && outing?.turnOutOfRange !== true) {
      finding('salidas', `salida "${id}" de ${mk} con hora "${outing?.time}" fuera de rango y sin turnOutOfRange`, null);
    }
    if (turn !== null && outing?.turn && outing.turn !== turn) {
      finding('salidas', `salida "${id}": turn declarado "${outing.turn}" no coincide con la hora "${outing.time}" (${turn})`, null);
    }
    // turnOutOfRange debe ser exactamente lo contrario de tener turno resuelto.
    if (typeof outing?.turnOutOfRange === 'boolean' && outing.turnOutOfRange !== (turn === null)) {
      finding('salidas', `salida "${id}": turnOutOfRange=${outing.turnOutOfRange} incoherente con la hora "${outing.time}"`, null);
    }

    // Vínculo con su regla recurrente: configId debe existir y coincidir en tipo/día/turno.
    const configId = outing?.configId;
    if (configId !== null && configId !== undefined && configId !== '') {
      const rule = ruleIndex.get(configId);
      if (!rule) {
        finding('salidas-reglas', `salida "${id}" (${mk}) apunta a configId inexistente "${configId}"`, null);
      } else {
        if (rule._month !== mk) {
          finding('salidas-reglas', `salida "${id}" (${mk}) apunta a una regla del mes ${rule._month}`, configId);
        }
        if (rule.type !== typeName) {
          finding('salidas-reglas', `salida "${id}": tipo "${typeName}" != tipo de su regla "${rule.type}"`, configId);
        }
        const wdRule = Number(rule.weekday);
        if (wd !== null && wdRule !== wd) {
          finding('salidas-reglas', `salida "${id}": día de fecha (${wd}) != weekday de su regla (${wdRule})`, configId);
        }
        const ruleTurn = turnOfTime(rule.time);
        if (turn !== null && ruleTurn !== null && ruleTurn !== turn) {
          finding('salidas-reglas', `salida "${id}": turno (${turn}) != turno de su regla (${ruleTurn})`, configId);
        }
        if (String(rule.time).trim() !== String(outing.time).trim()) {
          finding('salidas-reglas', `salida "${id}": hora "${outing.time}" != hora de su regla "${rule.time}"`, configId);
        }
      }
    } else if (String(outing?.source ?? '') === 'recurring') {
      finding('salidas-reglas', `salida "${id}" (${mk}) marcada como recurring pero sin configId`, null);
    }

    // Lugar: placeType coherente con placeId existente.
    const placeType = outing?.placeType;
    const placeId = outing?.placeId;
    if (!['house', 'location'].includes(placeType)) {
      finding('salidas', `salida "${id}" de ${mk} con placeType desconocido: "${placeType}"`, null);
    }
    if (placeId !== null && placeId !== undefined && placeId !== '' && !placeById.has(placeId)) {
      finding('salidas', `salida "${id}" de ${mk} referencia placeId inexistente: "${placeId}"`, null);
    }
    // NOTA: el gestor resuelve el lugar con allPlaces() = houses + locations +
    // territoryLocations, sin exigir que placeType coincida con la colección.
    // Por eso NO se valida la coherencia placeType<->colección (sería un falso
    // positivo: hay salidas con placeType "house" y placeId de territoryLocations,
    // marcadas con placeManualOverride). Solo se exige que el placeId exista.
    if (placeType === 'house' && (placeId === null || placeId === undefined || placeId === '')) {
      finding('salidas', `salida "${id}" de ${mk} marcada como house pero sin placeId`, null);
    }

    // Conductor asignado: debe existir si está presente.
    const driverId = outing?.driverId;
    if (driverId && !driverIds.includes(driverId)) {
      finding('salidas', `salida "${id}" de ${mk}: driverId inexistente ("${driverId}")`, null);
    }

    // Territorio declarado: el gestor guarda aquí el NÚMERO del territorio, que
    // se corresponde con territories[].name (no con el id). Si no coincide con
    // ningún name, es una referencia huérfana real.
    const territory = String(outing?.territory ?? '').trim();
    if (territory && !territoryNames.includes(territory)) {
      finding('salidas-territorios', `salida "${id}" de ${mk}: territorio "${territory}" no existe en el catálogo de territorios`, {
        date: outing.date, time: outing.time, territory,
      });
    }
  }
}

// ---------------------------------------------------------------- 4. outings: ids únicos
const dupOutingIds = duplicates(allOutingIds);
if (dupOutingIds.length) {
  finding('ids', 'salidas: ids duplicados', dupOutingIds.slice(0, 20));
}
const badOutingIds = allOutingIds.filter((id) => !isFirestoreSafeId(id));
if (badOutingIds.length) {
  finding('ids', `salidas: ${badOutingIds.length} id(s) no válidos como clave de Firestore`, badOutingIds.slice(0, 10));
}

// ---------------------------------------------------------------- 5. disponibilidad
// driverAvailability[id] = { slots: { "d:turn": bool } }
// houseAvailability[id]  = bool
// locationAvailability[id] = bool
const slotKeyStats = { driver: 0 };
const invalidSlotKeys = [];
for (const mk of monthKeys) {
  const month = months[mk];

  const driverAvail = month.driverAvailability;
  if (driverAvail !== undefined) {
    if (!isPlainObject(driverAvail)) {
      finding('disponibilidad', `driverAvailability de ${mk} no es un objeto`, null);
    } else {
      for (const [entityId, availability] of Object.entries(driverAvail)) {
        if (entityId && !driverIds.includes(entityId)) {
          finding('disponibilidad', `driverAvailability de ${mk}: conductor inexistente "${entityId}"`, null);
        }
        const slots = isPlainObject(availability) && isPlainObject(availability.slots) ? availability.slots : null;
        if (slots === null) {
          finding('disponibilidad', `driverAvailability["${entityId}"] de ${mk} sin objeto "slots"`, null);
          continue;
        }
        slotKeyStats.driver += Object.keys(slots).length;
        for (const [key, value] of Object.entries(slots)) {
          if (!isValidSlotKey(key)) invalidSlotKeys.push(`${mk}/driverAvailability/${entityId}/${key}`);
          if (typeof value !== 'boolean') {
            finding('disponibilidad', `driverAvailability["${entityId}"].slots["${key}"] de ${mk} no es booleano (${typeof value})`, null);
          }
        }
      }
    }
  }

  for (const field of ['houseAvailability', 'locationAvailability']) {
    const map = month[field];
    if (map === undefined) continue;
    if (!isPlainObject(map)) {
      finding('disponibilidad', `${field} de ${mk} no es un objeto`, null);
      continue;
    }
    const isHouses = field === 'houseAvailability';
    for (const [entityId, value] of Object.entries(map)) {
      if (typeof value !== 'boolean') {
        finding('disponibilidad', `${field}["${entityId}"] de ${mk} no es booleano (${typeof value})`, null);
      }
      if (isHouses && entityId && !houseIds.includes(entityId)) {
        finding('disponibilidad', `houseAvailability de ${mk}: casa inexistente "${entityId}"`, null);
      }
    }
  }

  const confirmations = month.houseAvailabilityConfirmations;
  if (isPlainObject(confirmations)) {
    for (const [entityId, value] of Object.entries(confirmations)) {
      if (entityId && !houseIds.includes(entityId)) {
        finding('confirmaciones', `houseAvailabilityConfirmations de ${mk}: casa inexistente "${entityId}"`, null);
      }
      if (typeof value !== 'string') {
        finding('confirmaciones', `houseAvailabilityConfirmations["${entityId}"] de ${mk} no es fecha ISO (${typeof value})`, null);
      }
    }
  }
}
if (invalidSlotKeys.length) {
  finding('disponibilidad', `${invalidSlotKeys.length} clave(s) de slot inválidas (esperado "d:turno")`, invalidSlotKeys.slice(0, 15));
}

// ---------------------------------------------------------------- 6. rotaciones
// driverRotations[group][weekday] = [driverId, ...]
// houseRotations[weekday] = [houseId, ...]
for (const mk of monthKeys) {
  const month = months[mk];

  const driverRotations = month.driverRotations;
  if (isPlainObject(driverRotations)) {
    for (const [groupKey, map] of Object.entries(driverRotations)) {
      if (!isPlainObject(map)) {
        finding('rotaciones', `driverRotations.${groupKey} de ${mk} no es un objeto`, null);
        continue;
      }
      for (const [weekday, ids] of Object.entries(map)) {
        if (!WEEKDAYS.includes(Number(weekday))) {
          finding('rotaciones', `día inválido "${weekday}" en driverRotations.${groupKey} de ${mk}`, null);
        }
        if (!Array.isArray(ids)) {
          finding('rotaciones', `driverRotations.${groupKey}.${weekday} de ${mk} no es un array`, null);
          continue;
        }
        for (const driverId of ids) {
          if (driverId && !driverIds.includes(driverId)) {
            finding('rotaciones', `driverRotations.${groupKey}.${weekday} de ${mk} apunta a conductor inexistente ("${driverId}")`, null);
          }
        }
      }
    }
  }

  const houseRotations = month.houseRotations;
  if (isPlainObject(houseRotations)) {
    for (const [weekday, ids] of Object.entries(houseRotations)) {
      if (!WEEKDAYS.includes(Number(weekday))) {
        finding('rotaciones', `día inválido "${weekday}" en houseRotations de ${mk}`, null);
      }
      if (!Array.isArray(ids)) {
        finding('rotaciones', `houseRotations.${weekday} de ${mk} no es un array`, null);
        continue;
      }
      for (const houseId of ids) {
        if (houseId && !houseIds.includes(houseId)) {
          finding('rotaciones', `houseRotations.${weekday} de ${mk} apunta a casa inexistente ("${houseId}")`, null);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 7. territorio -> ubicaciones
for (const territoryLocation of territoryLocations) {
  if (!isFirestoreSafeId(territoryLocation?.id)) {
    finding('territorioUbicaciones', `territoryLocations con id no válido: ${JSON.stringify(territoryLocation?.id)}`, null);
  }
  const assigned = String(territoryLocation?.territories ?? '').trim();
  if (assigned) {
    const nums = assigned.split(',').map((s) => s.trim()).filter(Boolean);
    const names = new Set(territories.map((t) => String(t?.name ?? '').trim()));
    for (const n of nums) {
      if (!names.has(n)) {
        note(`territoryLocations "${territoryLocation.name}": territorio "${n}" no figura como name en territories`);
      }
    }
  }
}

// ---------------------------------------------------------------- informe
const line = '='.repeat(78);
console.log(line);
console.log('DRY RUN — Validación de integridad de months.json (SOLO LECTURA)');
console.log(line);
console.log(`Archivo        : ${dataFile}`);
console.log(`SHA-256        : ${originalHash}`);
console.log('Conecta a red  : NO');
console.log('Escribe datos  : NO');
console.log('Dependencias   : ninguna (solo módulos nativos de Node)');
console.log(line);
console.log('CONTEO ACTUAL vs ESPERADO');
console.log('-'.repeat(78));
for (const key of Object.keys(EXPECTED)) {
  const ok = actual[key] === EXPECTED[key];
  console.log(`  ${ok ? 'OK ' : 'DIF'}  ${key.padEnd(12)} actual=${String(actual[key]).padStart(5)}  esperado=${String(EXPECTED[key]).padStart(5)}`);
}
console.log('-'.repeat(78));
console.log(`  Salidas por mes: ${monthKeys.map((k) => `${k}=${perMonthOutings[k]}`).join('  ')}`);
console.log(`  Reglas recurrentes: ${rules.length}  (indexadas por tipo+día+turno: ${ruleTypeKeys.size})`);
console.log(`  Claves de slot de conductores: ${slotKeyStats.driver}`);
console.log(`  territoryLocations: ${territoryLocations.length}  locations: ${locations.length}`);
console.log(line);
console.log(`HALLAZGOS: ${findings.length}`);
console.log(line);
if (findings.length === 0) {
  console.log('  Ninguno. No se detectaron inconsistencias.');
} else {
  const byCat = {};
  for (const f of findings) byCat[f.category] = (byCat[f.category] || 0) + 1;
  console.log('  Por categoría:');
  for (const [cat, n] of Object.entries(byCat)) console.log(`    - ${cat}: ${n}`);
  console.log('');
  findings.forEach((f, i) => {
    console.log(`  [${i + 1}] (${f.category}) ${f.message}`);
    if (f.detail !== null && f.detail !== undefined) {
      console.log(`      detalle: ${JSON.stringify(f.detail)}`);
    }
  });
}
if (notes.length) {
  console.log(line);
  console.log(`NOTAS (informativo, no son errores): ${notes.length}`);
  console.log(line);
  for (const n of notes.slice(0, 25)) console.log(`  - ${n}`);
  if (notes.length > 25) console.log(`  ... y ${notes.length - 25} más`);
}
console.log(line);
console.log(findings.length === 0 ? 'RESULTADO: OK — sin hallazgos.' : 'RESULTADO: se encontraron hallazgos (ver arriba). No se corrigió nada.');
console.log(line);

process.exit(findings.length === 0 ? 0 : 1);
