import assert from 'node:assert/strict';
import test from 'node:test';
import {
  houseGroup,
  houseIsAvailable,
  houseServesGroup,
  outingGroup,
  unusedAvailableHouses,
  unusedHouses,
  unusedHousesOfGroup,
  usedHouseGroups,
  usedHouses,
} from './houses.js';

const casas = {
  espinosa: { id: 'espinosa', name: 'Flia. Espinosa', group: '1' },
  suarez: { id: 'suarez', name: 'Flia. Suárez', group: '1' },
  perez: { id: 'perez', name: 'Flia. Pérez', group: '1' },
  camargo: { id: 'camargo', name: 'Flia. Camargo', group: '2' },
  gomez: { id: 'gomez', name: 'Flia. Gómez', group: '2' },
  general: { id: 'general', name: 'Flia. Sin grupo', group: '' },
};

const todas = Object.values(casas);

test('el grupo se normaliza sin importar cómo esté escrito', () => {
  assert.equal(houseGroup({ group: '1' }), '1');
  assert.equal(houseGroup({ group: 'Grupo 2' }), '2');
  assert.equal(houseGroup({ group: ' grupo 3 ' }), '3');
  assert.equal(houseGroup({ group: '' }), '');
  assert.equal(houseGroup({}), '');

  assert.equal(outingGroup({ type: 'Grupo 2' }), '2');
  assert.equal(outingGroup({ type: 'Congregacional' }), '');
});

test('una casa solo se ofrece a su propio grupo', () => {
  assert.equal(houseServesGroup(casas.camargo, '2'), true);
  assert.equal(houseServesGroup(casas.camargo, '1'), false);
  assert.equal(houseServesGroup(casas.camargo, '3'), false);
  assert.equal(houseServesGroup(casas.camargo, '4'), false);

  // Una casa general sirve para cualquier grupo y para las congregacionales.
  assert.equal(houseServesGroup(casas.general, '1'), true);
  assert.equal(houseServesGroup(casas.general, '5'), true);
  assert.equal(houseServesGroup(casas.general, ''), true);
});

test('lista las casas utilizadas con la salida que las usó', () => {
  const outings = [
    { id: 'o1', placeId: 'camargo', type: 'Grupo 2', date: '2026-09-01', placeName: 'Flia. Camargo' },
    { id: 'o2', placeId: 'espinosa', type: 'Grupo 1', date: '2026-09-02', placeName: 'Flia. Espinosa' },
  ];

  const used = usedHouses(todas, outings);
  assert.deepEqual(used.map((item) => item.house.id).sort(), ['camargo', 'espinosa']);
  const camargo = used.find((item) => item.house.id === 'camargo');
  assert.equal(camargo.group, '2');
  assert.equal(camargo.outing.id, 'o1');
  assert.equal(camargo.outing.date, '2026-09-01');
  assert.equal(camargo.outing.type, 'Grupo 2');

  assert.deepEqual(usedHouses(todas, []), []);
});

test('las casas no utilizadas conservan su grupo', () => {
  const outings = [
    { id: 'o1', placeId: 'camargo', type: 'Grupo 2', date: '2026-09-01' },
  ];

  const remaining = unusedHouses(todas, outings);
  const ids = remaining.map((item) => item.house.id).sort();
  assert.deepEqual(ids, ['espinosa', 'general', 'gomez', 'perez', 'suarez']);
  assert.equal(remaining.find((item) => item.house.id === 'gomez').group, '2');
  assert.equal(remaining.find((item) => item.house.id === 'general').group, '');
});

test('una casa de Grupo 2 no queda disponible para otros grupos', () => {
  const outings = [
    { id: 'o1', placeId: 'camargo', type: 'Grupo 2', date: '2026-09-01' },
  ];

  // Camargo ya se usó en Grupo 2: no aparece entre las no utilizadas de ningún grupo.
  assert.deepEqual(unusedHousesOfGroup(todas, outings, '2').map((item) => item.house.id), ['gomez']);
  assert(unusedHousesOfGroup(todas, outings, '1').every((item) => item.house.id !== 'camargo'));
  assert(unusedHousesOfGroup(todas, outings, '3').every((item) => item.house.id !== 'camargo'));
  assert(unusedHousesOfGroup(todas, outings, '4').every((item) => item.house.id !== 'camargo'));
  // General agrupa las casas sin grupo.
  assert.deepEqual(unusedHousesOfGroup(todas, outings, '').map((item) => item.house.id), ['general']);
});

