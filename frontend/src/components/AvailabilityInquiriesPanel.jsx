import { useState } from 'react';
import { ListSearch, useLongList } from './LongList.jsx';

// Copia el texto exacto del mensaje. Usa la API del portapapeles y, si el
// navegador no la permite (por ejemplo sin HTTPS), cae al método clásico.
async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

// Consulta de disponibilidad de una casa: muestra el mensaje generado y las
// acciones ✅ (confirmar) y ❌ (quitar la casa como punto de encuentro).
function InquiryCard({ inquiry, saving, onCopied, onConfirm, onReject }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  async function copy() {
    setCopyError('');
    try {
      await copyToClipboard(inquiry.message);
      setCopied(true);
      onCopied?.(inquiry);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError('No se pudo copiar. Seleccioná el texto y copialo a mano.');
    }
  }

  const confirmed = Boolean(inquiry.confirmedAt);
  const dateCount = inquiry.dates.length;

  return (
    <article className="house-row admin-card availability-card">
      <div className="house-details">
        <strong>{inquiry.houseName}</strong>
        <span>
          {dateCount === 1 ? 'Aparece 1 vez este mes como punto de encuentro' : `Aparece ${dateCount} veces este mes como punto de encuentro`}
        </span>
        <span className={confirmed ? 'availability-enabled' : 'availability-disabled'}>
          {confirmed
            ? `Disponibilidad confirmada (${new Date(inquiry.confirmedAt).toLocaleDateString('es')})`
            : 'Pendiente de confirmar'}
        </span>
      </div>

      <ul className="availability-dates" aria-label={`Fechas de ${inquiry.houseName}`}>
        {inquiry.dates.map((date) => (
          <li key={date.outingId}>{date.line}</li>
        ))}
      </ul>

      <pre className="availability-message" aria-label={`Mensaje para ${inquiry.houseName}`}>{inquiry.message}</pre>

      {copyError && <p className="driver-warning" role="status">{copyError}</p>}

      <div className="house-actions availability-actions">
        <button className="button button-quiet" type="button" onClick={copy}>Copiar mensaje</button>
        <button
          className="button button-primary"
          type="button"
          disabled={saving}
          title="Confirmar disponibilidad (las salidas no cambian)"
          onClick={() => onConfirm(inquiry)}
        >
          ✅ Confirmar
        </button>
        <button
          className="button button-remove"
          type="button"
          disabled={saving}
          title="Quitar la casa como punto de encuentro de estas salidas"
          onClick={() => onReject(inquiry)}
        >
          ❌ Rechazar
        </button>
      </div>
      {copied && <p className="status-message availability-copied" role="status">Mensaje copiado.</p>}
    </article>
  );
}

export default function AvailabilityInquiriesPanel({ inquiries = [], monthLabel, onCopied, onConfirm, onReject, loading, saving }) {
  const list = useLongList(inquiries, (inquiry) => inquiry.houseName);

  return (
    <section className="availability-panel" aria-labelledby="availability-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Casas con "Preguntar disponibilidad"</p>
          <h3 id="availability-title">Disponibilidad de casas</h3>
        </div>
        {monthLabel && <span className="availability-month">{monthLabel}</span>}
      </div>

      <p className="section-note">
        Cada casa con "Preguntar disponibilidad" activado aparece aquí con las fechas reales en que se usa como
        punto de encuentro. Copiá el mensaje, o confirmá / rechazá la disponibilidad. Nada se envía automáticamente.
      </p>

      {loading ? <p className="empty-state">Cargando las consultas del mes…</p> : inquiries.length === 0 ? (
        <p className="empty-note">
          No hay consultas para este mes. Marcá "Preguntar disponibilidad" al crear o editar una casa en Administración,
          y esa casa aparecerá aquí cuando tenga salidas asignadas.
        </p>
      ) : (
        <>
          <ListSearch list={list} label="Buscar casas con consulta" />
          {list.matches === 0 ? <p className="empty-note">Ninguna casa coincide con la búsqueda.</p> : (
            <div className="house-list availability-list">
              {list.visible.map((inquiry) => (
                <InquiryCard
                  key={inquiry.houseId}
                  inquiry={inquiry}
                  saving={saving}
                  onCopied={onCopied}
                  onConfirm={onConfirm}
                  onReject={onReject}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
