// Migración de backend/data/months.json a Cloud Firestore.
//
// SEGURO POR DISEÑO:
//   - Por defecto SOLO SIMULA: no escribe nada. Para escribir hace falta --escribir.
//   - Antes de escribir, compara origen y destino. Si un documento ya existe con
//     datos diferentes, SE DETIENE y reporta el conflicto. No sobreescribe en silencio.
//   - Es repetible: los documentos usan el ID original, así que re-ejecutar
//     actualiza el mismo documento en lugar de duplicarlo.
//
// Uso:
//   node scripts/migrar-a-firestore.js                      (simulación)
//   node scripts/migrar-a-firestore.js --escribir           (escritura real)
//   node scripts/migrar-a-firestore.js --escribir --forzar  (sobreescribe diferencias)
//
// Requiere las credenciales de administrador (FIREBASE_SERVICE_ACCOUNT o
// GOOGLE_APPLICATION_CREDENTIALS). No guarda ni imprime claves.

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ESCRITURA = process.argv.includes('--escribir');
const FORZAR = process.argv.includes('--forzar');
const LOTE_MAX = 400; // Firestore admite hasta 500 operaciones por lote: se deja margen.

// ---------------------------------------------------------------- credenciales

function loadServiceAccount() {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath) return cert(JSON.parse(readFileSync(resolve(filePath), 'utf8')));

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey });

  return applicationDefault();
}

// ---------------------------------------------------------------- origen

const dataFile = process.env.SCHEDULE_DATA_FILE
  ? pathToFileURL(resolve(process.env.SCHEDULE_DATA_FILE))
  : new URL('../data/months.json', import.meta.url);

function leerOrigen() {
  return JSON.parse(readFileSync(dataFile, 'utf8'));
}

// El campo `mes` es derivado: sale de la fecha real de la salida.
function mesDeFecha(date) {
  return String(date || '').slice(0, 7);
}

// ---------------------------------------------------------------- armado de documentos

// Devuelve { coleccion, id, datos, origen } para cada documento a importar.
// Se conservan TODOS los campos existentes; solo se agrega `mes` a las salidas
// y `conductorUid` (null) como hueco para la relación con Firebase Auth.
function construirDocumentos(data) {
  const docs = [];

  // Catálogos: se copian tal cual, con su ID original.
  for (const item of data.types || []) {
    docs.push({ coleccion: 'tiposSalida', id: item.id, datos: { ...item }, origen: 'types' });
  }
  for (const item of data.drivers || []) {
    docs.push({
      coleccion: 'conductores',
      id: item.id,
      // `uid` queda en null: solo se completa cuando exista una relación verificada.
      datos: { ...item, uid: item.uid ?? null },
      origen: 'drivers',
    });
  }
  for (const item of data.houses || []) {
    docs.push({ coleccion: 'casas', id: item.id, datos: { ...item }, origen: 'houses' });
  }
  for (const item of data.territories || []) {
    docs.push({ coleccion: 'territorios', id: item.id, datos: { ...item }, origen: 'territories' });
  }
  for (const item of data.locations || []) {
    docs.push({ coleccion: 'ubicaciones', id: item.id, datos: { ...item }, origen: 'locations' });
  }
  for (const item of data.territoryLocations || []) {
    docs.push({ coleccion: 'ubicacionesTerritorio', id: item.id, datos: { ...item }, origen: 'territoryLocations' });
  }

  // Un documento por mes: configuración, rotaciones, disponibilidades y campos
  // opcionales. Los campos opcionales se copian SOLO si existen en el origen.
  for (const [mes, month] of Object.entries(data.months || {})) {
    const datos = {
      year: Number(mes.slice(0, 4)),
      month: Number(mes.slice(5, 7)),
      configuration: month.configuration || [],
      driverRotations: month.driverRotations || { elders: {}, groupConductors: {} },
      houseRotations: month.houseRotations || {},
      driverAvailability: month.driverAvailability || {},
      houseAvailability: month.houseAvailability || {},
    };
    // Campos opcionales: solo si el mes los tiene (varían entre meses).
    if (month.locationAvailability !== undefined) datos.locationAvailability = month.locationAvailability;
    if (month.houseAvailabilityConfirmations !== undefined) datos.houseAvailabilityConfirmations = month.houseAvailabilityConfirmations;

    docs.push({ coleccion: 'meses', id: mes, datos, origen: `months.${mes}` });

    // Salidas: colección aparte, un documento por salida, con el UUID como ID.
    for (const outing of month.outings || []) {
      docs.push({
        coleccion: 'salidas',
        id: outing.id,
        datos: {
          ...outing,               // se conservan los 19 campos originales
          mes: mesDeFecha(outing.date), // campo derivado nuevo
          conductorUid: outing.conductorUid ?? null, // hueco para la relación con Auth
        },
        origen: `months.${mes}.outings`,
      });
    }
  }

  return docs;
}

