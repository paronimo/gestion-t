// Pruebas de extremo a extremo (HTTP) de la recepción de reportes desde Android.
//
// Se levanta la app Express real con un archivo de datos temporal y un
// verificador de sesión inyectado: así se comprueba la autenticación, la
// validación, la persistencia, la idempotencia y la consulta sin depender de
// Firebase real ni de tocar backend/data/months.json.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

// La ruta del archivo de datos se configura ANTES de cargar el modelo: el
// modelo la resuelve al importarse, y una importación estática se evaluaría
// primero y apuntaría al months.json real del gestor.
const testDirectory = await mkdtemp(join(tmpdir(), 'gestor-t-reports-'));
const testDataFile = join(testDirectory, 'months.json');
process.env.SCHEDULE_DATA_FILE = testDataFile;

const { createApp } = await import('./app.js');
const { getOutingReports } = await import('./models/scheduleModel.js');

// Salidas conocidas por el cronograma temporal.
const SALIDA_GRUPO = {
  id: 'salida-grupo-1',
  date: '2026-10-18',
  weekday: 'domingo',
  time: '09:00',
  type: 'Grupo 1',
  driver: '',
  driverId: 'driver-1',
  territory: '4, 5',
  source: 'recurring',
  configId: 'rule-1',
  placeId: null,
  placeType: 'location',
};
const SALIDA_TARDE = {
  id: 'salida-tarde',
  date: '2026-10-19',
  weekday: 'lunes',
  time: '17:30',
  type: 'Congregacional',
  driver: '',
  driverId: null,
  territory: '',
  source: 'recurring',
  configId: 'rule-2',
  placeId: null,
  placeType: 'location',
};

const usuarios = {
  'token-valido': { uid: 'uid-ana', email: 'ana@example.com', email_verified: true },
  'token-otro': { uid: 'uid-beto', email: 'beto@example.com', email_verified: true },
  'token-concurrente': { uid: 'uid-concurrente', email: 'concurrente@example.com', email_verified: true },
  'token-clave': { uid: 'uid-clave', email: 'clave@example.com', email_verified: true },
  'token-consulta': { uid: 'uid-consulta', email: 'consulta@example.com', email_verified: true },
};

async function verify(token) {
  const decoded = usuarios[token];
  if (!decoded) throw new Error('token inválido');
  return decoded;
}

let server;
let baseUrl;

before(async () => {
  await writeFile(testDataFile, JSON.stringify({
    types: [{ id: 'congregacional', name: 'Congregacional', active: true }],
    drivers: [],
    houses: [],
    locations: [],
    territoryLocations: [],
    territories: [],
    months: {
      '2026-10': {
        configuration: [],
        outings: [SALIDA_GRUPO, SALIDA_TARDE],
        driverAvailability: {},
        driverRotations: { elders: {}, groupConductors: {} },
        houseAvailability: {},
        houseRotations: {},
      },
    },
    // Los datos previos del gestor deben conservarse intactos.
    existing: { note: 'dato previo' },
  }));

  const app = createApp({ verify });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  // Evita que una conexión keep-alive de fetch retrase el cierre del servidor.
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await rm(testDirectory, { recursive: true, force: true });
});

// Petición HTTP real contra el servidor de pruebas. Se usa node:http con
// agent:false (sin keep-alive) en lugar de fetch: en Node 24 una conexión
// keep-alive de fetch deja el proceso de `node --test` esperando para siempre.
function request(method, path, { body, token = 'token-valido', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      agent: false,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode,
        body: text,
        json: async () => JSON.parse(text),
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function reportar(body, { token = 'token-valido', headers } = {}) {
  return request('POST', '/api/reports', { body, token, headers });
}

// Envía el cuerpo en dos partes: la primera se escribe al conectar y la segunda
// recién cuando otra petición ya está en curso. Así las dos llegan al servidor
// antes de que la primera termine de guardar.
function reportarEnDosPartes(body, { token = 'token-valido' } = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  const mitad = Math.floor(payload.length / 2);
  const url = new URL(`${baseUrl}/api/reports`);

  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Authorization: `Bearer ${token}`,
      },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, json: async () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.flushHeaders();
    req.write(payload.subarray(0, mitad));
    setTimeout(() => req.end(payload.subarray(mitad)), 50);
  });
}

function consultar(query = '', { token = 'token-valido' } = {}) {
  return request('GET', `/api/reports${query}`, { token });
}

const reporteValido = () => ({
  salidaId: SALIDA_GRUPO.id,
  realizada: true,
  observaciones: 'Buena participación',
  territorioTexto: 'T 4 : 7250, 7251 (Faltan: 7270)\nT 5',
  fechaReal: '2026-10-18',
  turno: 'morning',
  manzanas: ['7250', '7251'],
});

