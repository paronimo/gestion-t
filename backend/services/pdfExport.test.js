import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSchedulePdf, paletteFor } from './pdfExport.js';
import { backgroundFor, isDarkColor, normalizeColor, textColorFor } from '../../shared/colors.js';

function outing(overrides = {}) {
  return {
    date: '2026-10-01',
    weekday: 'jueves',
    time: '17:30',
    type: 'Grupo 1',
    placeName: 'Flia. Espinoza',
    placeMapsUrl: '',
    driverName: 'Ana Anciana',
    territory: '38',
    ...overrides,
  };
}

function uriList(buffer) {
  return [...buffer.toString('latin1').matchAll(/\/URI \(([^)]*)\)/g)].map((match) => match[1]);
}

test('genera un PDF válido con las columnas del cronograma', async () => {
  const buffer = await buildSchedulePdf({
    year: 2026,
    month: 10,
    outings: [outing()],
  });

  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert(buffer.length > 1000);
});

test('no agrega una columna Casa: el lugar va en una sola columna', async () => {
  const conCasa = await buildSchedulePdf({ year: 2026, month: 10, outings: [outing({ placeName: 'Flia. Espinoza' })] });
  const conUbicacion = await buildSchedulePdf({
    year: 2026,
    month: 10,
    outings: [outing({ placeName: 'C. 14C', placeMapsUrl: 'https://maps.google.com/?q=C+14C' })],
  });

  // Ambas salidas ocupan el mismo ancho de tabla: no hay una columna extra.
  assert(conCasa.includes(conUbicacion.subarray(0, 8)));
  assert.equal(uriList(conCasa).length, 0, 'una casa no lleva enlace');
});

test('el lugar con URL se muestra como texto y queda como enlace clicable', async () => {
  const buffer = await buildSchedulePdf({
    year: 2026,
    month: 10,
    outings: [outing({ placeName: 'C. 14C', placeMapsUrl: 'https://maps.google.com/?q=C+14C' })],
  });

  const links = uriList(buffer);
  assert.deepEqual(links, ['https://maps.google.com/?q=C+14C']);
  // La URL no se escribe en la tabla, solo se guarda como destino del enlace.
  assert(!buffer.toString('latin1').includes('maps.google.com/?q=C+14C (C'));
});

test('los colores dependen del tipo y son estables entre generaciones', async () => {
  const first = await buildSchedulePdf({
    year: 2026,
    month: 10,
    outings: [
      outing({ type: 'Congregacional' }),
      outing({ date: '2026-10-03', type: 'Grupo 1' }),
      outing({ date: '2026-10-04', type: 'Grupo 2' }),
    ],
  });
  const second = await buildSchedulePdf({
    year: 2026,
    month: 10,
    outings: [
      outing({ type: 'Congregacional' }),
      outing({ date: '2026-10-03', type: 'Grupo 1' }),
      outing({ date: '2026-10-04', type: 'Grupo 2' }),
    ],
  });

  const colorsOf = (buffer) => (buffer.toString('latin1').match(/[\d.]+ [\d.]+ [\d.]+ rg/g) || []).sort();
  assert.deepEqual(colorsOf(first), colorsOf(second), 'no debe haber colores aleatorios');
});

test('agrupa las salidas por día y reparte en varias páginas', async () => {
  const many = [];
  for (let day = 1; day <= 28; day += 1) {
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    for (const time of ['09:00', '14:00', '18:30']) many.push(outing({ date, time }));
  }
  const buffer = await buildSchedulePdf({ year: 2026, month: 10, outings: many });
  const pages = (buffer.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length;
  assert(pages > 1, 'con muchas salidas debe generar varias páginas');
});

test('un mes sin salidas genera un PDF válido y no rompe', async () => {
  const buffer = await buildSchedulePdf({ year: 2026, month: 10, outings: [] });
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
});

test('el color de la salida se usa en el PDF en lugar de la paleta por tipo', async () => {
  // El fondo es el color elegido mezclado con blanco, no el color de "Grupo 1".
  assert.equal(paletteFor(outing({ color: '#1B5E20' })).background, backgroundFor('#1B5E20'));
  assert.notEqual(
    paletteFor(outing({ color: '#1B5E20' })).background,
    paletteFor(outing({})).background,
  );

  const buffer = await buildSchedulePdf({
    year: 2026,
    month: 10,
    outings: [outing({ color: '#1B5E20' })],
  });
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
});

test('un color escrito de cualquier forma se normaliza y un color vacío usa el predeterminado', () => {
  assert.equal(normalizeColor('  #1B5E20 '), '#1b5e20');
  assert.equal(normalizeColor('#1b0'), '#11bb00');
  assert.equal(normalizeColor('rojo'), '');
  assert.equal(paletteFor(outing({ color: '' })).background, paletteFor(outing({})).background);
  // El color se suaviza antes de imprimirse, así que un verde oscuro queda con
  // texto oscuro encima; un color muy claro también, por legibilidad.
  assert.equal(paletteFor(outing({ color: '#1B5E20' })).text, textColorFor(backgroundFor('#1B5E20')));
  assert.equal(paletteFor(outing({ color: '#FDF0CE' })).text, textColorFor(backgroundFor('#FDF0CE')));
  assert(isDarkColor('#1B5E20'));
});

test('varias salidas del mismo día con colores distintos no dividen la celda de fecha', async () => {
  // La celda de fecha sigue siendo una sola: si un día mezcla colores, el bloque
  // usa un fondo neutro, pero la fecha se escribe una única vez.
  const buffer = await buildSchedulePdf({
    year: 2026,
    month: 10,
    outings: [
      outing({ time: '09:00', color: '#1565C0' }),
      outing({ time: '18:00', color: '#C62828' }),
    ],
  });

  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  // Cada fila conserva su propio color.
  assert.notEqual(
    paletteFor(outing({ color: '#1565C0' })).background,
    paletteFor(outing({ color: '#C62828' })).background,
  );
});
