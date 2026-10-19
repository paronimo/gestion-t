// Generación de mensajes de consulta de disponibilidad.
//
// Esta capa NO conoce la interfaz ni el backend: recibe las salidas de un mes y
// devuelve, por cada casa, el texto del mensaje ya armado con las fechas y horas
// reales. Se puede reutilizar más adelante para enviar notificaciones (Android /
// Firebase Cloud Messaging) sin volver a escribir la lógica.

const WEEKDAYS = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
];

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// "2026-10-03" -> { day: 3, weekday: 'Sábado' }. Se evita Date para que la fecha
// no se corra de día por la zona horaria: los días se leen del propio texto.
export function dateParts(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!match) return null;
  const [, , month, day] = match;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(match[1]), Number(month) - 1, Number(day))).getUTCDay()];
  return { day: Number(day), month: Number(month), weekday };
}

// "10:00" -> "10:00 AM"; "15:30" -> "3:30 PM".
export function formatTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec((time || '').trim());
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

// "🟤 Sábado 27 a las 10:00 AM"
export function formatOutingLine(outing) {
  const parts = dateParts(outing?.date);
  const time = formatTime(outing?.time);
  const date = parts ? `${parts.weekday} ${parts.day}` : (outing?.date || '').trim();
  return time ? `🟤 ${date} a las ${time}` : `🟤 ${date}`;
}

// Todas las salidas del mes en las que esa casa es el punto de encuentro,
// ordenadas por fecha y hora (igual que en el cronograma).
export function houseOutings(house, outings = []) {
  return outings
    .filter((outing) => outing.placeId === house.id)
    .slice()
    .sort((first, second) => (
      (first.date || '').localeCompare(second.date || '')
      || (first.time || '').localeCompare(second.time || '')
    ));
}

// El mensaje completo: "¿Estaría disponible tu casa para esta fecha?" (una) o
// "...para estas fechas?" (varias), seguido de una línea por fecha real.
export function buildAvailabilityMessage(house, outings = []) {
  const dates = houseOutings(house, outings).map(formatOutingLine);
  if (dates.length === 0) return '';
  const question = dates.length === 1
    ? '¿Estaría disponible tu casa para esta fecha?'
    : '¿Estaría disponible tu casa para estas fechas?';
  return `${question}\n\n${dates.join('\n')}`;
}

// Lista de consultas del mes: una por casa con "Preguntar disponibilidad"
// activado. Solo aparecen las casas que efectivamente se usan ese mes; una casa
// marcada pero sin salidas no tiene nada que preguntar.
export function availabilityInquiries(houses = [], outings = [], { year, month } = {}) {
  return houses
    .filter((house) => house.askAvailability === true)
    .map((house) => {
      const dates = houseOutings(house, outings).map((outing) => ({
        outingId: outing.id,
        date: outing.date,
        time: outing.time,
        line: formatOutingLine(outing),
      }));
      return {
        houseId: house.id,
        houseName: house.name,
        dates,
        message: buildAvailabilityMessage(house, outings),
        confirmedAt: (house.availabilityConfirmed || {})[`${year}-${String(month).padStart(2, '0')}`] || null,
      };
    })
    .filter((inquiry) => inquiry.dates.length > 0);
}

export { WEEKDAYS, MONTHS };
