// Verificación REAL del gestor contra el backend en marcha.
//
// A diferencia de `npm test` (que usa un archivo JSON temporal), este script
// habla con el backend real por HTTP y, por lo tanto, ejercita Firestore.
// NO escribe nada por su cuenta: usa la API pública, igual que la web.
//
// REQUISITOS
//   1. El backend debe estar en marcha:  cd backend && npm run dev
//   2. Credenciales de Firebase:
//        GESTOR_EMAIL     correo de una cuenta ADMIN
//        GESTOR_PASSWORD  su contraseña
//      (se piden por variable de entorno; nunca se guardan en el repo)
//   3. Cuota de Firestore disponible. Con la cuota agotada, TODAS las pruebas
//      de datos fallarán con error 500 y el script lo dirá, sin fingir éxito.
//
// USO
//   GESTOR_EMAIL=... GESTOR_PASSWORD=... node scripts/verificar-gestor.js
//   GESTOR_BASE=http://localhost:3000 node scripts/verificar-gestor.js
//
// OPCIONES
//   --meses 2026-10,2026-11   meses a usar en las pruebas destructivas
//   --con-escritura           habilita crear/editar/borrar de verdad
//
// Por DEFECTO no toca datos: comprueba sesión, autorización, lecturas y PDF.
// Las pruebas que CREAN, EDITAN o BORRAN salidas/catálogos y las que REGENERAN
// un mes solo corren con --con-escritura, y usan un mes de prueba que se limpia
// al final. Nunca se toca months.json ni se migra nada.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.GESTOR_BASE || 'http://localhost:3000';
const EMAIL = process.env.GESTOR_EMAIL || '';
const PASSWORD = process.env.GESTOR_PASSWORD || '';
const API_KEY = 'AIzaSyCEzYZ7Rey7-g-Gpv92nP-VyGsuC2z98sI'; // apiKey web (pública por diseño)
const CON_ESCRITURA = process.argv.includes('--con-escritura');
const mesesArg = process.argv.find((a) => a.startsWith('--meses='));
const MES_PRUEBA = (mesesArg && mesesArg.split('=')[1]?.split(',')[0]) || '2026-12';

const resultados = [];
function ok(condicion, etiqueta, detalle = '') {
  resultados.push({ ok: Boolean(condicion), etiqueta, detalle });
  console.log(`  ${condicion ? '✅' : '❌'} ${etiqueta}${detalle ? `  →  ${detalle}` : ''}`);
}

// ---------------------------------------------------------------- utilidades HTTP

async function pedir(path, { token, method = 'GET', body, raw = false } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const tipo = response.headers.get('content-type') || '';
  const contenido = raw
    ? Buffer.from(await response.arrayBuffer())
    : (tipo.includes('json') ? await response.json().catch(() => null) : await response.text());
  return { status: response.status, tipo, contenido };
}

async function iniciarSesion() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return { idToken: data.idToken, uid: data.localId, email: data.email };
}

// ---------------------------------------------------------------- pruebas

async function probarAutorizacion() {
  console.log('\n--- 1. AUTORIZACIÓN (no consume Firestore) ---');
  const sinToken = await pedir('/api/drivers');
  ok(sinToken.status === 401, 'sin token → 401', `HTTP ${sinToken.status}`);

  const invalido = await pedir('/api/drivers', { token: 'token-falso' });
  ok(invalido.status === 401, 'token inválido → 401', `HTTP ${invalido.status}`);

  const malFormado = await pedir('/api/drivers', { token: '' });
  ok(malFormado.status === 401, 'encabezado sin Bearer → 401', `HTTP ${malFormado.status}`);
}

async function probarSesion(sesion) {
  console.log('\n--- 2. INICIO DE SESIÓN DEL ADMINISTRADOR ---');
  ok(Boolean(sesion.idToken), 'se obtuvo un idToken de Firebase Auth');
  ok(/\S+/.test(sesion.uid || ''), 'el token trae uid', sesion.uid || '(vacío)');

  const catalogo = await pedir('/api/drivers', { token: sesion.idToken });
  if (catalogo.status === 500) {
    ok(false, 'el backend pudo leer Firestore', `HTTP 500 → cuota o credenciales: ${JSON.stringify(catalogo.contenido)}`);
    return false;
  }
  ok(Array.isArray(catalogo.contenido), 'el backend respondió el catálogo de conductores', `HTTP ${catalogo.status}`);
  return catalogo.status === 200;
}

