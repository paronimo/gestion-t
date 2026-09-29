import { unusedTerritories, usedTerritories } from '../../../shared/territories.js';

// Control de territorios del mes. No asigna nada: solo muestra cuáles ya se
// usaron y cuáles quedan disponibles, comparando con el registro general.
// Esta información es solo de la pantalla: no forma parte del PDF.
export default function TerritoryUsagePanel({ outings = [], territories = [] }) {
  const used = usedTerritories(outings);
  const remaining = unusedTerritories(territories, outings);

  return (
    <section className="territory-usage" aria-labelledby="territory-usage-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Control del mes</p>
          <h3 id="territory-usage-title">Territorios del mes</h3>
        </div>
      </div>

      <p className="section-note">
        Los territorios se asignan a mano en cada salida. Este resumen solo indica cuáles ya se usaron
        y cuáles todavía no aparecen en el cronograma.
      </p>

      <div className="territory-usage-groups">
        <section className="territory-usage-group" aria-labelledby="territories-used-title">
          <h4 id="territories-used-title">
            Territorios utilizados <span className="territory-count">{used.length}</span>
          </h4>
          {used.length === 0
            ? <p className="empty-note">Todavía no hay territorios asignados este mes.</p>
            : (
              <ul className="territory-chips">
                {used.map((territory) => <li key={territory} className="territory-chip chip-used">{territory}</li>)}
              </ul>
            )}
        </section>

        <section className="territory-usage-group" aria-labelledby="territories-remaining-title">
          <h4 id="territories-remaining-title">
            Territorios activos no utilizados <span className="territory-count">{remaining.length}</span>
          </h4>
          {territories.length === 0
            ? <p className="empty-note">Todavía no hay territorios registrados.</p>
            : remaining.length === 0
              ? <p className="empty-note">Ya se usaron todos los territorios activos registrados.</p>
              : (
                <ul className="territory-chips">
                  {remaining.map((territory) => <li key={territory} className="territory-chip chip-remaining">{territory}</li>)}
                </ul>
              )}
        </section>
      </div>
    </section>
  );
}
