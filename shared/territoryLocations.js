// Relación manual entre una ubicación de encuentro y los territorios cercanos.
// No calcula distancias ni decide nada: solo permite configurar la lista de
// territorios de cada ubicación y detectar cuáles le sirven a una salida.

import { splitTerritories, territoryKey } from './territories.js';

export { splitTerritories, territoryKey };

// Normaliza la lista de territorios de una ubicación: sin repetidos, en el
// orden en que se escribieron. "1, 2, 1" -> ['1', '2'].
export function normalizeLocationTerritories(value) {
  const seen = new Set();
  const parts = [];
  for (const part of splitTerritories(value)) {
    const key = territoryKey(part);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  return parts;
}

// El texto que se guarda en la ubicación: "1, 2, 3".
export function locationTerritoriesText(location) {
  return normalizeLocationTerritories(location?.territories).join(', ');
}

// Las ubicaciones activas que sirven a alguno de los territorios de la salida.
// Devuelve, para cada coincidencia, qué territorio la trajo: así el mensaje
// puede decir "Territorio cercano: 4" y no solo el nombre.
export function suggestLocations(territoryText, locations = []) {
  const wanted = new Set(normalizeLocationTerritories(territoryText).map(territoryKey));
  if (wanted.size === 0) return [];

  const suggestions = [];
  for (const location of locations) {
    if (location.active === false) continue;
    const match = normalizeLocationTerritories(location.territories)
      .find((territory) => wanted.has(territoryKey(territory)));
    if (match) suggestions.push({ location, territory: match });
  }
  return suggestions;
}

// Un territorio puede tener más de una ubicación: se listan todas para que el
// usuario elija, sin elegir ninguna por él.
export function locationsOfTerritory(territory, locations = []) {
  const key = territoryKey(territory);
  return locations.filter((location) => (
    location.active !== false
    && normalizeLocationTerritories(location.territories).some((item) => territoryKey(item) === key)
  ));
}