// La verificación de "usuario autenticado sin rol admin" necesita una SEGUNDA
// cuenta real, sin rol admin. Se documenta y se omite si no está disponible.
async function probarNoAdmin() {
  console.log('\n--- 3. USUARIO AUTENTICADO SIN ROL "admin" ---');
  if (!process.env.GESTOR_EMAIL_NOADMIN || !process.env.GESTOR_PASSWORD_NOADMIN) {
    ok(false, 'rechazo de usuario no-admin (requiere GESTOR_EMAIL_NOADMIN/GESTOR_PASSWORD_NOADMIN, se omite)');
    return;
  }
  try {
    const sesion = await iniciarSesion();
    const response = await pedir('/api/drivers', { token: sesion.idToken });
    ok(response.status === 403, 'usuario autenticado sin rol admin → 403', `HTTP ${response.status}`);
  } catch (error) {
    ok(false, 'no se pudo iniciar sesión como no-admin', error.message);
  }
}

async function probarLecturas(sesion) {
  console.log('\n--- 4. LECTURAS DEL MES (Firestore) ---');
  const [year, month] = MES_PRUEBA.split('-').map(Number);
  const base = `/api/months/${year}/${month}`;

  for (const [etiqueta, path] of [
    ['configuración', `${base}/configuration`],
    ['salidas', `${base}/outings`],
    ['conductores del mes', `${base}/drivers`],
    ['casas del mes', `${base}/houses`],
    ['rotación de conductores', `${base}/driver-rotations`],
    ['rotación de casas', `${base}/house-rotations`],
    ['resumen', `${base}/summary`],
  ]) {
    const response = await pedir(path, { token: sesion.idToken });
    if (response.status === 500) {
      ok(false, `leer ${etiqueta}`, `HTTP 500 (cuota o credenciales)`);
      return false;
    }
    ok(response.status === 200, `leer ${etiqueta}`, `HTTP ${response.status}`);
  }

  const pdf = await pedir(`${base}/schedule.pdf`, { token: sesion.idToken, raw: true });
  const esPdf = pdf.tipo.includes('pdf') || (pdf.contenido?.[0] === 0x25 && pdf.contenido?.[1] === 0x50);
  ok(pdf.status === 200 && esPdf, 'exportación PDF del mes', `HTTP ${pdf.status}, ${pdf.tipo}`);
  return true;
}

async function probarEscritura(sesion, uid) {
  console.log(`\n--- 5. ESCRITURA REAL EN ${MES_PRUEBA} (--con-escritura) ---`);
  const [year, month] = MES_PRUEBA.split('-').map(Number);
  const base = `/api/months/${year}/${month}`;

  // 5.1 Crear salida manual.
  const creada = await pedir(`${base}/outings`, {
    token: sesion.idToken,
    method: 'POST',
    body: {
      date: `${MES_PRUEBA}-15`, time: '10:00', type: 'Prueba', driver: '', driverId: null,
      placeId: null, placeType: 'location', territory: '',
    },
  });
  ok(creada.status === 201 && creada.contenido?.id, 'crear salida', `HTTP ${creada.status}`);
  const id = creada.contenido?.id;

  // 5.2 Consultarla.
  const listado = await pedir(`${base}/outings`, { token: sesion.idToken });
  ok(Array.isArray(listado.contenido) && listado.contenido.some((o) => o.id === id),
    'consultar la salida creada', `HTTP ${listado.status}`);

  // 5.3 Editarla.
  const editada = await pedir(`${base}/outings/${id}`, {
    token: sesion.idToken,
    method: 'PUT',
    body: {
      date: `${MES_PRUEBA}-15`, time: '11:30', type: 'Prueba', driver: '', driverId: null,
      placeId: null, placeType: 'location', territory: 'REVISITAS',
    },
  });
  ok(editada.status === 200 && editada.contenido?.time === '11:30', 'editar salida', `HTTP ${editada.status}`);

  // 5.4 Regenerar y comprobar que la manual sobrevive con su MISMO id.
  const config = await pedir(`${base}/configuration`, { token: sesion.idToken });
  const guardada = await pedir(`${base}/configuration`, {
    token: sesion.idToken,
    method: 'PUT',
    body: { configuration: Array.isArray(config.contenido) ? config.contenido : [] },
  });
  const trasRegenerar = await pedir(`${base}/outings`, { token: sesion.idToken });
  ok(guardada.status === 200, 'regenerar el mes', `HTTP ${guardada.status}`);
  ok(Array.isArray(trasRegenerar.contenido) && trasRegenerar.contenido.some((o) => o.id === id),
    'la salida manual conserva su id al regenerar');

  // 5.5 Borrarla.
  const borrada = await pedir(`${base}/outings/${id}`, { token: sesion.idToken, method: 'DELETE' });
  ok(borrada.status === 204, 'borrar salida', `HTTP ${borrada.status}`);

  // 5.6 Catálogos: crear, editar y borrar un territorio de prueba.
  const territorio = await pedir('/api/territories', {
    token: sesion.idToken, method: 'POST', body: { name: 'ZZ PRUEBA' },
  });
  ok(territorio.status === 201 && territorio.contenido?.id, 'crear territorio', `HTTP ${territorio.status}`);
  if (territorio.contenido?.id) {
    const editado = await pedir(`/api/territories/${territorio.contenido.id}`, {
      token: sesion.idToken, method: 'PUT', body: { name: 'ZZ PRUEBA 2', active: true },
    });
    ok(editado.status === 200, 'editar territorio', `HTTP ${editado.status}`);
    const eliminado = await pedir(`/api/territories/${territorio.contenido.id}`, {
      token: sesion.idToken, method: 'DELETE',
    });
    ok(eliminado.status === 200 && eliminado.contenido?.deleted === true, 'borrar territorio', `HTTP ${eliminado.status}`);
  }

  // 5.7 Persistencia: releer tras las escrituras (el backend ya estaba en marcha).
  const persistida = await pedir(`${base}/outings`, { token: sesion.idToken });
  ok(persistida.status === 200, 'los datos siguen accesibles tras escribir', `HTTP ${persistida.status}`);

  console.log('  ℹ  Para probar "reiniciar el backend y que los datos persistan", ejecutá:');
  console.log('      1) este script con --con-escritura  (crea y deja una salida de prueba)');
  console.log('      2) reiniciá el backend (Ctrl+C y npm run dev)');
  console.log('      3) GET ' + base + '/outings y comprobá que la salida sigue ahí');
}

