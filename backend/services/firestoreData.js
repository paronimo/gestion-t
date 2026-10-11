import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Capa de acceso a datos en Firestore.
//
// Traduce la MISMA forma de datos que usaba months.json (un objeto con
// { types, drivers, houses, territories, territoryLocations, locations, months })
// a las colecciones de Firestore, y viceversa. La lógica de negocio del modelo
// no cambia: sigue trabajando con el mismo objeto `data`.
//
// Mapeo:
//   data.types              <-> tiposSalida/{id}
//   data.drivers            <-> conductores/{id}
//   data.houses             <-> casas/{id}
//   data.territories        <-> territorios/{id}
//   data.locations          <-> ubicaciones/{id}
//   data.territoryLocations <-> ubicacionesTerritorio/{id}
//   data.months[YYYY-MM]    <-> meses/{YYYY-MM}   (config, rotaciones, disponibilidades)
//   months[mes].outings[]   <-> salidas/{uuid}    (colección aparte, como se acordó)

let adminApp = null;

function loadServiceAccount() {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath) return cert(JSON.parse(readFileSync(resolve(filePath), 'utf8')));

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey });

  return applicationDefault();
}

export function getDb() {
  if (!adminApp) {
    adminApp = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: loadServiceAccount() });
  }
  return getFirestore(adminApp);
}

// El campo derivado `mes` se mantiene sincronizado con `date`. Si una fecha
// cambia, el mes cambia con ella.
export function mesDeFecha(date) {
  return String(date || '').slice(0, 7);
}

// Los documentos de catálogo guardan solo los datos; el id vive en la ruta.
function conId(doc) {
  return { ...doc.data(), id: doc.id };
}

const COLECCIONES_CATALOGO = {
  types: 'tiposSalida',
  drivers: 'conductores',
  houses: 'casas',
  territories: 'territorios',
  locations: 'ubicaciones',
  territoryLocations: 'ubicacionesTerritorio',
};

// ---------------------------------------------------------------- lectura

// Devuelve el mismo objeto `data` que devolvía readData() con months.json.
export async function readData() {
  const db = getDb();

  const [types, drivers, houses, territories, locations, territoryLocations, mesesSnap, salidasSnap] = await Promise.all([
    db.collection('tiposSalida').get(),
    db.collection('conductores').get(),
    db.collection('casas').get(),
    db.collection('territorios').get(),
    db.collection('ubicaciones').get(),
    db.collection('ubicacionesTerritorio').get(),
    db.collection('meses').get(),
    db.collection('salidas').get(),
  ]);

  // Las salidas se reparten por su campo `mes`. Si por algún motivo faltara,
  // se deduce de la fecha, para no perder ninguna.
  const salidasPorMes = {};
  for (const doc of salidasSnap.docs) {
    const salida = doc.data();
    const mes = salida.mes || mesDeFecha(salida.date);
    (salidasPorMes[mes] = salidasPorMes[mes] || []).push({ ...salida, id: doc.id });
  }

  const months = {};
  for (const doc of mesesSnap.docs) {
    months[doc.id] = montarMes(doc.id, doc.data(), salidasPorMes[doc.id] || []);
  }

  // Un mes con salidas pero sin documento en `meses` no debe perder sus salidas.
  for (const [mes, outings] of Object.entries(salidasPorMes)) {
    if (!months[mes]) months[mes] = montarMes(mes, {}, outings);
  }

  return {
    types: types.docs.map(conId),
    drivers: drivers.docs.map(conId),
    houses: houses.docs.map(conId),
    territories: territories.docs.map(conId),
    locations: locations.docs.map(conId),
    territoryLocations: territoryLocations.docs.map(conId),
    months,
  };
}

// ---------------------------------------------------------------- lecturas selectivas
//
// readData() lee TODA la base (244 documentos con los datos actuales) y se
// llamaba 30 veces. Para operaciones puntuales eso es un desperdicio enorme.
// Estas funciones leen solo lo necesario:
//   - solo los catálogos que haga falta,
//   - solo las salidas de un mes,
//   - solo el documento de un mes.
//
// Devuelven la MISMA forma que readData(), pero con lo demás vacío, para que el
// código de negocio no tenga que cambiar.

function catalogoVacio() {
  return { types: [], drivers: [], houses: [], territories: [], locations: [], territoryLocations: [] };
}

// Lee un solo catálogo por nombre de colección.
// Ejemplo: readCatalogo('conducuores') -> { drivers: [...] }
const CLAVES_CATALOGO = Object.fromEntries(
  Object.entries(COLECCIONES_CATALOGO).map(([clave, coleccion]) => [coleccion, clave]),
);