// ---------------------------------------------------------------- utilidades

function huella(valor) {
  return createHash('sha256').update(JSON.stringify(valor)).digest('hex').slice(0, 12);
}

// Compara dos objetos campo por campo (una sola profundidad es suficiente aquí,
// pero se compara el JSON completo normalizado para no perder nada).
function iguales(a, b) {
  return JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));
}

function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, ordenar(valor[k])]));
  }
  return valor;
}

async function lotes(operaciones) {
  const db = getFirestore();
  for (let i = 0; i < operaciones.length; i += LOTE_MAX) {
    const lote = db.batch();
    for (const op of operaciones.slice(i, i + LOTE_MAX)) {
      lote.set(db.collection(op.coleccion).doc(op.id), op.datos);
    }
    await lote.commit();
    console.log(`  ... confirmado lote ${Math.floor(i / LOTE_MAX) + 1} (${Math.min(i + LOTE_MAX, operaciones.length)}/${operaciones.length})`);
  }
}

// ---------------------------------------------------------------- principal

async function main() {
  // La app de administrador se inicializa antes de tocar Firestore.
  if (getApps().length === 0) initializeApp({ credential: loadServiceAccount() });

  const data = leerOrigen();
  const docs = construirDocumentos(data);

  console.log('==========================================================');
  console.log(ESCRITURA ? '  MODO: ESCRITURA REAL' : '  MODO: SIMULACIÓN (no escribe nada)');
  console.log('==========================================================\n');

  // --- Inventario por colección
  const porColeccion = {};
  for (const d of docs) {
    porColeccion[d.coleccion] = porColeccion[d.coleccion] || { total: 0, ids: new Set() };
    porColeccion[d.coleccion].total++;
    if (porColeccion[d.coleccion].ids.has(d.id)) {
      console.error(`  ❌ ID DUPLICADO en ${d.coleccion}: ${d.id} (origen ${d.origen})`);
      process.exitCode = 1;
    }
    porColeccion[d.coleccion].ids.add(d.id);
  }

  console.log('--- DOCUMENTOS A IMPORTAR ---');
  for (const [col, info] of Object.entries(porColeccion)) {
    console.log(`  ${col.padEnd(22)} ${String(info.total).padStart(4)}   (ids únicos: ${info.ids.size})`);
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(docs.length).padStart(4)}\n`);

  // --- Integridad de referencias
  console.log('--- REFERENCIAS ---');
  const idsPorColeccion = {};
  for (const [col, info] of Object.entries(porColeccion)) idsPorColeccion[col] = info.ids;

  const problemas = [];
  for (const d of docs.filter((x) => x.coleccion === 'salidas')) {
    const o = d.datos;
    if (o.driverId && !idsPorColeccion.conductores.has(o.driverId)) {
      problemas.push(`driverId inexistente en salida ${o.id}: ${o.driverId}`);
    }
    if (o.placeId && o.placeType === 'house' && !idsPorColeccion.casas.has(o.placeId)) {
      problemas.push(`placeId de casa inexistente en salida ${o.id}: ${o.placeId}`);
    }
    if (o.placeId && o.placeType === 'location' && !idsPorColeccion.ubicaciones.has(o.placeId)) {
      problemas.push(`placeId de ubicación inexistente en salida ${o.id}: ${o.placeId}`);
    }
    if (o.source === 'recurring' && !o.configId) {
      problemas.push(`salida recurrente sin configId: ${o.id}`);
    }
  }
  if (problemas.length === 0) console.log('  ✅ Sin referencias rotas.');
  else problemas.forEach((p) => console.log(`  ⚠️  ${p}`));

  // --- Resumen de datos que se conservan
  console.log('\n--- DATOS CONSERVADOS ---');
  let salidasRec = 0, salidasMan = 0, conOverrides = 0, conMes = 0;
  for (const d of docs.filter((x) => x.coleccion === 'salidas')) {
    const o = d.datos;
    if (o.source === 'recurring') salidasRec++;
    if (o.source === 'manual') salidasMan++;
    if (o.driverManualOverride || o.territoryManualOverride || o.placeManualOverride || o.colorManualOverride) conOverrides++;
    if (o.mes === o.date.slice(0, 7)) conMes++;
  }
  const totalSalidas = salidasRec + salidasMan;
  console.log(`  salidas: ${totalSalidas} (recurrentes ${salidasRec}, manuales ${salidasMan})`);
  console.log(`  salidas con alguna bandera *ManualOverride: ${conOverrides}`);
  console.log(`  salidas con campo "mes" correcto: ${conMes}/${totalSalidas}`);

  // --- Comparación con el destino
  const db = getFirestore();
  console.log('\n--- COMPARACIÓN CON FIRESTORE ---');
  const nuevos = [], identicos = [], conflictos = [];

  for (const d of docs) {
    const ref = db.collection(d.coleccion).doc(d.id);
    const snap = await ref.get();
    if (!snap.exists) { nuevos.push(d); continue; }
    iguales(snap.data(), d.datos) ? identicos.push(d) : conflictos.push({ ...d, remoto: snap.data() });
  }

  console.log(`  nuevos (se crearán):      ${nuevos.length}`);
  console.log(`  idénticos (sin cambios):  ${identicos.length}`);
  console.log(`  CON CONFLICTO:            ${conflictos.length}`);

  if (conflictos.length > 0) {
    console.log('\n--- CONFLICTOS DETECTADOS (mismo ID, datos distintos) ---');
    for (const c of conflictos.slice(0, 20)) {
      console.log(`  ${c.coleccion}/${c.id}`);
      console.log(`    local:  ${huella(c.datos)}`);
      console.log(`    remoto: ${huella(c.remoto)}`);
    }
    if (conflictos.length > 20) console.log(`  ... y ${conflictos.length - 20} más`);

    if (!ESCRITURA) {
      console.log('\n  ⛔ La escritura se detendría aquí.');
      console.log('     Revisá los conflictos o usá --forzar (con cuidado) para sobreescribir.');
    } else if (!FORZAR) {
      console.log('\n  ⛔ MIGRACIÓN DETENIDA: hay conflictos y no se pasó --forzar.');
      console.log('     No se escribió nada. Se conservan los documentos existentes.');
      process.exit(1);
    } else {
      console.log('\n  ⚠️  --forzar activo: los documentos en conflicto SE SOBREESCRIBIRÁN.');
    }
  }

  if (!ESCRITURA) {
    console.log('\n==========================================================');
    console.log('  SIMULACIÓN TERMINADA. No se escribió nada en Firestore.');
    console.log('  Para ejecutar de verdad: node scripts/migrar-a-firestore.js --escribir');
    console.log('==========================================================');
    return;
  }

  // --- Escritura
  const aEscribir = FORZAR ? [...nuevos, ...conflictos] : nuevos;
  if (aEscribir.length === 0) {
    console.log('\n✅ Nada que escribir: el destino ya coincide con el origen.');
    return;
  }

  console.log(`\n--- ESCRIBIENDO ${aEscribir.length} DOCUMENTOS ---`);
  await lotes(aEscribir);
  console.log('\n✅ Migración completada.');
  console.log('   Ejecutá el script de verificación: node scripts/verificar-migracion.js');
}

main().catch((error) => {
  console.error('\n❌ Error durante la migración:', error?.message || error);
  process.exit(1);
});
