import PDFDocument from 'pdfkit';
import { backgroundFor, normalizeColor, textColorFor } from '../../shared/colors.js';

// Paleta fija: los colores se eligen por el nombre del tipo de salida, nunca al azar,
// para que dos exportaciones del mismo mes se vean iguales.
const CONGREGATIONAL = { background: '#DCE9F7', header: '#B8D0EA', text: '#1F3A57' };
const PALETTE = [
  { background: '#FBE3D6', header: '#F2C4A9', text: '#6B3410' },
  { background: '#DFF0DC', header: '#B8DDB2', text: '#2C5223' },
  { background: '#EADCF3', header: '#D2B8E4', text: '#4A2463' },
  { background: '#FDF0CE', header: '#F6DFA0', text: '#6B4E12' },
  { background: '#D6EAEE', header: '#AFD2DA', text: '#204B57' },
];
const NEUTRAL = { background: '#EDEDED', header: '#D6D6D6', text: '#3A3A3A' };

const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

const MARGIN = 36;
const ROW_HEIGHT = 18;
const FONT_SIZE = 8.5;

// La primera columna es la fecha: se combina verticalmente entre las salidas del mismo día.
const DATE_WIDTH = 64;
const COLUMNS = [
  { key: 'date', label: 'Fecha', width: DATE_WIDTH },
  { key: 'time', label: 'Hora', width: 40 },
  { key: 'type', label: 'Tipo', width: 84 },
  { key: 'place', label: 'Lugar de Encuentro', width: 100 },
  { key: 'driver', label: 'Conductor', width: 80 },
  { key: 'territory', label: 'Territorio', width: 130 },
];

const HEADER_HEIGHT = 20;
const CELL_PADDING = 6;
const BORDER_COLOR = '#B9B2A6';

function normalizeType(typeName) {
  return (typeName || '').trim();
}

// El color depende del tipo: congregacional siempre usa el mismo azul y los grupos
// siguen el orden en que se configuraron, de forma estable entre generaciones.
// El color de la salida manda; si no hay ninguno se usa la paleta por tipo,
// para que dos exportaciones del mismo mes se vean iguales.
export function paletteFor(outing) {
  const chosen = normalizeColor(outing?.color);
  if (chosen) {
    const background = backgroundFor(chosen);
    // El texto se decide sobre el fondo que realmente se dibuja, no sobre el color puro.
    return { background, text: textColorFor(background) };
  }
  return paletteForType(outing?.type);
}

function paletteForType(typeName) {
  const type = normalizeType(typeName);
  if (!type) return NEUTRAL;
  if (type.toLocaleLowerCase() === 'congregacional') return CONGREGATIONAL;

  const groupNumber = /^grupo\s*(\d+)$/i.exec(type);
  if (groupNumber) {
    const index = (Number(groupNumber[1]) - 1) % PALETTE.length;
    return PALETTE[index];
  }
  return NEUTRAL;
}

// "Martes 1": nombre del día + número, sin repetir el mes en cada celda.
function formatDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const name = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric' })
    .format(new Date(year, month - 1, day));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Agrupa por día para que la tabla respete la separación entre jornadas.
function groupByDay(outings) {
  const days = new Map();
  for (const outing of outings) {
    const key = `${outing.date}|${outing.weekday}`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(outing);
  }
  return [...days.values()];
}