export async function readCatalogo(coleccion) {
  const snap = await getDb().collection(coleccion).get();
  const clave = CLAVES_CATALOGO[coleccion];
  if (!clave) throw new Error(`Colección de catálogo desconocida: ${coleccion}`);
  return { ...catalogoVacio(), [clave]: snap.docs.map(conId) };
}

// Lee SOLO las salidas de un mes. Con el campo `mes` indexado, esto trae
// únicamente los documentos de ese mes en lugar de las 144 salidas.
export async function readSalidasDeMes(mes) {
  const snap = await getDb().collection('salidas').where('mes', '==', mes).get();
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

// Lee SOLO el documento de un mes (configuración, rotaciones, disponibilidades).
export async function readMes(mes) {
  const snap = await getDb().collection('meses').doc(mes).get();
  if (!snap.exists) return null;
  return montarMes(snap.id, snap.data(), []);
}

// Lee un mes completo (su documento + sus salidas), sin tocar el resto.
export async function readMesConSalidas(mes) {
  const [docMes, salidas] = await Promise.all([
    getDb().collection('meses').doc(mes).get(),
    readSalidasDeMes(mes),
  ]);
  if (!docMes.exists) {
    // Un mes con salidas pero sin documento no debe perder sus salidas.
    return salidas.length ? montarMes(mes, {}, salidas) : null;
  }
  return montarMes(mes, docMes.data(), salidas);
}

// Lee un catálogo concreto más un mes completo: lo que necesita una operación
// que toca, por ejemplo, conductores y las salidas de un mes.
export async function readMesConSalidasYCatalogo(mes, coleccion) {
  const [mesCompleto, catalogo] = await Promise.all([
    readMesConSalidas(mes),
    readCatalogo(coleccion),
  ]);
  return { ...catalogo, months: mesCompleto ? { [mes]: mesCompleto } : {} };
}

// Arma el objeto de un mes con la misma forma que devolvía readData().
function montarMes(id, doc, salidas) {
  return {
    configuration: doc.configuration || [],
    outings: salidas,
    driverAvailability: doc.driverAvailability || {},
    driverRotations: doc.driverRotations || { elders: {}, groupConductors: {} },
    houseAvailability: doc.houseAvailability || {},
    houseRotations: doc.houseRotations || {},
    ...(doc.locationAvailability !== undefined ? { locationAvailability: doc.locationAvailability } : {}),
    ...(doc.houseAvailabilityConfirmations !== undefined ? { houseAvailabilityConfirmations: doc.houseAvailabilityConfirmations } : {}),
  };
}

// ---------------------------------------------------------------- escritura

// Guarda el objeto `data` completo de forma segura:
//   - catálogos y meses: se escriben solo si cambiaron (comparación por contenido),
//   - salidas: se escriben por documento, y se borran las que ya no existen,
//   - todo va en lotes de 400 operaciones (Firestore admite 500).
//
// Se compara por contenido para no reescribir 144 salidas en cada cambio de
// disponibilidad: sin esto, cada operación pequeña reescribiría toda la base.
// Opciones de writeData:
//   colecciones: limita la escritura a estas colecciones (lo demás se ignora).
//   borrar: si es false, NO se borran documentos ausentes. Las operaciones
//           puntuales (editar una salida, cambiar una disponibilidad) no pueden
//           haber borrado nada, así que revisar toda la base para borrar es
//           puro desperdicio: 8 lecturas de colección por cada cambio.
export async function writeData(data, { colecciones = null, borrar = true, soloSalidasEnMes = null } = {}) {
  const db = getDb();
  const operaciones = [];
  const incluir = (coleccion) => !colecciones || colecciones.includes(coleccion);

  for (const [clave, coleccion] of Object.entries(COLECCIONES_CATALOGO)) {
    if (!incluir(coleccion)) continue;
    for (const item of data[clave] || []) {
      if (!item.id) throw new Error(`Documento de ${coleccion} sin id`);
      const { id, ...resto } = item;
      operaciones.push({ tipo: 'set', coleccion, id, datos: resto });
    }
  }

  for (const [mes, month] of Object.entries(data.months || {})) {
    const { outings, ...resto } = month;

    if (incluir('meses')) {
      operaciones.push({
        tipo: 'set',
        coleccion: 'meses',
        id: mes,
        datos: { year: Number(mes.slice(0, 4)), month: Number(mes.slice(5, 7)), ...resto },
      });
    }

    if (!incluir('salidas')) continue;

    for (const outing of outings || []) {
      if (!outing.id) throw new Error(`Salida sin id en ${mes}`);
      const { id, ...restoSalida } = outing;
      operaciones.push({
        tipo: 'set',
        coleccion: 'salidas',
        id,
        // `mes` se recalcula desde la fecha real: se mantiene sincronizado.
        datos: { ...restoSalida, mes: mesDeFecha(outing.date), conductorUid: outing.conductorUid ?? null },
      });
    }
  }

  await aplicarOperaciones(db, operaciones);

  // Solo se revisan los ausentes cuando la operación pudo haber borrado algo.
  if (borrar) await borrarAusentes(db, data, colecciones, soloSalidasEnMes);
}

// Escribe solo lo que difiere del contenido remoto, para no gastar escrituras.
async function aplicarOperaciones(db, operaciones) {
  const pendientes = [];
  const refs = operaciones.map((op) => db.collection(op.coleccion).doc(op.id));
  const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];

  for (let i = 0; i < operaciones.length; i++) {
    const op = operaciones[i];
    const remoto = snapshots[i];
    // Se escribe solo si es nuevo o si su contenido cambió.
    if (!remoto.exists || JSON.stringify(ordenar(remoto.data())) !== JSON.stringify(ordenar(op.datos))) {
      pendientes.push(op);
    }
  }

  for (let i = 0; i < pendientes.length; i += 400) {
    const lote = db.batch();
    for (const op of pendientes.slice(i, i + 400)) {
      lote.set(db.collection(op.coleccion).doc(op.id), op.datos);
    }
    await lote.commit();
  }
}

