// Recepción y consulta de los reportes que la app Android envía desde la
// pantalla "Reportar salida".
//
// POST /api/reports  -> registra un reporte (requiere sesión de Firebase)
// GET  /api/reports  -> lista los reportes guardados (requiere sesión)
//
// Validaciones:
//  - el cuerpo debe describir una salida existente del cronograma (salidaId);
//  - "realizada" (booleano), "observaciones" y "territorioTexto" son textos/
//    booleanos con tamaño acotado, para no guardar datos arbitrarios;
//  - si se indica una fecha real, debe coincidir con la de la salida;
//  - si se indica un turno, se valida con la misma regla que usa el resto del
//    backend (turnOfTime sobre la hora de la salida).
// Los datos del cronograma (tipo, fecha, hora, turno, territorio asignado y
// conductor) se copian del servidor: el cliente no puede reescribirlos.
import {
  findOutingById,
  getOutingReports,
  saveOutingReport,
} from '../models/scheduleModel.js';
import { normalizeGroupValue, turnOfTime } from '../services/domain.js';

const MAX_TEXT = 2000;
const MAX_TERRITORY_TEXT = 5000;
const MAX_SALIDA_ID = 200;
const MAX_ROWS = 500;

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDay;
}

// Convierte las filas marcadas del mapa ("13", "13A", "13a") en la lista de
// manzanas que envía Android. Ignora valores vacíos y repetidos sin cambiar
// el número ni repetir la misma manzana.
function normalizeManzanas(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_ROWS) return null;

  const clean = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const text = item.trim();
    if (!text || text.length > 50) return null;
    if (!clean.includes(text)) clean.push(text);
  }
  return clean;
}

function normalizeOptionalText(value, max, { trim = true } = {}) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max) return null;
  return trim ? value.trim() : value;
}

function invalid(response, message) {
  response.status(400).json({ error: message });
  return null;
}

export async function postReport(request, response) {
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid(response, 'El reporte debe ser un objeto');
    return;
  }

  const { salidaId } = body;
  if (typeof salidaId !== 'string' || !salidaId.trim() || salidaId.length > MAX_SALIDA_ID) {
    invalid(response, 'El identificador de la salida es obligatorio');
    return;
  }

  if (typeof body.realizada !== 'boolean') {
    invalid(response, 'Indicá si la salida se realizó o no');
    return;
  }

  const observaciones = normalizeOptionalText(body.observaciones, MAX_TEXT);
  if (observaciones === null) {
    invalid(response, 'Las observaciones no son válidas');
    return;
  }

  const territorioTexto = normalizeOptionalText(body.territorioTexto, MAX_TERRITORY_TEXT, { trim: false });
  if (territorioTexto === null) {
    invalid(response, 'El texto del territorio no es válido');
    return;
  }

  if (body.fechaReal !== undefined && !validDate(body.fechaReal)) {
    invalid(response, 'La fecha real de la actividad no es válida');
    return;
  }

  const manzanas = normalizeManzanas(body.manzanas);
  if (manzanas === null) {
    invalid(response, 'Las manzanas seleccionadas no son válidas');
    return;
  }

  const found = await findOutingById(salidaId.trim());
  if (!found) {
    // Una salida inexistente no se puede reportar: evita reportes inventados.
    response.status(404).json({ error: 'No se encontró la salida indicada' });
    return;
  }

  const { outing, year, month } = found;
  if (body.fechaReal !== undefined && body.fechaReal !== outing.date) {
    invalid(response, 'La fecha real no coincide con la salida del cronograma');
    return;
  }

  const turno = turnOfTime(outing.time);
  if (body.turno !== undefined) {
    const requested = normalizeGroupValue(body.turno);
    if (!turno || requested !== turno) {
      invalid(response, 'El turno no coincide con la salida del cronograma');
      return;
    }
  }

  const receivedAt = new Date().toISOString();
  const report = {
    salidaId: outing.id,
    salida: {
      date: outing.date,
      time: outing.time,
      turno,
      type: outing.type || '',
      typeId: normalizeGroupValue(outing.type || ''),
      territory: outing.territory || '',
      driverId: outing.driverId || null,
      driverName: outing.driver || '',
      month: `${year}-${String(month).padStart(2, '0')}`,
    },
    realizada: body.realizada,
    observaciones: observaciones ?? '',
    territorioTexto: territorioTexto ?? '',
    ...(manzanas !== undefined ? { manzanas } : {}),
    receivedAt,
    // El usuario sale del token verificado, nunca del cuerpo de la solicitud.
    receivedBy: {
      uid: request.user.uid,
      email: request.user.email || '',
    },
  };

  // Clave de idempotencia opcional: si el celular la repite, el servidor puede
  // reconocer el mismo envío aunque cambie algún dato del cuerpo.
  const idempotencyKey = request.get('idempotency-key')?.trim() || '';
  if (idempotencyKey.length > 200) {
    invalid(response, 'La clave de idempotencia no es válida');
    return;
  }

  const result = await saveOutingReport(report, { idempotencyKey });
  // 201 la primera vez y 200 en un reintento: en ambos casos el backend confirma
  // que el reporte está guardado (el reintento devuelve: { duplicate: true }).
  response.status(result.duplicate ? 200 : 201).json({
    report: result.report,
    duplicate: result.duplicate,
  });
}

export async function getReports(request, response) {
  const { salidaId } = request.query;
  if (salidaId !== undefined && (typeof salidaId !== 'string' || !salidaId.trim())) {
    invalid(response, 'El identificador de la salida no es válido');
    return;
  }

  const limit = request.query.limit === undefined ? 200 : Number(request.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    invalid(response, 'El límite debe ser un número entero entre 1 y 1000');
    return;
  }

  const reports = await getOutingReports({ salidaId: salidaId?.trim(), limit });
  response.json({ reports, count: reports.length });
}
