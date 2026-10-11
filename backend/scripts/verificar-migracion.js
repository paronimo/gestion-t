// Verifica que Firestore coincida con backend/data/months.json después de migrar.
//
// Compara: cantidades, IDs, `source`, `configId`, las cuatro banderas
// *ManualOverride, rotaciones, disponibilidades, campos opcionales,
// correspondencia de driverId y el campo `mes` de cada salida.
//
// Uso: node scripts/verificar-migracion.js
// No escribe nada.

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function loadServiceAccount() {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath) return cert(JSON.parse(readFileSync(resolve(filePath), 'utf8')));
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey });
  return applicationDefault();
}

const dataFile = process.env.SCHEDULE_DATA_FILE
  ? pathToFileURL(resolve(process.env.SCHEDULE_DATA_FILE))
  : new URL('../data/months.json', import.meta.url);

const data = JSON.parse(readFileSync(dataFile, 'utf8'));

const fallos = [];
const ok = (condicion, mensaje) => {
  console.log(`  ${condicion ? '✅' : '❌'} ${mensaje}`);
  if (!condicion) fallos.push(mensaje);
};

async function contar(coleccion) {
  const db = getFirestore();
  const snap = await db.collection(coleccion).get();
  return snap.docs;
}

async function main() {
  if (getApps().length === 0) initializeApp({ credential: loadServiceAccount() });
  const db = getFirestore();

  console.log('==========================================================');
  console.log('  VERIFICACIÓN DE LA MIGRACIÓN');
  console.log('==========================================================\n');

  // --- Cantidades
  console.log('--- CANTIDADES ---');
  const mesesEsperados = Object.keys(data.months || {}).length;
  const salidasEsperadas = Object.values(data.months || {}).reduce((t, m) => t + (m.outings || []).length, 0);
  const reglasEsperadas = Object.values(data.months || {}).reduce((t, m) => t + (m.configuration || []).length, 0);

  const meses = await contar('meses');
  const salidas = await contar('salidas');
  ok(meses.length === mesesEsperados, `meses: ${meses.length}/${mesesEsperados}`);
  ok(salidas.length === salidasEsperadas, `salidas: ${salidas.length}/${salidasEsperadas}`);

  for (const [col, arr] of [
    ['conductores', data.drivers],
    ['casas', data.houses],
    ['territorios', data.territories],
    ['ubicaciones', data.locations],
    ['tiposSalida', data.types],
  ]) {
    const docs = await contar(col);
    ok(docs.length === (arr || []).length, `${col}: ${docs.length}/${(arr || []).length}`);
  }

  // --- Existencia de todos los IDs originales
  console.log('\n--- IDs ORIGINALES ---');
  let faltantes = 0;
  for (const [mes, month] of Object.entries(data.months || {})) {
    const snap = await db.collection('salidas').where('mes', '==', mes).get();
    const idsRemotos = new Set(snap.docs.map((d) => d.id));
    for (const o of month.outings || []) if (!idsRemotos.has(o.id)) faltantes++;
  }
  ok(faltantes === 0, `todas las salidas existen en Firestore (faltan ${faltantes})`);

  // --- Campos críticos salida por salida
  console.log('\n--- CAMPOS CRÍTICOS DE LAS SALIDAS ---');
  let malaSource = 0, maloConfig = 0, malasBanderas = 0, malMes = 0, malDriverId = 0;
  const driverIds = new Set((data.drivers || []).map((x) => x.id));

  for (const [mes, month] of Object.entries(data.months || {})) {
    for (const o of month.outings || []) {
      const doc = await db.collection('salidas').doc(o.id).get();
      if (!doc.exists) continue;
      const r = doc.data();
      if (r.source !== o.source) malaSource++;
      if (r.configId !== o.configId) maloConfig++;
      if (
        r.driverManualOverride !== o.driverManualOverride ||
        r.territoryManualOverride !== o.territoryManualOverride ||
        r.placeManualOverride !== o.placeManualOverride ||
        r.colorManualOverride !== o.colorManualOverride
      ) malasBanderas++;
      if (r.mes !== o.date.slice(0, 7)) malMes++;
      if (r.driverId && !driverIds.has(r.driverId)) malDriverId++;
    }
  }
  ok(malaSource === 0, `source coincide en todas (${malaSource} diferencias)`);
  ok(maloConfig === 0, `configId coincide en todas (${maloConfig} diferencias)`);
  ok(malasBanderas === 0, `las 4 banderas *ManualOverride coinciden (${malasBanderas} diferencias)`);
  ok(malMes === 0, `campo "mes" correcto en todas (${malMes} diferencias)`);
  ok(malDriverId === 0, `driverId corresponde a un conductor real (${malDriverId} rotos)`);

  // --- Reglas recurrentes
  console.log('\n--- REGLAS RECURRENTES ---');
  let reglasRemotas = 0;
  for (const mes of Object.keys(data.months || {})) {
    const doc = await db.collection('meses').doc(mes).get();
    if (doc.exists) reglasRemotas += (doc.data().configuration || []).length;
  }
  ok(reglasRemotas === reglasEsperadas, `reglas: ${reglasRemotas}/${reglasEsperadas}`);

  // --- Rotaciones, disponibilidades y opcionales
  console.log('\n--- ROTACIONES, DISPONIBILIDADES Y OPCIONALES ---');
  for (const [mes, month] of Object.entries(data.months || {})) {
    const doc = await db.collection('meses').doc(mes).get();
    if (!doc.exists) { ok(false, `mes ${mes} no existe`); continue; }
    const r = doc.data();
    ok(
      JSON.stringify(r.driverRotations) === JSON.stringify(month.driverRotations || { elders: {}, groupConductors: {} }),
      `${mes}: driverRotations`,
    );
    ok(JSON.stringify(r.houseRotations) === JSON.stringify(month.houseRotations || {}), `${mes}: houseRotations`);
    ok(Object.keys(r.driverAvailability || {}).length === Object.keys(month.driverAvailability || {}).length, `${mes}: driverAvailability`);
    ok(Object.keys(r.houseAvailability || {}).length === Object.keys(month.houseAvailability || {}).length, `${mes}: houseAvailability`);

    // Los campos opcionales: si el origen los tiene, deben estar; si no, no se inventan.
    ok(
      (r.locationAvailability === undefined) === (month.locationAvailability === undefined),
      `${mes}: locationAvailability (opcional)`,
    );
    ok(
      (r.houseAvailabilityConfirmations === undefined) === (month.houseAvailabilityConfirmations === undefined),
      `${mes}: houseAvailabilityConfirmations (opcional)`,
    );
  }

  // --- Resultado
  console.log('\n==========================================================');
  if (fallos.length === 0) {
    console.log('  ✅ VERIFICACIÓN CORRECTA: Firestore coincide con months.json');
  } else {
    console.log(`  ❌ ${fallos.length} COMPROBACIONES FALLARON:`);
    fallos.forEach((f) => console.log(`     - ${f}`));
    process.exitCode = 1;
  }
  console.log('==========================================================');
}

main().catch((error) => {
  console.error('\n❌ Error en la verificación:', error?.message || error);
  process.exit(1);
});