test('el grupo de una casa utilizada viene de la casa, no de la salida', () => {
  // Una casa general usada en una salida de grupo no se vuelve del grupo.
  const used = usedHouses([casas.general], [
    { id: 'o1', placeId: 'general', type: 'Grupo 3', date: '2026-09-01' },
  ]);
  assert.equal(used[0].group, '', 'sigue siendo general');

  // Y una casa de grupo usada en congregacional conserva su grupo.
  const conGrupo = usedHouses([casas.camargo], [
    { id: 'o2', placeId: 'camargo', type: 'Congregacional', date: '2026-09-05' },
  ]);
  assert.equal(conGrupo[0].group, '2');
});

test('usedHouseGroups resume los grupos en que se usó una casa', () => {
  const outings = [
    { id: 'o1', placeId: 'general', type: 'Grupo 1', date: '2026-09-01' },
    { id: 'o2', placeId: 'general', type: 'Grupo 2', date: '2026-09-02' },
    { id: 'o3', placeId: 'camargo', type: 'Congregacional', date: '2026-09-03' },
  ];

  assert.deepEqual(usedHouseGroups(casas.general, outings), ['1', '2']);
  // Usada solo en congregacional: no pertenece a ningún grupo.
  assert.deepEqual(usedHouseGroups(casas.camargo, outings), ['']);
  assert.deepEqual(usedHouseGroups(casas.suarez, outings), ['']);
});

test('agregar o quitar una salida actualiza el listado', () => {
  const base = [{ id: 'o1', placeId: 'camargo', type: 'Grupo 2', date: '2026-09-01' }];
  assert.equal(usedHouses(todas, base).length, 1);

  // Se agrega una salida con otra casa.
  const conDos = [...base, { id: 'o2', placeId: 'gomez', type: 'Grupo 2', date: '2026-09-02' }];
  assert.equal(usedHouses(todas, conDos).length, 2);
  assert.equal(unusedHouses(todas, conDos).length, 4);

  // Se elimina.
  assert.equal(usedHouses(todas, [conDos[1]]).length, 1);

  // Se cambia el lugar de una salida: la casa anterior vuelve a estar libre.
  const cambiada = [{ id: 'o1', placeId: 'perez', type: 'Grupo 1', date: '2026-09-01' }];
  const usadas = usedHouses(todas, cambiada).map((item) => item.house.id);
  assert.deepEqual(usadas, ['perez']);
  assert(unusedHouses(todas, cambiada).some((item) => item.house.id === 'camargo'), 'Camargo vuelve a estar libre');
});

test('una casa no disponible este mes no aparece entre las no utilizadas', () => {
  const casasMes = [
    { id: 'a', name: 'Flia. A', group: '1', available: true },
    { id: 'b', name: 'Flia. B', group: '1', available: false },
    { id: 'c', name: 'Flia. C', group: '', available: true, active: false },
    { id: 'd', name: 'Flia. D', group: '', generalActive: false, available: true },
  ];

  const ids = unusedAvailableHouses(casasMes, []).map((item) => item.house.id);
  assert.deepEqual(ids.sort(), ['a']);
});

test('una casa deshabilitada o no disponible tampoco cuenta como utilizada', () => {
  const casasMes = [
    { id: 'a', name: 'Flia. A', group: '1', available: true },
    { id: 'b', name: 'Flia. B', group: '1', available: true },
    { id: 'c', name: 'Flia. C', group: '', available: false },
  ];
  // 'b' se usó y 'c' está no disponible: solo 'a' queda como disponible no usada.
  const outings = [{ id: 'o1', placeId: 'b', type: 'Grupo 1', date: '2026-09-01' }];
  const remaining = unusedAvailableHouses(casasMes, outings);
  assert.deepEqual(remaining.map((item) => item.house.id), ['a']);
  assert(remaining.every((item) => item.house.id !== 'c'), 'la no disponible no aparece');
});

test('houseIsAvailable resume el estado mensual de la casa', () => {
  assert.equal(houseIsAvailable({ available: true }), true);
  assert.equal(houseIsAvailable({}), true);
  assert.equal(houseIsAvailable({ available: false }), false);
  assert.equal(houseIsAvailable({ active: false }), false);
  assert.equal(houseIsAvailable({ generalActive: false }), false);
  assert.equal(houseIsAvailable(null), false);
});