export function buildSchedulePdf({ year, month, outings }) {
  const document = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const chunks = [];
  document.on('data', (chunk) => chunks.push(chunk));

  const monthName = new Intl.DateTimeFormat('es', { month: 'long' })
    .format(new Date(year, month - 1, 1));
  const monthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const pageWidth = document.page.width - MARGIN * 2;

  drawHeader(document, monthTitle, year, outings.length);

  const days = groupByDay(outings);
  const rowWidth = COLUMNS.reduce((total, column) => total + column.width, 0);

  if (days.length === 0) {
    document.moveDown(2);
    document.font(FONT).fontSize(10).fillColor('#666')
      .text('Este mes no tiene salidas programadas.', MARGIN, document.y, { width: pageWidth, align: 'center' });
  }

  drawColumnHeader(document, rowWidth);

  for (const dayOutings of days) {
    // El bloque del día se dibuja entero: así la celda de fecha combinada nunca se parte.
    ensureSpace(document, dayOutings.length * ROW_HEIGHT);
    if (document.y <= MARGIN + 60) drawColumnHeader(document, rowWidth);
    drawDayBlock(document, dayOutings, rowWidth);
  }

  document.end();

  return new Promise((resolve) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function drawHeader(document, monthTitle, year, total) {
  const pageWidth = document.page.width - MARGIN * 2;
  document.rect(MARGIN, MARGIN, pageWidth, 40).fill('#2F4858');
  document.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(15)
    .text('Cronograma de salidas', MARGIN + 12, MARGIN + 9, { width: pageWidth - 24 });
  document.font(FONT).fontSize(10)
    .text(`${monthTitle} ${year} · ${total} ${total === 1 ? 'salida' : 'salidas'}`, MARGIN + 12, MARGIN + 27, { width: pageWidth - 24 });
  document.y = MARGIN + 52;
}

// Recorta el texto para que nunca desborde la celda ni se parta en dos líneas.
function fitText(document, text, maxWidth) {
  if (document.widthOfString(text) <= maxWidth) return text;
  const ellipsis = '…';
  let cut = text;
  while (cut.length > 1 && document.widthOfString(cut + ellipsis) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut.trimEnd() + ellipsis;
}

// Encabezados de columna: se repiten en cada página nueva, con borde y centrado total.
function drawColumnHeader(document, rowWidth) {
  const top = document.y;
  document.rect(MARGIN, top, rowWidth, HEADER_HEIGHT).fill('#DAD5CB');
  let x = MARGIN;
  for (const column of COLUMNS) {
    document.font(FONT_BOLD).fontSize(8.5);
    const shown = fitText(document, column.label, column.width - CELL_PADDING * 2);
    document.fillColor('#33302A')
      .text(shown, x + CELL_PADDING, top + (HEADER_HEIGHT - 10) / 2, {
        width: column.width - CELL_PADDING * 2, align: 'center', lineBreak: false,
      });
    x += column.width;
  }
  drawBorders(document, top, HEADER_HEIGHT, rowWidth, { rowLines: false });
  document.y = top + HEADER_HEIGHT;
}

// Dibuja la retícula. rowLines permite omitir las líneas horizontales internas,
// que es justo lo que necesita la celda de fecha combinada.
function drawBorders(document, top, height, rowWidth, { rowLines = true, rowCount = 1 } = {}) {
  document.lineWidth(0.5).strokeColor(BORDER_COLOR);
  const bottom = top + height;

  document.moveTo(MARGIN, top).lineTo(MARGIN + rowWidth, top).stroke();
  document.moveTo(MARGIN, bottom).lineTo(MARGIN + rowWidth, bottom).stroke();

  if (rowLines && rowCount > 1) {
    for (let index = 1; index < rowCount; index += 1) {
      const y = top + index * ROW_HEIGHT;
      // La línea arranca después de la columna de fecha: esa celda es una sola.
      document.moveTo(MARGIN + DATE_WIDTH, y).lineTo(MARGIN + rowWidth, y).stroke();
    }
  }

  let x = MARGIN;
  for (const column of COLUMNS) {
    document.moveTo(x, top).lineTo(x, bottom).stroke();
    x += column.width;
  }
  document.moveTo(MARGIN + rowWidth, top).lineTo(MARGIN + rowWidth, bottom).stroke();
}

// Un día completo: celda de fecha combinada + una fila independiente por salida.
function drawDayBlock(document, dayOutings, rowWidth) {
  const top = document.y;
  const height = dayOutings.length * ROW_HEIGHT;

  // Franja de color por tipo: distingue de un vistazo sin repetir el texto.
  for (const [index, outing] of dayOutings.entries()) {
    document.rect(MARGIN, top + index * ROW_HEIGHT, rowWidth, ROW_HEIGHT)
      .fill(paletteFor(outing).background);
  }

  // Cuando un día mezcla varios colores, la celda de fecha usa un fondo neutro:
  // así sigue siendo una sola celda legible y no se repite el nombre del día.
  const dayColors = [...new Set(dayOutings.map((outing) => paletteFor(outing).background))];
  const dateBackground = dayColors.length === 1 ? dayColors[0] : '#F4F2EE';

  // La fecha se escribe una sola vez, centrada vertical y horizontalmente.
  document.rect(MARGIN, top, DATE_WIDTH, height).fill(dateBackground);
  document.font(FONT_BOLD).fontSize(9);
  const dateText = fitText(document, formatDate(dayOutings[0].date), DATE_WIDTH - CELL_PADDING * 2);
  document.fillColor('#3A3226')
    .text(dateText, MARGIN + CELL_PADDING, top + (height - 11) / 2, {
      width: DATE_WIDTH - CELL_PADDING * 2, align: 'center', lineBreak: false,
    });

  // Cada salida sigue siendo su propia fila; solo la fecha se combina.
  let x = MARGIN + DATE_WIDTH;
  for (const column of COLUMNS.slice(1)) {
    for (const [index, outing] of dayOutings.entries()) {
      const colors = paletteFor(outing);
      const rowTop = top + index * ROW_HEIGHT;
      const maxWidth = column.width - CELL_PADDING * 2;
      const isPlace = column.key === 'place';
      const value = isPlace
        ? (outing.placeName || '—')
        : ({
          time: outing.time,
          type: normalizeType(outing.type) || '—',
          driver: outing.driverName || outing.driver || 'Sin definir',
          territory: outing.territory || 'Sin definir',
        })[column.key];
      document.font(column.key === 'type' ? FONT_BOLD : FONT).fontSize(FONT_SIZE);
      const shown = fitText(document, value, maxWidth);
      const y = rowTop + (ROW_HEIGHT - 10) / 2;
      document.fillColor(colors.text);

      if (isPlace && outing.placeMapsUrl) {
        // El lugar se muestra como texto; la URL solo queda detrás del enlace.
        // Siempre subrayado: deja claro que es clicable aunque el texto se recorte.
        document.text(shown, x + CELL_PADDING, y, {
          width: maxWidth, align: 'center', link: outing.placeMapsUrl, underline: true, lineBreak: false,
        });
      } else {
        document.text(shown, x + CELL_PADDING, y, { width: maxWidth, align: 'center', lineBreak: false });
      }
    }
    x += column.width;
  }

  drawBorders(document, top, height, rowWidth, { rowLines: true, rowCount: dayOutings.length });
  document.y = top + height;
}

function ensureSpace(document, needed) {
  const bottomLimit = document.page.height - MARGIN - 12;
  if (document.y + needed > bottomLimit) document.addPage();
}
