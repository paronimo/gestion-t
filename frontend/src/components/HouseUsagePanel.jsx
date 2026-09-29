import { useLongList } from './LongList.jsx';
import { unusedHouses, usedHouses } from '../../../shared/houses.js';

// Control mensual de casas y familias. No modifica nada: solo indica qué casas
// aparecen en las salidas del mes y cuáles quedan sin usar, respetando el grupo
// al que pertenece cada una. Es una herramienta interna: no va al PDF.
export default function HouseUsagePanel({ outings = [], houses = [] }) {
  const used = usedHouses(houses, outings);
  const remaining = unusedHouses(houses, outings);

  // Una sola búsqueda para ambas listas, como en el resto de paneles.
  const list = useLongList(remaining, ({ house }) => house.name);
  const usedList = useLongList(used, ({ house }) => house.name);

  const groupLabel = (group) => (group ? `Grupo ${group}` : 'General');

  return (
    <section className="house-usage" aria-labelledby="house-usage-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Control del mes</p>
          <h3 id="house-usage-title">Casas utilizadas / no utilizadas</h3>
        </div>
      </div>

      <p className="section-note">
        El lugar de encuentro se asigna a cada salida, sea una casa o una ubicación. Este resumen solo
        detecta qué casas ya aparecen en el cronograma; no modifica ninguna.
      </p>

      <section className="house-usage-group" aria-labelledby="houses-used-title">
        <h4 id="houses-used-title">
          Casas utilizadas <span className="territory-count">{used.length}</span>
        </h4>
        {used.length === 0
          ? <p className="empty-note">Todavía no hay casas asignadas este mes.</p>
          : (
            <div className="table-scroll">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th scope="col">Casa</th>
                    <th scope="col">Grupo</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Tipo de salida</th>
                    <th scope="col">Lugar de Encuentro</th>
                  </tr>
                </thead>
                <tbody>
                  {usedList.visible.map(({ house, group, outing }) => (
                    <tr key={`${house.id}-${outing.id}`}>
                      <th scope="row">{house.name}</th>
                      <td>{groupLabel(group)}</td>
                      <td>{outing.date}</td>
                      <td>{outing.type}</td>
                      <td>{outing.placeName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usedList.canShowMore && (
                <div className="list-actions">
                  <button className="text-button" type="button" onClick={usedList.showMore}>Mostrar más</button>
                </div>
              )}
            </div>
          )}
      </section>

      <section className="house-usage-group" aria-labelledby="houses-remaining-title">
        <h4 id="houses-remaining-title">
          Casas no utilizadas <span className="territory-count">{remaining.length}</span>
        </h4>
        {houses.length === 0
          ? <p className="empty-note">Todavía no hay casas registradas.</p>
          : remaining.length === 0
            ? <p className="empty-note">Ya se usaron todas las casas registradas este mes.</p>
            : (
              <>
                <label className="field list-search">
                  <span className="visually-hidden">Buscar casas no utilizadas</span>
                  <input
                    type="search"
                    value={list.query}
                    placeholder="Buscar..."
                    aria-label="Buscar casas no utilizadas"
                    onChange={(event) => list.setQuery(event.target.value)}
                  />
                </label>
                <ul className="territory-chips">
                  {list.visible.map(({ house, group }) => (
                    <li key={house.id} className="territory-chip chip-remaining">
                      {house.name} · {groupLabel(group)}
                    </li>
                  ))}
                </ul>
                {(list.canShowMore || list.canShowLess) && (
                  <div className="list-actions">
                    {list.canShowMore && <button className="text-button" type="button" onClick={list.showMore}>Mostrar más</button>}
                    {list.canShowLess && <button className="text-button" type="button" onClick={list.showLess}>Mostrar menos</button>}
                  </div>
                )}
              </>
            )}
      </section>
    </section>
  );
}
