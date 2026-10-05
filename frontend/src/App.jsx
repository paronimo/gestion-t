import { useEffect, useMemo, useState } from 'react';
import AdministrationPage from './components/AdministrationPage.jsx';
import { groupIdsFromTypes } from './components/OutingTypesPanel.jsx';
import MonthlyConfiguration from './components/MonthlyConfiguration.jsx';
import OutingForm from './components/OutingForm.jsx';
import OutingsTable from './components/OutingsTable.jsx';
import TerritoryUsagePanel from './components/TerritoryUsagePanel.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { probarFirebase } from "./probarFirebase";
import {
  createDriver,
  createHouseRecord,
  createOuting,
  createTerritory,
  createTerritoryLocation,
  updateTerritoryLocation,
  removeTerritoryLocation,
  createLocation,
  createOutingType,
  copyMonthConfiguration,
  deleteOutingType,
  getConfiguration,
  getDriverRotations,
  getDrivers,
  getHouses,
  getLocations,
  getMonthlyDrivers,
  getMonthlyHouses,
  getMonthlyLocations,
  getHouseRotations,
  getOutings,
  getOutingTypes,
  getTerritories,
  getTerritoryLocations,
  removeOuting,
  removeDriver,
  removeHouse,
  removeLocation,
  removeTerritory,
  saveConfiguration,
  saveDriverRotation,
  saveHouseRotation,
  loadPart,
  schedulePdfUrl,
  updateDriver,
  updateDriverAvailability,
  updateHouse,
  updateHouseAvailability,
  updateLocation,
  updateLocationAvailability,
  updateOuting,
  updateOutingType,
  updateTerritory,
} from './services/api.js';

