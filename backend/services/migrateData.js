// Migra los datos existentes al modelo actual:
//   - un solo campo "type" que ya no se acompaña de "group";
//   - "meetingPlace" + "houseId" pasan a un único "placeId" (casa o ubicación);
//   - la disponibilidad por días de precursores pasa a disponibilidad por día y turno.
//
// Es idempotente: volver a aplicarla sobre datos ya migrados no cambia nada.

import { isGroupType, slotKey, turnOfTime } from './domain.js';

function typeFromLegacy(outing) {
  const type = (outing.type || '').trim();
  const group = (outing.group || '').trim();
  if (!group || isGroupType(type)) return type;
  if (/^congregacional\b/i.test(type)) return type;
  return group.startsWith('grupo') ? group : `Grupo ${group}`;
}

function placeFromLegacy(outing, houses) {
  if (outing.placeId) {
    return { placeId: outing.placeId, placeType: outing.placeType || 'house' };
  }
  if (outing.houseId && houses.has(outing.houseId)) {
    return { placeId: outing.houseId, placeType: 'house' };
  }
  const text = (outing.meetingPlace || '').trim();
  if (!text) {
    return { placeId: null, placeType: 'location' };
  }
  const existing = [...houses.values()].find((house) => house.name === text);
  if (existing) {
    return { placeId: existing.id, placeType: 'house' };
  }
  return {
    placeId: `legacy:${text.toLocaleLowerCase()}`,
    placeType: 'location',
    legacyText: text,
  };
}

function slotsFromLegacy(availability, time) {
  const slots = {};
  if (!availability) return slots;
  if (availability.slots && typeof availability.slots === 'object') {
    return { ...availability.slots };
  }
  for (const weekday of availability.weekdays || []) {
    slots[slotKey(weekday, turnOfTime(time || '09:00'))] = true;
  }
  return slots;
}

export function migrateData(data) {
  const months = data.months || {};
  const houses = new Map((data.houses || []).map((house) => [house.id, house]));
  const locations = new Map((data.locations || []).map((location) => [location.id, location]));

  let needsLocations = !Array.isArray(data.locations);

  for (const outing of Object.values(months).flatMap((month) => month.outings || [])) {
    const place = placeFromLegacy(outing, houses);
    if (place.placeId && place.legacyText && !locations.has(place.placeId)) {
      locations.set(place.placeId, {
        id: place.placeId,
        name: place.legacyText,
        address: '',
        mapsUrl: '',
        active: true,
      });
      needsLocations = true;
    }
  }

  for (const month of Object.values(months)) {
    for (const outing of month.outings || []) {
      const place = placeFromLegacy(outing, houses);
      Object.assign(outing, {
        type: typeFromLegacy(outing),
        placeId: place.placeId,
        placeType: place.placeType,
        territory: outing.territory || '',
      });
      delete outing.group;
      delete outing.houseId;
      delete outing.meetingPlace;
    }

    for (const rule of month.configuration || []) {
      rule.type = typeFromLegacy(rule);
      delete rule.group;
    }

    for (const [driverId, availability] of Object.entries(month.driverAvailability || {})) {
      month.driverAvailability[driverId] = { slots: slotsFromLegacy(availability) };
    }
  }

  if (needsLocations) {
    data.locations = [...locations.values()];
  }

  return data;
}
