// Colores del cronograma: reglas compartidas por el backend, el frontend y el PDF.
// El usuario solo elige un color; de ese color se derivan el texto, los bordes y
// cualquier matiz necesario para que la tabla siga siendo legible.

// Un color elegido por el usuario puede venir vacío, con espacios o escrito mal.
// Devuelve '#RRGGBB' o '' si no hay un color usable.
export function normalizeColor(value) {
  if (typeof value !== 'string') return '';
  const color = value.trim().toLowerCase();
  if (!color) return '';

  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  if (/^#([0-9a-f]{2}){3}$/.test(color)) return color;
  return '';
}

function channel(value) {
  const part = value.slice(0, 2);
  return Number.parseInt(part, 16) / 255;
}

// Luminancia relativa (WCAG): decide si el texto sobre el color va en oscuro o en claro.
export function isDarkColor(color) {
  const hex = normalizeColor(color);
  if (!hex) return true;
  const [red, green, blue] = [1, 3, 5].map((index) => channel(hex.slice(index, index + 2)));
  return (0.299 * red + 0.587 * green + 0.114 * blue) < 0.6;
}

export function textColorFor(color) {
  return isDarkColor(color) ? '#1F2933' : '#FFFFFF';
}

export function borderColorFor(color) {
  return isDarkColor(color) ? '#00000030' : '#FFFFFF66';
}

// Un color muy claro se mezcla con blanco para bajar la intensidad de las franjas,
// así conviven sin taparse unas con otras.
export function backgroundFor(color) {
  return softenColor(color, 0.35);
}

export function softenColor(color, amount = 0.45) {
  const hex = normalizeColor(color);
  if (!hex) return '';
  const mixed = [1, 3, 5].map((index) => {
    const value = Math.round(channel(hex.slice(index, index + 2)) * 255);
    return Math.round(value + (255 - value) * amount);
  });
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
