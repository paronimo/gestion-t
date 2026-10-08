import { backgroundFor, normalizeColor } from '../../../shared/colors.js';

function displayDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
    .format(new Date(year, month - 1, day));
}

export default function OutingsTable({ outings, onEdit, onDelete }) {
  if (outings.length === 0) {
    return <p className="empty-state">Este mes todavía no tiene salidas.</p>;
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Día</th><th>Hora</th><th>Tipo</th>
            <th>Lugar de Encuentro</th><th>Conductor</th><th>Territorio</th>
            <th><span className="visually-hidden">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {outings.map((outing) => {
            const color = normalizeColor(outing.color);
            const colorStyle = color ? { backgroundColor: backgroundFor(color) } : undefined;

            return (
              <tr key={outing.id} style={colorStyle}>
                <td className="date-cell" style={colorStyle}>{displayDate(outing.date)}</td>
                <td className="capitalize">{outing.weekday}</td>
                <td>{outing.time}</td>
                <td>{outing.type}</td>
                <td>
                  {outing.placeMapsUrl ? (
                    <a href={outing.placeMapsUrl} target="_blank" rel="noreferrer">{outing.placeName}</a>
                  ) : (
                    outing.placeName || '—'
                  )}
                </td>
                <td>{outing.driverName || outing.driver || 'Sin definir'}</td>
                <td>{outing.territory || 'Sin definir'}</td>
                <td className="row-actions">
                  <button className="text-button" type="button" onClick={() => onEdit(outing)}>Editar</button>
                  <button className="text-button text-button-danger" type="button" onClick={() => onDelete(outing)}>Eliminar</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}