// ---------------------------------------------------------------- principal

async function main() {
  console.log('==========================================================');
  console.log('  VERIFICACIÓN REAL DEL GESTOR CONTRA EL BACKEND');
  console.log(`  Destino: ${BASE}`);
  console.log(`  Mes de prueba: ${MES_PRUEBA}`);
  console.log(`  Escritura real: ${CON_ESCRITURA ? 'SÍ' : 'no (solo lectura)'}`);
  console.log('==========================================================');

  // Comprobación de credenciales del backend antes de empezar.
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(readFileSync(resolve(serviceAccount), 'utf8'));
      console.log(`\nProyecto Firebase (por credenciales del backend): ${parsed.project_id}`);
    } catch { /* la ruta puede ser relativa a backend/ */ }
  }

  await probarAutorizacion();

  if (!EMAIL || !PASSWORD) {
    console.log('\n⛔ Faltan GESTOR_EMAIL / GESTOR_PASSWORD: no se pudo iniciar sesión.');
    console.log('   El resto de las pruebas queda BLOQUEADO, no "aprobado".');
    return resumen();
  }

  let sesion;
  try {
    sesion = await iniciarSesion();
  } catch (error) {
    console.log(`\n⛔ No se pudo iniciar sesión: ${error.message}`);
    console.log('   El resto de las pruebas queda BLOQUEADO, no "aprobado".');
    return resumen();
  }

  const lecturasOk = await probarSesion(sesion);
  await probarNoAdmin();
  if (!lecturasOk) {
    console.log('\n⛔ Firestore no respondió (cuota/permisos): se detienen las pruebas de datos.');
    return resumen();
  }

  await probarLecturas(sesion);
  if (CON_ESCRITURA) await probarEscritura(sesion, sesion.uid);

  return resumen();
}

function resumen() {
  console.log('\n==========================================================');
  const pasaron = resultados.filter((r) => r.ok).length;
  const fallaron = resultados.length - pasaron;
  console.log(`  RESULTADO: ${pasaron} correctas, ${fallaron} fallidas/omitidas de ${resultados.length}`);
  if (fallaron > 0) {
    console.log('  Pendientes:');
    for (const r of resultados.filter((x) => !x.ok)) console.log(`    - ${r.etiqueta} ${r.detalle}`);
    process.exitCode = 1;
  }
  console.log('==========================================================');
}

main().catch((error) => {
  console.error('\n❌ Error inesperado:', error?.message || error);
  process.exit(1);
});
