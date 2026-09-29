import { useEffect, useRef } from 'react';

// Recuadro de edición. Es solo presentación: no guarda nada por sí mismo,
// el formulario que recibe decide qué hacer al enviar o al cancelar.
export default function Modal({ title, description, onClose, children, labelledBy = 'modal-title' }) {
  const box = useRef(null);

  useEffect(() => {
    // Escape cierra, y el foco entra al recuadro para poder escribir de inmediato.
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const first = box.current?.querySelector('input, select, button');
    first?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // Solo cierra si el clic empieza en el fondo, no dentro del recuadro.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={box}>
        <div className="modal-heading">
          <div>
            <h2 id={labelledBy}>{title}</h2>
            {description && <p className="modal-description">{description}</p>}
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
