import { useState } from 'react';

// Listas largas: se muestran de a 5 y se agrupan con "Mostrar más".
// Al buscar se muestran todos los resultados que coincidan, sin límite,
// para que un resultado que está más abajo siempre se encuentre.
const STEP = 5;

export function useLongList(items, textOf, { step = STEP } = {}) {
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState(0);

  const term = query.trim().toLocaleLowerCase();
  const searching = term.length > 0;
  const matched = searching
    ? items.filter((item) => (textOf(item) || '').toLocaleLowerCase().includes(term))
    : items;
  // Buscando no se recorta: el usuario quiere ver todo lo que coincide.
  const visible = searching ? matched : matched.slice(0, step + extra);
  const hidden = matched.length - visible.length;

  return {
    query,
    setQuery,
    searching,
    visible,
    // "Mostrar menos" solo tiene sentido cuando seakn la lista con el botón.
    canShowLess: !searching && extra > 0,
    canShowMore: hidden > 0,
    showMore: () => setExtra((current) => current + step),
    showLess: () => setExtra(0),
    total: items.length,
    matches: matched.length,
  };
}

export function ListSearch({ list, label }) {
  return (
    <div className="list-controls">
      <label className="field list-search">
        <span className="visually-hidden">{label}</span>
        <input
          type="search"
          value={list.query}
          placeholder="Buscar..."
          aria-label={label}
          onChange={(event) => list.setQuery(event.target.value)}
        />
      </label>
      <div className="list-actions">
        {list.searching && (
          <span className="list-count">
            {list.matches} de {list.total}
          </span>
        )}
        {list.canShowMore && (
          <button className="text-button" type="button" onClick={list.showMore}>
            Mostrar más
          </button>
        )}
        {list.canShowLess && (
          <button className="text-button" type="button" onClick={list.showLess}>
            Mostrar menos
          </button>
        )}
      </div>
    </div>
  );
}
