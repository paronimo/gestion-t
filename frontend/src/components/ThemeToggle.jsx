import { useEffect, useState } from 'react';

// Tema claro/oscuro. Solo es presentación: no toca datos ni lógica.
// La preferencia se guarda en localStorage y se aplica en <html> para que el
// cambio se vea sin recargar y sin parpadeo.

const STORAGE_KEY = 'gestor-tema';
const MODES = ['claro', 'oscuro'];

function readStoredMode() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (MODES.includes(saved)) return saved;
  } catch {
    // Si el almacenamiento está bloqueado, se usa la preferencia del sistema.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

export default function ThemeToggle() {
  const [mode, setMode] = useState(readStoredMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Sin almacenamiento la preferencia solo dura esta sesión.
    }
  }, [mode]);

  const next = mode === 'claro' ? 'oscuro' : 'claro';
  const label = next === 'oscuro' ? '🌙 Modo oscuro' : '☀️ Modo claro';

  return (
    <button
      className="button button-quiet theme-toggle"
      type="button"
      onClick={() => setMode(next)}
      title={label}
      aria-label={label}
    >
      <span className="theme-toggle-text">{label}</span>
    </button>
  );
}
