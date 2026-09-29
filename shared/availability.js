// Reglas de disponibilidad compartidas por el backend y el frontend.
// La definición de "mañana" y "tarde" vive aquí para que ambos coincidan siempre.
// Rango de la mañana: 06:00 a 12:00 inclusive. Rango de la tarde: 13:00 a 21:00 inclusive.
export const MORNING_STARTS_AT_HOUR = 6;
export const MORNING_ENDS_AT_HOUR = 12;
export const AFTERNOON_STARTS_AT_HOUR = 13;
export const AFTERNOON_ENDS_AT_HOUR = 21;

export const TURNS = ['morning', 'afternoon'];

export const TURN_LABELS = { morning: 'mañana', afternoon: 'tarde' };

// Turnos que se ofrecen en la grilla, en el orden en que se muestran.
export const CONFIGURABLE_WEEKDAYS = [
  { weekday: 1, label: 'Lunes', short: 'Lun' },
  { weekday: 2, label: 'Martes', short: 'Mar' },
  { weekday: 3, label: 'Miércoles', short: 'Mié' },
  { weekday: 4, label: 'Jueves', short: 'Jue' },
  { weekday: 5, label: 'Viernes', short: 'Vie' },
  { weekday: 6, label: 'Sábado', short: 'Sáb' },
  { weekday: 0, label: 'Domingo', short: 'Dom' },
];

export const WEEKDAYS = CONFIGURABLE_WEEKDAYS.map((day) => day.label);

// Minutos desde medianoche, para comparar contra los límites con exactitud:
// a las 12:00 ya terminó la mañana, pero a las 12:30 sigue sin ser tarde.
function minutesOfDay(time) {
  const text = String(time || '');
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

// Función centralizada: la hora de la salida decide el turno.
// Devuelve null cuando la hora está fuera de ambos rangos (por ejemplo 12:30
// o las 22:00): no se asume turno, la salida queda sin conductor automático
// y la interfaz avisa en vez de elegir por el usuario.
export function turnOfTime(time) {
  const minutes = minutesOfDay(time);
  if (minutes === null) return null;
  if (minutes >= MORNING_STARTS_AT_HOUR * 60 && minutes <= MORNING_ENDS_AT_HOUR * 60) return 'morning';
  if (minutes >= AFTERNOON_STARTS_AT_HOUR * 60 && minutes <= AFTERNOON_ENDS_AT_HOUR * 60) return 'afternoon';
  return null;
}

// Explicación lista para mostrar cuando una hora no cae en ningún turno.
export function turnRangeNote() {
  return '06:00 a 12:00 · 13:00 a 21:00';
}

// Un horario válido y con turno asignado: así la interfaz puede avisar al guardar.
export function isTimeInTurnRange(time) {
  return turnOfTime(time) !== null;
}

export function slotKey(weekday, turn) {
  return `${weekday}:${turn}`;
}

export function isValidSlotKey(key) {
  const [weekday, turn] = String(key).split(':');
  return TURNS.includes(turn) && CONFIGURABLE_WEEKDAYS.some((day) => day.weekday === Number(weekday));
}