// Elimina de Firestore todo lo que ya no existe en `data`:
//   - salidas regeneradas o borradas,
//   - meses que ya no están,
//   - conductores, casas, territorios, ubicaciones, tipos... borrados.
// Sin esto, un borrado devolvería "ok" pero el documento seguiría en Firestore.
//
// `soloSalidasEnMes`: cuando se indica un mes, las salidas ausentes se buscan
// SOLO en ese mes. Borrar una salida concreta no necesita revisar las 144
// salidas de la base: basta con comprobar las del mes afectado.
async function borrarAusentes(db, data, colecciones = null, soloSalidasEnMes = null) {
  // IDs que deben existir, colección por colección.
  const esperados = {};
  for (const [clave, coleccion] of Object.entries(COLECCIONES_CATALOGO)) {
    esperados[coleccion] = new Set((data[clave] || []).map((item) => item.id));
  }
  esperados.meses = new Set(Object.keys(data.months || {}));
  esperados.salidas = new Set(
    (soloSalidasEnMes ? [data.months[soloSalidasEnMes]].filter(Boolean) : Object.values(data.months || {}))
      .flatMap((month) => (month.outings || []).map((o) => o.id)),
  );

  const aBorrar = [];
  for (const [coleccion, ids] of Object.entries(esperados)) {
    if (colecciones && !colecciones.includes(coleccion)) continue;
    // `select()` trae solo las referencias: mucho más barato que los documentos.
    // Si se acotó a un mes, las salidas se consultan solo de ese mes (índice `mes`).
    const consulta = (coleccion === 'salidas' && soloSalidasEnMes)
      ? db.collection(coleccion).where('mes', '==', soloSalidasEnMes).select()
      : db.collection(coleccion).select();
    const remotas = await consulta.get();
    for (const doc of remotas.docs) {
      if (!ids.has(doc.id)) aBorrar.push(doc.ref);
    }
  }

  if (aBorrar.length === 0) return;

  for (let i = 0; i < aBorrar.length; i += 400) {
    const lote = db.batch();
    for (const ref of aBorrar.slice(i, i + 400)) lote.delete(ref);
    await lote.commit();
  }
}

function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, ordenar(valor[k])]));
  }
  return valor;
}

// ---------------------------------------------------------------- transacciones

// Varias escrituras seguidas (por ejemplo, una operación que toca catálogos y
// salidas a la vez) se agrupan aquí para no perder actualizaciones.
// Se usa una cola en proceso: protege contra peticiones simultáneas al mismo
// backend, que es el escenario real de este gestor.
let cola = Promise.resolve();

export function enCola(tarea) {
  const resultado = cola.then(tarea, tarea);
  // La cola no debe romperse si una tarea falla.
  cola = resultado.then(() => undefined, () => undefined);
  return resultado;
}
