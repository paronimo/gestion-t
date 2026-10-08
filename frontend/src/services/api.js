// Un fallo de red (backend apagado, proxy caído) llega como TypeError sin mensaje
// útil. Se traduce a un error entendible en lugar de "Failed to fetch".
export class ApiError extends Error {
  constructor(message, { status = 0, path = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisá que el backend esté iniciado.', { path });
  }

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new ApiError(result.error || 'No se pudo completar la solicitud', { status: response.status, path });
  }

  return response.status === 204 ? null : response.json();
}

// Aísla un pedido para que un endpoint caído no arrastre a los demás: la pantalla
// sigue mostrando lo que sí se pudo cargar y señala solo lo que faltó.
export async function loadPart(label, loader, fallback) {
  try {
    return { value: await loader(), error: null };
  } catch (error) {
    return { value: fallback, error: `${label}: ${error.message}` };
  }
}

function monthPath(year, month) {
  return `/api/months/${year}/${month}`;
}

export function getConfiguration(year, month) {
  return request(`${monthPath(year, month)}/configuration`);
}

export function saveConfiguration(year, month, configuration) {
  return request(`${monthPath(year, month)}/configuration`, {
    method: 'PUT',
    body: JSON.stringify({ configuration }),
  });
}

export function getOutings(year, month) {
  return request(`${monthPath(year, month)}/outings`);
}

export function createOuting(year, month, outing) {
  return request(`${monthPath(year, month)}/outings`, {
    method: 'POST',
    body: JSON.stringify(outing),
  });
}

export function updateOuting(year, month, id, outing) {
  return request(`${monthPath(year, month)}/outings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(outing),
  });
}

export function removeOuting(year, month, id) {
  return request(`${monthPath(year, month)}/outings/${id}`, { method: 'DELETE' });
}

export function getMonthlyDrivers(year, month) {
  return request(`${monthPath(year, month)}/drivers`);
}

export function getAvailableDrivers(year, month, { date, time, type, currentDriverId }) {
  const query = new URLSearchParams({ date, time, type, currentDriverId });
  return request(`${monthPath(year, month)}/drivers/available?${query}`);
}

export function createDriver(driver) {
  return request('/api/drivers', { method: 'POST', body: JSON.stringify(driver) });
}

export function getDrivers() {
  return request('/api/drivers');
}

export function updateDriver(id, driver) {
  return request(`/api/drivers/${id}`, { method: 'PUT', body: JSON.stringify(driver) });
}

export function removeDriver(id) {
  return request(`/api/drivers/${id}`, { method: 'DELETE' });
}

export function updateDriverAvailability(year, month, id, slots) {
  return request(`${monthPath(year, month)}/drivers/${id}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ slots }),
  });
}

export function getDriverRotations(year, month) {
  return request(`${monthPath(year, month)}/driver-rotations`);
}

export function saveDriverRotation(year, month, group, rotationType, driverIds) {
  return request(`${monthPath(year, month)}/driver-rotations`, {
    method: 'PUT',
    body: JSON.stringify({ group, rotationType, driverIds }),
  });
}

export function getMonthlyHouses(year, month) {
  return request(`${monthPath(year, month)}/houses`);
}

export function getAvailableHouses(year, month, { date, type, currentHouseId }) {
  const query = new URLSearchParams({ date, type, currentHouseId });
  return request(`${monthPath(year, month)}/houses/available?${query}`);
}

export function getHouses() {
  return request('/api/houses');
}

export function createHouseRecord(house) {
  return request('/api/houses', { method: 'POST', body: JSON.stringify(house) });
}

export function updateHouse(id, house) {
  return request(`/api/houses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(house),
  });
}

export function removeHouse(id) {
  return request(`/api/houses/${id}`, { method: 'DELETE' });
}

export function updateHouseAvailability(year, month, id, available) {
  return request(`${monthPath(year, month)}/houses/${id}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ available }),
  });
}

export function getHouseRotations(year, month) {
  return request(`${monthPath(year, month)}/house-rotations`);
}

export function saveHouseRotation(year, month, group, houseIds) {
  return request(`${monthPath(year, month)}/house-rotations`, {
    method: 'PUT',
    body: JSON.stringify({ group, houseIds }),
  });
}

// El PDF se baja como archivo, no como JSON: se usa como enlace directo.
export function schedulePdfUrl(year, month) {
  return `${monthPath(year, month)}/schedule.pdf`;
}

export function getMonthSummary(year, month) {
  return request(`${monthPath(year, month)}/summary`);
}

export function copyMonthConfiguration(sourceYear, sourceMonth, destinationYear, destinationMonth, options) {
  return request(`${monthPath(destinationYear, destinationMonth)}/copy-from/${sourceYear}/${sourceMonth}`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export function getOutingTypes() {
  return request('/api/outing-types');
}

export function createOutingType(name) {
  return request('/api/outing-types', { method: 'POST', body: JSON.stringify({ name }) });
}

export function updateOutingType(id, changes) {
  return request(`/api/outing-types/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
}

export function removeOutingType(id) {
  return request(`/api/outing-types/${id}`, { method: 'DELETE' });
}

export const deleteOutingType = removeOutingType;
export function getTerritories() {
  return request('/api/territories');
}

export function createTerritory(territory) {
  return request('/api/territories', { method: 'POST', body: JSON.stringify(territory) });
}

export function updateTerritory(id, territory) {
  return request(`/api/territories/${id}`, { method: 'PUT', body: JSON.stringify(territory) });
}

export function removeTerritory(id) {
  return request(`/api/territories/${id}`, { method: 'DELETE' });
}

// Ubicaciones con territorios cercanos: relación manual, sin cálculo de distancias.
export function getTerritoryLocations() {
  return request('/api/territory-locations');
}

export function createTerritoryLocation(location) {
  return request('/api/territory-locations', { method: 'POST', body: JSON.stringify(location) });
}

export function updateTerritoryLocation(id, location) {
  return request(`/api/territory-locations/${id}`, { method: 'PUT', body: JSON.stringify(location) });
}

export function removeTerritoryLocation(id) {
  return request(`/api/territory-locations/${id}`, { method: 'DELETE' });
}