test('el backend recibe y guarda un reporte válido', async () => {
  const response = await reportar(reporteValido());
  assert.equal(response.status, 201);

  const body = await response.json();
  assert.equal(body.duplicate, false);
  assert.equal(body.report.salidaId, SALIDA_GRUPO.id);
  assert.equal(body.report.realizada, true);
  assert.equal(body.report.observaciones, 'Buena participación');
  assert.equal(body.report.salida.type, 'Grupo 1');
  assert.equal(body.report.salida.date, '2026-10-18');
  assert.equal(body.report.salida.turno, 'morning');
  assert.equal(body.report.receivedBy.uid, 'uid-ana');
  assert.ok(body.report.receivedAt);
  // La respuesta no expone datos sensibles de la cuenta.
  assert.equal(JSON.stringify(body).includes('ana@example.com'), false);
});

test('el reporte queda en el archivo de datos y se conservan los datos previos', async () => {
  const saved = JSON.parse(await readFile(testDataFile, 'utf8'));
  assert.equal(Array.isArray(saved.reports), true);
  assert.equal(saved.reports.length, 1);
  assert.equal(saved.reports[0].salidaId, SALIDA_GRUPO.id);
  assert.deepEqual(saved.existing, { note: 'dato previo' });
  assert.equal(saved.months['2026-10'].outings.length, 2);
});

test('la web puede consultar el reporte guardado con los datos del territorio', async () => {
  const response = await consultar();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.count, 1);
  const [report] = body.reports;
  assert.equal(report.salidaId, SALIDA_GRUPO.id);
  assert.equal(report.territorioTexto, 'T 4 : 7250, 7251 (Faltan: 7270)\nT 5');
  assert.deepEqual(report.manzanas, ['7250', '7251']);
  assert.equal(report.salida.territory, '4, 5');
  assert.equal(report.salida.time, '09:00');

  const filtered = await consultar(`?salidaId=${SALIDA_GRUPO.id}`);
  assert.equal((await filtered.json()).count, 1);

  const empty = await consultar('?salidaId=salida-inexistente');
  assert.equal((await empty.json()).count, 0);
});

test('un reintento del mismo envío no crea un reporte duplicado', async () => {
  const again = await reportar(reporteValido());
  assert.equal(again.status, 200);
  const body = await again.json();
  assert.equal(body.duplicate, true);

  const saved = JSON.parse(await readFile(testDataFile, 'utf8'));
  assert.equal(saved.reports.length, 1);
});

test('la misma clave de idempotencia tampoco duplica el reporte', async () => {
  const payload = {
    salidaId: SALIDA_TARDE.id,
    realizada: true,
    observaciones: 'Con clave de idempotencia',
    territorioTexto: '',
    fechaReal: SALIDA_TARDE.date,
    turno: 'afternoon',
  };
  const send = () => reportar(payload, {
    token: 'token-clave',
    headers: { 'Idempotency-Key': 'clave-envio-1' },
  });

  const first = await send();
  const second = await send();
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).duplicate, true);

  const saved = JSON.parse(await readFile(testDataFile, 'utf8'));
  assert.equal(saved.reports.filter((report) => report.salidaId === SALIDA_TARDE.id && report.receivedBy.uid === 'uid-clave').length, 1);
});

test('dos envíos simultáneos tampoco duplican el reporte', async () => {
  // Usuario propio para no chocar con los reportes de las pruebas anteriores.
  const payload = {
    salidaId: SALIDA_TARDE.id,
    realizada: false,
    observaciones: 'Llovió',
    territorioTexto: '',
  };
  const responses = await Promise.all([
    reportarEnDosPartes(payload, { token: 'token-concurrente' }),
    reportarEnDosPartes(payload, { token: 'token-concurrente' }),
  ]);
  const statuses = responses.map((response) => response.status).sort();
  assert.deepEqual(statuses, [200, 201]);
  const saved = JSON.parse(await readFile(testDataFile, 'utf8'));
  assert.equal(saved.reports.filter((report) => report.salidaId === SALIDA_TARDE.id && report.receivedBy.uid === 'uid-concurrente').length, 1);
  // La salida de la tarde es congregacional y su turno es la tarde.
  // La lista incluye los reportes de otros usuarios para la misma salida.
  const body = await (await consultar(`?salidaId=${SALIDA_TARDE.id}`, { token: 'token-concurrente' })).json();
  const propios = body.reports.filter((report) => report.receivedBy.uid === 'uid-concurrente');
  assert.equal(propios.length, 1);
  assert.equal(propios[0].salida.turno, 'afternoon');
});

