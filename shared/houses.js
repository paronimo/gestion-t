// Control mensual de casas y familias, similar al control de territorios.
// No asigna ni modifica nada: solo detecta qué casas aparecen en las salidas
// del mes. Al igual que con los territorios, no forma parte del PDF.

// El grupo de una casa se normaliza a su número: "Grupo 1" -> "1".
export function houseGroup(house) {
  return (house?.group || '').toString().trim().replace(/^grupo\s*/i, '').toLocaleLowerCase();
}

// El grupo de la salida: "Grupo 2" -> "2", "Congregacional" -> ''.
// Define para qué grupos la casa era elegible.
export function outingGroup(outing) {
  const match = /^grupo\s*(\d+)$/i.exec((outing?.type || '').trim());
  return match ? match[1] : '';
}

// Una casa solo es utilizable por los grupos que le corresponden: la suya, o
// cualquiera si es una casa general (sin grupo). Así una casa de Grupo 2 nunca
// se ofrece como disponible para Grupo 1, 3 o 4.
export function houseServesGroup(house, group) {
  const own = houseGroup(house);
  if (!own) return true;
  return own === (group || '').toString().trim().toLocaleLowerCase();
}

// Una casa utilizada en una salida de Grupo 2 es de Grupo 2: no se marca como
// disponible para los demás grupos.
export function usedHouseGroups(house, outings = []) {
  const used = outings.filter((outing) => outing.placeId === house.id);
  const groups = new Set(used.map((outing) => outingGroup(outing)).filter(Boolean));
  // Una casa general usada en una congregacional no pertenece a ningún grupo.
  if (groups.size === 0) return [''];
  return [...groups];
}

// Las casas que aparecen en al menos una salida del mes, con la salida que las usó.
export function usedHouses(houses = [], outings = []) {
  const used = [];
  for (const house of houses) {
    const outing = outings.find((item) => item.placeId === house.id);
    if (!outing) continue;
    used.push({
      house,
      // El grupo real de la casa manda: si no tiene grupo, la casa es general
      // y no se convierte en el grupo de la salida.
      group: houseGroup(house),
      outing,
    });
  }
  return used;
}

// Las casas que no aparecen en ninguna salida, agrupadas por grupo.
export function unusedHouses(houses = [], outings = []) {
  return houses
    .filter((house) => !outings.some((outing) => outing.placeId === house.id))
    .map((house) => ({ house, group: houseGroup(house) }));
}

// Las casas de un grupo concreto que todavía no se usaron en ese grupo.
// "General" agrupa las casas sin grupo.
export function unusedHousesOfGroup(houses = [], outings = [], group) {
  return unusedHouses(houses, outings).filter((item) => item.group === (group || '').toLocaleLowerCase());
}