const months = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function App() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [yearInput, setYearInput] = useState(String(today.getFullYear()));
  const [configuration, setConfiguration] = useState([]);
  const [outings, setOutings] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverRotations, setDriverRotations] = useState({ elders: {}, groupConductors: {} });
  const [houses, setHouses] = useState([]);
  const [houseRotations, setHouseRotations] = useState({});
  const [registeredDrivers, setRegisteredDrivers] = useState([]);
  const [registeredHouses, setRegisteredHouses] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [territoryLocations, setTerritoryLocations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [types, setTypes] = useState([]);
  const [monthlyLocations, setMonthlyLocations] = useState([]);
  const [view, setView] = useState('schedule');
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const monthLabel = `${months[month - 1]} ${year}`;
  const monthId = `${year}-${String(month).padStart(2, '0')}`;
  const groups = useMemo(() => groupIdsFromTypes(types), [types]);
  // Avisos de carga: cada fuente falla por separado, sin vaciar las demás.
  const [loadIssues, setLoadIssues] = useState([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage('');
    setLoadIssues([]);
    setEditor(null);

    (async () => {
    // Cada fuente se carga por separado. Antes, un solo endpoint caído (por ejemplo
    // el de territorios) rechazaba el Promise.all completo y dejaba Tipo, Conductor,
    // Lugar y Territorio vacíos aunque el resto hubiera cargado bien.
    const parts = await Promise.all([
      loadPart('Configuración', () => getConfiguration(year, month), []),
      loadPart('Salidas', () => getOutings(year, month), []),
      loadPart('Conductores del mes', () => getMonthlyDrivers(year, month), []),
      loadPart('Rotación de conductores', () => getDriverRotations(year, month), { elders: {}, groupConductors: {} }),
      loadPart('Casas del mes', () => getMonthlyHouses(year, month), []),
      loadPart('Rotación de casas', () => getHouseRotations(year, month), {}),
      loadPart('Registro de conductores', getDrivers, []),
      loadPart('Registro de casas', getHouses, []),
      loadPart('Territorios', getTerritories, []),
      loadPart('Ubicaciones', getLocations, []),
      loadPart('Ubicaciones por territorio', getTerritoryLocations, []),
      loadPart('Tipos de salida', getOutingTypes, []),
      loadPart('Ubicaciones del mes', () => getMonthlyLocations(year, month), []),
    ]);
    if (!active) return;

    const [savedConfiguration, savedOutings, savedDrivers, savedDriverRotations, savedHouses, savedRotations, allDrivers, allHouses, allTerritories, allLocations, savedTerritoryLocations, allTypes, monthLocations] = parts.map((part) => part.value);

    setConfiguration(savedConfiguration);
    setOutings(savedOutings);
    setDrivers(savedDrivers);
    setDriverRotations(savedDriverRotations);
    setHouses(savedHouses);
    setHouseRotations(savedRotations);
    setRegisteredDrivers(allDrivers);
    setRegisteredHouses(allHouses);
    setTerritories(allTerritories);
    setLocations(allLocations);
    setTerritoryLocations(savedTerritoryLocations);
    setTypes(allTypes);
    setMonthlyLocations(monthLocations);

    const issues = parts.map((part) => part.error).filter(Boolean);
    setLoadIssues(issues);
    setMessage(issues.length === 1 ? issues[0] : issues.length > 1 ? `${issues.length} secciones no se pudieron cargar: ${issues.join(' · ')}` : '');
    setLoading(false);
    })();

    return () => { active = false; };
  }, [year, month]);

  async function runFirebaseTest() {
    setMessage('Probando la conexión con Firebase…');
    await probarFirebase();
    setMessage('Prueba de Firebase finalizada. Revisa la consola del navegador para ver el detalle.');
  }

  async function generateMonth() {
    setSaving(true);
    setMessage('');
    try {
      await saveConfiguration(year, month, configuration);
      // Se vuelve a consultar la lista para traer los nombres de conductor y lugar,
      // que la configuración no incluye.
      setOutings(await getOutings(year, month));
      setMessage('Se actualizaron las salidas recurrentes del mes.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveOuting(values) {
    setSaving(true);
    setMessage('');
    try {
      if (editor.kind === 'edit') {
        await updateOuting(year, month, editor.outing.id, values);
      } else {
        await createOuting(year, month, values);
      }
      setOutings(await getOutings(year, month));
      setEditor(null);
      setMessage('La salida se guardó correctamente.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOuting(outing) {
    if (!window.confirm(`¿Eliminar la salida del ${outing.date}?`)) return;

    setMessage('');
    try {
      await removeOuting(year, month, outing.id);
      setOutings((current) => current.filter((item) => item.id !== outing.id));
      setMessage('La salida se eliminó.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveMonthlyConfiguration(rules) {
    setSaving(true);
    setMessage('');
    try {
      const result = await saveConfiguration(year, month, rules);
      setConfiguration(result.configuration);
      setOutings(await getOutings(year, month));
      setShowConfiguration(false);
      setMessage('Se guardó la configuración y se generaron las salidas recurrentes.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDriver(values, id) {
    setSaving(true);
    setMessage('');
    try {
      if (id) {
        await updateDriver(id, values);
      } else {
        await createDriver(values);
      }
      const [monthly, registry] = await Promise.all([getMonthlyDrivers(year, month), getDrivers()]);
      setDrivers(monthly);
      setRegisteredDrivers(registry);
      setMessage('Se guardaron los datos del conductor en el registro general.');
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeDriverAvailability(driver, slots) {
    setSaving(true);
    setMessage('');
    try {
      await updateDriverAvailability(year, month, driver.id, slots);
      setDrivers(await getMonthlyDrivers(year, month));
      const assignedCount = outings.filter((outing) => outing.driverId === driver.id).length;
      setMessage(Object.keys(slots).length === 0 && assignedCount > 0
        ? `Se quitaron los turnos. Conserva ${assignedCount} asignación(es) existente(s); revísalas manualmente.`
        : 'Se actualizaron los turnos de este mes.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeDriverRotation(group, rotationType, driverIds) {
    setSaving(true);
    setMessage('');
    try {
      setDriverRotations(await saveDriverRotation(year, month, group, rotationType, driverIds));
      setMessage(`Se guardó la rotación del Grupo ${group}. Genera nuevamente las salidas para aplicarla.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveHouse(values, id) {
    setSaving(true);
    setMessage('');
    try {
      if (id) {
        await updateHouse(id, values);
      } else {
        await createHouseRecord(values);
      }
      const [monthly, registry] = await Promise.all([getMonthlyHouses(year, month), getHouses()]);
      setHouses(monthly);
      setRegisteredHouses(registry);
      setMessage(id ? 'Se actualizaron los datos de la casa.' : 'La casa se agregó al registro general. Configura sus meses disponibles en la vista mensual.');
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeHouseAvailability(house, available) {
    setSaving(true);
    setMessage('');
    try {
      await updateHouseAvailability(year, month, house.id, available);
      setHouses(await getMonthlyHouses(year, month));
      const assignedCount = outings.filter((outing) => outing.houseId === house.id).length;
      setMessage(!available && assignedCount > 0
        ? `La casa se quitó de las nuevas opciones. Conserva ${assignedCount} asignación(es) existente(s); revísalas manualmente.`
        : available ? 'La casa volvió a estar disponible este mes.' : 'La casa se quitó de las opciones de este mes.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeHouseRotation(group, houseIds) {
    setSaving(true);
    setMessage('');
    try {
      setHouseRotations(await saveHouseRotation(year, month, group, houseIds));
      setMessage(`Se guardó el orden de casas del Grupo ${group}. Genera nuevamente las salidas para aplicar la rotación.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeDriverGeneralStatus(driver, active) {
    setSaving(true);
    setMessage('');
    try {
      await updateDriver(driver.id, { ...driver, active });
      const [registry, monthly] = await Promise.all([getDrivers(), getMonthlyDrivers(year, month)]);
      setRegisteredDrivers(registry);
      setDrivers(monthly);
      setMessage(!active && driver.assignedCount > 0
        ? `Conductor deshabilitado. Conserva ${driver.assignedCount} asignación(es) histórica(s).`
        : `Conductor ${active ? 'habilitado' : 'deshabilitado'} en el registro general.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeHouseGeneralStatus(house, active) {
    setSaving(true);
    setMessage('');
    try {
      await updateHouse(house.id, { ...house, active });
      const [registry, monthly] = await Promise.all([getHouses(), getMonthlyHouses(year, month)]);
      setRegisteredHouses(registry);
      setHouses(monthly);
      setMessage(!active && house.assignedCount > 0
        ? `Casa deshabilitada. Conserva ${house.assignedCount} asignación(es) histórica(s).`
        : `Casa ${active ? 'habilitada' : 'deshabilitada'} en el registro general.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGeneralDriver(driver) {
    if (!window.confirm(`Eliminar el registro de ${driver.firstName} ${driver.lastName}?`)) return;
    setSaving(true);
    setMessage('');
    try {
      await removeDriver(driver.id);
      const [registry, monthly] = await Promise.all([getDrivers(), getMonthlyDrivers(year, month)]);
      setRegisteredDrivers(registry);
      setDrivers(monthly);
      setMessage('Se eliminó el registro sin asignaciones históricas.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGeneralHouse(house) {
    if (!window.confirm(`Eliminar el registro de ${house.name}?`)) return;
    setSaving(true);
    setMessage('');
    try {
      await removeHouse(house.id);
      const [registry, monthly] = await Promise.all([getHouses(), getMonthlyHouses(year, month)]);
      setRegisteredHouses(registry);
      setHouses(monthly);
      setMessage('Se eliminó el registro sin asignaciones históricas.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveLocation(values, id) {
    setSaving(true);
    setMessage('');
    try {
      if (id) {
        await updateLocation(id, values);
      } else {
        await createLocation(values);
      }
      setLocations(await getLocations());
      setMessage(id ? 'Se actualizó la ubicación.' : 'La ubicación se agregó al registro general.');
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeLocationStatus(location, active) {
    setSaving(true);
    setMessage('');
    try {
      await updateLocation(location.id, { ...location, active });
      setLocations(await getLocations());
      setMessage(!active && location.assignedCount > 0
        ? `Ubicación deshabilitada. Sus ${location.assignedCount} asignación(es) en salidas se conservan.`
        : `Ubicación ${active ? 'habilitada' : 'deshabilitada'}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGeneralLocation(location) {
    if (!window.confirm(`¿Eliminar la ubicación ${location.name}?`)) return;
    setSaving(true);
    setMessage('');
    try {
      await removeLocation(location.id);
      setLocations(await getLocations());
      setMessage('Se eliminó la ubicación sin salidas asociadas.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeLocationAvailability(location, available) {
    setSaving(true);
    setMessage('');
    try {
      await updateLocationAvailability(year, month, location.id, available);
      setMonthlyLocations(await getMonthlyLocations(year, month));
      setMessage(available
        ? 'La ubicación volvió a estar disponible este mes.'
        : 'La ubicación se quitó de las opciones de este mes. Las salidas que ya la usan la conservan.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveType(values) {
    setSaving(true);
    setMessage('');
    try {
      await createOutingType(values.name);
      setTypes(await getOutingTypes());
      setMessage('Se agregó el tipo de salida. Ya está disponible en las reglas y en las salidas manuales.');
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeTypeStatus(type, active) {
    setSaving(true);
    setMessage('');
    try {
      await updateOutingType(type.id, { name: type.name, active });
      setTypes(await getOutingTypes());
      setMessage(`Tipo ${active ? 'habilitado' : 'deshabilitado'}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteType(type) {
    if (!window.confirm(`¿Eliminar el tipo ${type.name}?`)) return;
    setSaving(true);
    setMessage('');
    try {
      await deleteOutingType(type.id);
      setTypes(await getOutingTypes());
      setMessage('Se eliminó el tipo de salida.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveTerritory(values, id) {
    setSaving(true);
    setMessage('');
    try {
      if (id) {
        await updateTerritory(id, values);
      } else {
        await createTerritory(values);
      }
      setTerritories(await getTerritories());
      setMessage(id ? 'Se actualizó el territorio.' : 'El territorio se agregó al registro general.');
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeTerritoryStatus(territory, active) {
    setSaving(true);
    setMessage('');
    try {
      await updateTerritory(territory.id, { name: territory.name, active });
      setTerritories(await getTerritories());
      setMessage(!active && territory.assignedCount > 0
        ? `Territorio deshabilitado. Sus ${territory.assignedCount} asignación(es) en salidas se conservan.`
        : `Territorio ${active ? 'habilitado' : 'deshabilitado'} en el registro general.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGeneralTerritory(territory) {
    if (!window.confirm(`¿Eliminar el registro del territorio ${territory.name}?`)) return;
    setSaving(true);
    setMessage('');
    try {
      await removeTerritory(territory.id);
      setTerritories(await getTerritories());
      setMessage('Se eliminó el registro sin salidas asociadas.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveTerritoryLocation(values, id) {
    setSaving(true);
    setMessage('');
    try {
      const saved = id
        ? await updateTerritoryLocation(id, values)
        : await createTerritoryLocation(values);
      setTerritoryLocations(await getTerritoryLocations());
      setMessage(id
        ? `Ubicación ${saved.name} actualizada.`
        : `Ubicación ${saved.name} creada con sus territorios cercanos.`);
      return saved;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function changeTerritoryLocationStatus(location, active) {
    setSaving(true);
    setMessage('');
    try {
      await updateTerritoryLocation(location.id, { ...location, active });
      setTerritoryLocations(await getTerritoryLocations());
      setMessage(`Ubicación ${location.name} ${active ? 'habilitada' : 'deshabilitada'}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTerritoryLocationRecord(location) {
    if (!window.confirm(`¿Eliminar la ubicación ${location.name}?`)) return;
    setSaving(true);
    setMessage('');
    try {
      await removeTerritoryLocation(location.id);
      setTerritoryLocations(await getTerritoryLocations());
      setMessage('Se eliminó la ubicación sin salidas asociadas.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyConfiguration(sourceYear, sourceMonth, destinationYear, destinationMonth, options) {
    setSaving(true);
    setMessage('');
    try {
      const result = await copyMonthConfiguration(sourceYear, sourceMonth, destinationYear, destinationMonth, options);
      setYear(destinationYear);
      setYearInput(String(destinationYear));
      setMonth(destinationMonth);
      const [savedOutings, savedDrivers, savedHouses] = await Promise.all([
        getOutings(destinationYear, destinationMonth),
        getMonthlyDrivers(destinationYear, destinationMonth),
        getMonthlyHouses(destinationYear, destinationMonth),
      ]);
      const savedRotations = await getHouseRotations(destinationYear, destinationMonth);
      const savedDriverRotations = await getDriverRotations(destinationYear, destinationMonth);
      setConfiguration(result.configuration);
      setOutings(savedOutings);
      setDrivers(savedDrivers);
      setDriverRotations(savedDriverRotations);
      setHouses(savedHouses);
      setHouseRotations(savedRotations);
      setMessage('Se copió la configuración seleccionada. Las salidas individuales no se copiaron.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Planificación mensual</p>
          <h1>Salidas de predicación</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <button className="button button-quiet" type="button" onClick={runFirebaseTest}>
            Probar Firebase
          </button>
          {view === 'schedule' && <div className="month-controls" aria-label="Seleccionar mes y año">
          <label className="field">
            <span>Mes</span>
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {months.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
            </select>
          </label>
          <label className="field year-field">
            <span>Año</span>
            <input
              type="number"
              min="1900"
              max="9999"
              value={yearInput}
              onChange={(event) => setYearInput(event.target.value)}
              onBlur={() => {
                const nextYear = Number(yearInput);
                if (Number.isInteger(nextYear) && nextYear >= 1900 && nextYear <= 9999) {
                  setYear(nextYear);
                } else {
                  setYearInput(String(year));
                }
              }}
            />
          </label>
          </div>}
        </div>
      </header>

      <nav className="view-tabs" aria-label="Secciones principales">
        <button className={view === 'schedule' ? 'view-tab selected' : 'view-tab'} type="button" onClick={() => setView('schedule')}>Cronograma</button>
        <button className={view === 'administration' ? 'view-tab selected' : 'view-tab'} type="button" onClick={() => setView('administration')}>Administración</button>
      </nav>

      {view === 'schedule' && <section className="month-toolbar" aria-label={`Acciones para ${monthLabel}`}>
        <div>
          <h2>{monthLabel}</h2>
          <p>{outings.length} {outings.length === 1 ? 'salida' : 'salidas'} en el mes</p>
        </div>
        <div className="toolbar-actions">
          <a
            className="button button-quiet"
            href={schedulePdfUrl(year, month)}
            download={`Cronograma_${months[month - 1]}_${year}.pdf`}
          >
            Descargar PDF
          </a>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => { setShowConfiguration((visible) => !visible); setEditor(null); }}
          >
            Configuración del mes
          </button>
          <button className="button button-primary" type="button" onClick={generateMonth} disabled={saving || loading}>
            Generar / actualizar mes
          </button>
        </div>
      </section>}

      {message && (
        <p className={loadIssues.length > 0 ? 'status-message status-message-error' : 'status-message'} role="status">
          {message}
        </p>
      )}

      {view === 'administration' ? (
        <AdministrationPage
          drivers={registeredDrivers}
          houses={registeredHouses}
          locations={locations}
          territories={territories}
          territoryLocations={territoryLocations}
          onSaveTerritoryLocation={saveTerritoryLocation}
          onTerritoryLocationStatusChange={changeTerritoryLocationStatus}
          onDeleteTerritoryLocation={deleteTerritoryLocationRecord}
          types={types}
          onSaveLocation={saveLocation}
          onDeleteLocation={deleteGeneralLocation}
          onLocationStatusChange={changeLocationStatus}
          onSaveType={saveType}
          onTypeStatusChange={changeTypeStatus}
          onDeleteType={deleteType}
          onSaveTerritory={saveTerritory}
          onDeleteTerritory={deleteGeneralTerritory}
          onTerritoryStatusChange={changeTerritoryStatus}
          onSaveDriver={saveDriver}
          onDeleteDriver={deleteGeneralDriver}
          onDriverStatusChange={changeDriverGeneralStatus}
          onSaveHouse={saveHouse}
          onDeleteHouse={deleteGeneralHouse}
          onHouseStatusChange={changeHouseGeneralStatus}
          saving={saving}
        />
      ) : <>
      {showConfiguration && (
        <MonthlyConfiguration
          configuration={configuration}
          drivers={drivers}
          driverRotations={driverRotations}
          houses={houses}
          houseRotations={houseRotations}
          groups={groups}
          types={types}
          locations={monthlyLocations}
          onLocationAvailabilityChange={changeLocationAvailability}
          outings={outings}
          year={year}
          month={month}
          onSave={saveMonthlyConfiguration}
          onSaveDriver={saveDriver}
          onAvailabilityChange={changeDriverAvailability}
          onDriverRotationChange={changeDriverRotation}
          onSaveHouse={saveHouse}
          onHouseAvailabilityChange={changeHouseAvailability}
          onHouseRotationChange={changeHouseRotation}
          onCopy={copyConfiguration}
          onClose={() => setShowConfiguration(false)}
          saving={saving}
        />
      )}

      {editor && (
        <OutingForm
          key={editor.kind === 'edit' ? editor.outing.id : 'manual'}
          outing={editor.kind === 'edit' ? editor.outing : null}
          defaultDate={`${monthId}-01`}
          year={year}
          month={month}
          territories={territories}
          types={types}
          locations={locations}
          monthOutings={outings}
          territoryLocations={territoryLocations}
          onSave={saveOuting}
          onCancel={() => setEditor(null)}
          saving={saving}
        />
      )}

      <section className="schedule-section" aria-labelledby="schedule-title">
        <div className="section-heading schedule-heading">
          <div>
            <p className="eyebrow">Cronograma generado</p>
            <h2 id="schedule-title">Salidas del mes</h2>
          </div>
          <button
            className="button button-add"
            type="button"
            onClick={() => { setEditor({ kind: 'manual' }); setShowConfiguration(false); }}
          >
            + Agregar salida manual
          </button>
        </div>

        {loading ? <p className="empty-state">Cargando el mes…</p> : (
          <OutingsTable
            outings={outings}
            onEdit={(outing) => { setEditor({ kind: 'edit', outing }); setShowConfiguration(false); }}
            onDelete={deleteOuting}
          />
        )}
      </section>

      {!loading && <TerritoryUsagePanel outings={outings} territories={territories} />}
      </>}
    </main>
  );
}