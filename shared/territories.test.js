import assert from 'node:assert/strict';
import test from 'node:test';
import {
  repeatedTerritories,
  splitTerritories,
  unusedTerritories,
  usedTerritories,
} from './territories.js';

test('divide el territorio por comas e ignora espacios y mayúsculas', () => {
  assert.deepEqual(splitTerritories('1, 70, 69, 2'), ['1', '70', '69', '2']);
  assert.deepEqual(splitTerritories('  38 ,  33  '), ['38', '33']);
  assert.deepEqual(splitTerritories('63,64,65,66'), ['63', '64', '65', '66']);
  // Una salida puede llevar texto especial, no solo números.
  assert.deepEqual(splitTerritories('38, REVISITAS, rural'), ['38', 'REVISITAS', 'rural']);
  assert.deepEqual(splitTerritories(''), []);
  assert.deepEqual(splitTerritories(' , , '), []);
  // Repetidos dentro de la misma salida no se cuentan dos veces.
  assert.deepEqual(splitTerritories('38, 38, 38'), ['38']);
});

test('lista los territorios utilizados sin duplicados', () => {
  const outings = [
    { territory: '1, 70, 69, 2' },
    { territory: '38, 33' },
    { territory: '70' },
    { territory: '' },
    { territory: ' 1 ' },
  ];

  assert.deepEqual(usedTerritories(outings), ['1', '70', '69', '2', '38', '33']);
  assert.deepEqual(usedTerritories([]), []);
});

test('compara los territorios activos registrados contra los utilizados', () => {
  const territories = [
    { id: '1', name: '1', active: true },
    { id: '2', name: '2', active: true },
    { id: '3', name: '3', active: true },
    { id: '4', name: '4', active: true },
    { id: '5', name: '5', active: true },
    { id: '6', name: '6', active: true },
    { id: '7', name: '7', active: true },
    { id: '8', name: '8', active: true },
  ];

  const remaining = unusedTerritories(territories, [{ territory: '1, 4, 7' }]);
  assert.deepEqual(remaining, ['2', '3', '5', '6', '8']);

  // Un registro deshabilitado no cuenta como disponible.
  const withInactive = unusedTerritories(
    [...territories, { id: '9', name: '9', active: false }],
    [{ territory: '1, 4, 7' }],
  );
  assert(!withInactive.includes('9'));

  // Un registro puede guardar varios territorios separados por coma.
  const grouped = unusedTerritories([{ id: 'g', name: '1, 2, 3', active: true }], [{ territory: '2' }]);
  assert.deepEqual(grouped, ['1', '3']);
});

test('avisa los territorios que ya aparecen en otra salida del mismo mes', () => {
  const outings = [
    { id: 'a', territory: '1, 70' },
    { id: 'b', territory: '38' },
  ];

  assert.deepEqual(repeatedTerritories('70', outings), ['70']);
  assert.deepEqual(repeatedTerritories('1, 70, 69, 2', outings), ['1', '70']);
  assert.deepEqual(repeatedTerritories('5', outings), []);
  // Distingue mayúsculas, para no avisar por un territorio que no está.
  assert.deepEqual(repeatedTerritories('REVISITAS', outings), []);

  // Al editar una salida, la suya propia no cuenta como repetida.
  assert.deepEqual(repeatedTerritories('1, 70', outings, 'a'), []);
  assert.deepEqual(repeatedTerritories('1, 70', outings, 'b'), ['1', '70']);
});
