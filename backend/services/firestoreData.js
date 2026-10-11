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
    const mes = doc.data();
    months[doc.id] = {
      configuration: mes.configuration || [],
      outings: salidasPorMes[doc.id] || [],
      driverAvailability: mes.driverAvailability || {},
      driverRotations: mes.driverRotations || { elders: {}, groupConductors: {} },
      houseAvailability: mes.houseAvailability || {},
      houseRotations: mes.houseRotations || {},
      // Campos opcionales: solo si existen en el documento.
      ...(mes.locationAvailability !== undefined ? { locationAvailability: mes.locationAvailability } : {}),
      ...(mes.houseAvailabilityConfirmations !== undefined ? { houseAvailabilityConfirmations: mes.houseAvailabilityConfirmations } : {}),
    };
  }

  // Un mes con salidas pero sin documento en `meses` no debe perder sus salidas.
  for (const [mes, outings] of Object.entries(salidasPorMes)) {
    if (!months[mes]) {
      months[mes] = {
        configuration: [], outings,
        driverAvailability: {}, driverRotations: { elders: {}, groupConductors: {} },
        houseAvailability: {}, houseRotations: {},
      };
    }
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

// ---------------------------------------------------------------- escritura

// Guarda el objeto `data` completo de forma segura:
//   - catálogos y meses: se escriben solo si cambiaron (comparación por contenido),
//   - salidas: se escriben por documento, y se borran las que ya no existen,
//   - todo va en lotes de 400 operaciones (Firestore admite 500).
//
// Se compara por contenido para no reescribir 144 salidas en cada cambio de
// disponibilidad: sin esto, cada operación pequeña reescribiría toda la base.
export async function writeData(data) {
  const db = getDb();
  const operaciones = [];

  for (const [clave, coleccion] of Object.entries(COLECCIONES_CATALOGO)) {
    for (const item of data[clave] || []) {
      if (!item.id) throw new Error(`Documento de ${coleccion} sin id`);
      const { id, ...resto } = item;
      operaciones.push({ tipo: 'set', coleccion, id, datos: resto });
    }
  }

  for (const [mes, month] of Object.entries(data.months || {})) {
    const { outings, ...resto } = month;
    operaciones.push({
      tipo: 'set',
      coleccion: 'meses',
      id: mes,
      datos: { year: Number(mes.slice(0, 4)), month: Number(mes.slice(5, 7)), ...resto },
    });

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
  await borrarAusentes(db, data);
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
async function borrarAusentes(db, data) {
  // IDs que deben existir, colección por colección.
  const esperados = {};
  for (const [clave, coleccion] of Object.entries(COLECCIONES_CATALOGO)) {
    esperados[coleccion] = new Set((data[clave] || []).map((item) => item.id));
  }
  esperados.meses = new Set(Object.keys(data.months || {}));
  esperados.salidas = new Set(
    Object.values(data.months || {}).flatMap((month) => (month.outings || []).map((o) => o.id)),
  );

  const aBorrar = [];
  for (const [coleccion, ids] of Object.entries(esperados)) {
    // `select()` trae solo las referencias: mucho más barato que los documentos.
    const remotas = await db.collection(coleccion).select().get();
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
