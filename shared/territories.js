// Los territorios siguen siendo manuales: la salida lleva un texto y el sistema
// solo lo interpreta para poder controlarlo. Un territorio es cada parte entre
// comas: "1, 70, 69, 2" son cuatro.

// Divide un texto de territorio en sus partes, sin repeticiones y sin depender
// de mayúsculas: " 1 , 70 " -> ['1', '70'].
export function splitTerritories(value) {
  const seen = new Set();
  const parts = [];
  for (const raw of (value || '').split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const key = part.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  return parts;
}

export function territoryKey(value) {
  return value.trim().toLocaleLowerCase();
}

// Todos los territorios que aparecen en las salidas dadas, sin duplicados.
export function usedTerritories(outings = []) {
  const seen = new Set();
  const used = [];
  for (const outing of outings) {
    for (const part of splitTerritories(outing.territory)) {
      const key = territoryKey(part);
      if (seen.has(key)) continue;
      seen.add(key);
      used.push(part);
    }
  }
  return used;
}

// Los territorios activos del registro que todavía no aparecen en el mes.
export function unusedTerritories(territories = [], outings = []) {
  const used = new Set(usedTerritories(outings).map(territoryKey));
  return territories
    .filter((territory) => territory.active !== false)
    .flatMap((territory) => splitTerritories(territory.name))
    .filter((part) => !used.has(territoryKey(part)));
}

// Los territorios que la salida en edición ya usa y que aparecen en OTRA salida
// del mismo mes. Solo es una advertencia: nunca impide guardar.
export function repeatedTerritories(territoryText, outings = [], currentOutingId = null) {
  const wanted = splitTerritories(territoryText).map(territoryKey);
  const seen = new Set();
  for (const outing of outings) {
    if (outing.id === currentOutingId) continue;
    for (const part of splitTerritories(outing.territory)) seen.add(territoryKey(part));
  }
  // Se devuelven tal como los escribió el usuario, no normalizados.
  const own = new Set();
  return splitTerritories(territoryText).filter((part) => {
    const key = territoryKey(part);
    if (!seen.has(key) || own.has(key)) return false;
    own.add(key);
    return true;
  });
}