test('la app consulta el cronograma real con su sesión y conserva los ids', async () => {
  const response = await request('GET', '/api/schedule/2026/10/outings', {});
  assert.equal(response.status, 200);

  const salidas = await response.json();
  assert.equal(salidas.length, 2);
  const grupo = salidas.find((salida) => salida.id === SALIDA_GRUPO.id);
  assert.ok(grupo, 'debe aparecer la salida real con su id');
  assert.equal(grupo.date, '2026-10-18');
  assert.equal(grupo.time, '09:00');
  assert.equal(grupo.type, 'Grupo 1');
  assert.equal(grupo.territory, '4, 5');
  // Mismo formato que la ruta que usa la web.
  for (const key of ['driverName', 'placeName', 'placeMapsUrl']) {
    assert.equal(key in grupo, true, `falta ${key}`);
  }

  // El id obtenido se puede reportar directamente.
  const reporte = await reportar({ salidaId: grupo.id, realizada: true, territorioTexto: 'T 4' }, { token: 'token-consulta' });
  assert.ok([200, 201].includes(reporte.status));
});

test('la consulta del cronograma exige una sesión válida', async () => {
  const sinToken = await request('GET', '/api/schedule/2026/10/outings', { token: null });
  assert.equal(sinToken.status, 401);

  const tokenFalso = await request('GET', '/api/schedule/2026/10/outings', { token: 'token-falso' });
  assert.equal(tokenFalso.status, 401);
});

test('un id que no existe en el cronograma sigue rechazándose', async () => {
  const response = await reportar({ salidaId: 'id-inventado-en-android', realizada: true });
  assert.equal(response.status, 404);
});

test('un usuario distinto sí puede reportar la misma salida', async () => {
  const response = await reportar({ ...reporteValido(), realizada: false }, { token: 'token-otro' });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.report.receivedBy.uid, 'uid-beto');

  const saved = JSON.parse(await readFile(testDataFile, 'utf8'));
  // Un reporte de Ana (token-valido) y otro de Beto (token-otro) para la misma salida.
  assert.equal(saved.reports.filter((report) => report.salidaId === SALIDA_GRUPO.id
    && ['uid-ana', 'uid-beto'].includes(report.receivedBy.uid)).length, 2);
});

test('los datos inválidos se rechazan con 400', async () => {
  const cases = [
    [{ ...reporteValido(), salidaId: '' }, 'sin salida'],
    [{ ...reporteValido(), realizada: 'sí' }, 'resultado no booleano'],
    [{ ...reporteValido(), observaciones: 42 }, 'observaciones con tipo incorrecto'],
    [{ ...reporteValido(), fechaReal: '2026-13-40' }, 'fecha inválida'],
    [{ ...reporteValido(), fechaReal: '2026-10-19' }, 'fecha que no es la de la salida'],
    [{ ...reporteValido(), turno: 'afternoon' }, 'turno que no es el de la salida'],
    [{ ...reporteValido(), manzanas: [1, 2] }, 'manzanas con tipo incorrecto'],
    [{ ...reporteValido(), manzanas: ['7250'], observaciones: 'x'.repeat(3000) }, 'observaciones demasiado largas'],
  ];

  for (const [body, label] of cases) {
    const response = await reportar(body);
    assert.equal(response.status, 400, label);
    const result = await response.json();
    assert.equal(typeof result.error, 'string', label);
  }

  const missing = await reportar({ salidaId: 'no-existe', realizada: true });
  assert.equal(missing.status, 404);
});

test('sin token o con un token inválido se responde 401 y no se guarda nada', async () => {
  const before = JSON.parse(await readFile(testDataFile, 'utf8')).reports.length;

  // Si por error alguno de estos envíos se aceptara, se crearía un reporte
  // nuevo y el conteo final lo detectaría.
  const cuerpo = { ...reporteValido(), salidaId: SALIDA_TARDE.id, fechaReal: undefined, turno: undefined };
  const sinToken = await request('POST', '/api/reports', { body: cuerpo, token: null });
  assert.equal(sinToken.status, 401);

  const tokenFalso = await reportar(cuerpo, { token: 'token-falso' });
  assert.equal(tokenFalso.status, 401);

  const consultaSinToken = await consultar('', { token: null });
  assert.equal(consultaSinToken.status, 401);

  const afterCount = JSON.parse(await readFile(testDataFile, 'utf8')).reports.length;
  assert.equal(afterCount, before);
});

test('un fallo del servidor no se presenta como envío exitoso', async () => {
  // Se corrompe el archivo de datos. Antes se espera a que terminen las
  // escrituras pendientes de las pruebas anteriores (si no, una de ellas
  // podría restaurar el archivo en medio de esta prueba).
  await getOutingReports({});
  const original = await readFile(testDataFile, 'utf8');
  await writeFile(testDataFile, '{ no es JSON');

  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await reportar({ ...reporteValido(), salidaId: SALIDA_TARDE.id });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(typeof body.error, 'string');
  } finally {
    console.error = originalError;
    await writeFile(testDataFile, original);
  }
});
