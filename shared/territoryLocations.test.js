import assert from 'node:assert/strict';
import test from 'node:test';
import {
  locationTerritoriesText,
  locationsOfTerritory,
  normalizeLocationTerritories,
  suggestLocations,
} from './territoryLocations.js';

const plaza = { id: 'plaza', name: 'Plaza de la Salud', territories: '1, 2, 3, 4', mapsUrl: 'https://maps.google.com/?q=plaza' };
const esquina = { id: 'esquina', name: 'Esquina X', territories: '4, 5', mapsUrl: '' };
const familia = { id: 'familia', name: 'Casa de la Familia Pérez', territories: '10, 11, 12' };

test('normaliza la lista de territorios de una ubicación', () => {
  assert.deepEqual(normalizeLocationTerritories('1, 2, 3, 4'), ['1', '2', '3', '4']);
  assert.deepEqual(normalizeLocationTerritories(' 1 , 2 '), ['1', '2']);
  assert.deepEqual(normalizeLocationTerritories('1, 1, 2'), ['1', '2'], 'quita repetidos');
  assert.deepEqual(normalizeLocationTerritories(''), []);
  assert.equal(locationTerritoriesText(plaza), '1, 2, 3, 4');
});

test('un territorio con una ubicación sugiere esa ubicación', () => {
  const result = suggestLocations('4', [plaza, familia]);
  assert.equal(result.length, 1);
  assert.equal(result[0].location.id, 'plaza');
  assert.equal(result[0].territory, '4');
});

test('varias ubicaciones las muestra todas', () => {
  const result = suggestLocations('4', [plaza, esquina, familia]);
  assert.equal(result.length, 2);
  // Ninguna se elige por el usuario: se listan ambas.
  assert.deepEqual(result.map((item) => item.location.id).sort(), ['esquina', 'plaza']);
});

test('una salida con varios territorios sugiere por cada coincidencia', () => {
  const result = suggestLocations('1, 70, 69, 2', [plaza, familia]);
  // Plaza sirve para 1 y 2; la familia no sirve a ninguno de esos.
  assert.equal(result.length, 1);
  assert.equal(result[0].location.id, 'plaza');

  const conPerez = suggestLocations('1, 10, 2', [plaza, familia]);
  assert.equal(conPerez.length, 2);
  assert.deepEqual(conPerez.map((item) => item.location.id).sort(), ['familia', 'plaza']);
});

test('no distingue mayúsculas y tolera espacios', () => {
  assert.equal(suggestLocations(' 4 ', [plaza]).length, 1);
  assert.equal(suggestLocations('4', [{ id: 'x', name: 'X', territories: '4' }]).length, 1);
  // Sin embargo distingue un territorio distinto.
  assert.equal(suggestLocations('5', [plaza]).length, 0);
});

test('una ubicación deshabilitada no se sugiere', () => {
  const deshabilitada = { ...plaza, active: false };
  assert.equal(suggestLocations('4', [deshabilitada]).length, 0);
  assert.equal(suggestLocations('4', [deshabilitada, familia]).length, 0);
});

test('sin territorios no hay sugerencias', () => {
  assert.deepEqual(suggestLocations('', [plaza]), []);
  assert.deepEqual(suggestLocations('  ', [plaza]), []);
});

test('la ubicación puede no tener enlace de Google Maps', () => {
  const sinEnlace = { id: 's', name: 'Esquina Y', territories: '7', mapsUrl: '' };
  const [result] = suggestLocations('7', [sinEnlace]);
  assert.equal(result.location.name, 'Esquina Y');
  // Sin enlace no hay nada que asociar: la sugerencia sigue siendo válida.
  assert.equal(result.location.mapsUrl, '');
});

test('locationsOfTerritory devuelve todas las de un territorio', () => {
  assert.deepEqual(locationsOfTerritory('4', [plaza, esquina, familia]).map((l) => l.id).sort(), ['esquina', 'plaza']);
  assert.deepEqual(locationsOfTerritory('11', [plaza, esquina, familia]).map((l) => l.id), ['familia']);
  assert.deepEqual(locationsOfTerritory('99', [plaza]), []);
});
