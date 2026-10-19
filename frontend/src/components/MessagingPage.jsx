import { useState } from 'react';
import AvailabilityInquiriesPanel from './AvailabilityInquiriesPanel.jsx';

// Mensajería: por ahora solo la consulta de disponibilidad de casas. Los mensajes
// se generan para copiar y pegar a mano; el envío automático no está implementado.
export default function MessagingPage({
  inquiries,
  year,
  month,
  monthLabel,
  onCopied,
  onConfirm,
  onReject,
  loading,
  saving,
}) {
  const [section] = useState('availability');

  return (
    <main className="messaging-page">
      <div className="section-heading administration-heading">
        <div>
          <p className="eyebrow">Mensajes para copiar y pegar</p>
          <h2>Mensajería</h2>
        </div>
      </div>

      <nav className="messaging-tabs" aria-label="Subsecciones de Mensajería">
        <button
          className={section === 'availability' ? 'view-tab selected' : 'view-tab'}
          type="button"
          aria-current={section === 'availability' ? 'page' : undefined}
        >
          Disponibilidad de casas
        </button>
      </nav>

      <AvailabilityInquiriesPanel
        inquiries={inquiries}
        monthLabel={monthLabel}
        year={year}
        month={month}
        onCopied={onCopied}
        onConfirm={onConfirm}
        onReject={onReject}
        loading={loading}
        saving={saving}
      />
    </main>
  );
}
