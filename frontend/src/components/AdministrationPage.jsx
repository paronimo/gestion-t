import DriversPanel from './DriversPanel.jsx';
import HousesPanel from './HousesPanel.jsx';
import OutingTypesPanel, { groupIdsFromTypes } from './OutingTypesPanel.jsx';
import TerritoriesPanel from './TerritoriesPanel.jsx';
import TerritoryLocationsPanel from './TerritoryLocationsPanel.jsx';

export default function AdministrationPage({
  drivers,
  houses,
  territories,
  territoryLocations,
  types,
  onSaveDriver,
  onDeleteDriver,
  onDriverStatusChange,
  onSaveHouse,
  onDeleteHouse,
  onHouseStatusChange,
  onSaveTerritory,
  onDeleteTerritory,
  onTerritoryStatusChange,
  onSaveTerritoryLocation,
  onTerritoryLocationStatusChange,
  onDeleteTerritoryLocation,
  onSaveType,
  onTypeStatusChange,
  onDeleteType,
  saving,
}) {
  const groups = groupIdsFromTypes(types);

  return (
    <main className="administration-page">
      <div className="section-heading administration-heading">
        <div>
          <p className="eyebrow">Registros reutilizables</p>
          <h2>Administración</h2>
        </div>
      </div>
      <OutingTypesPanel
        types={types}
        onSave={onSaveType}
        onStatusChange={onTypeStatusChange}
        onDelete={onDeleteType}
        saving={saving}
      />
      <TerritoriesPanel
        territories={territories}
        onSave={onSaveTerritory}
        onStatusChange={onTerritoryStatusChange}
        onDelete={onDeleteTerritory}
        saving={saving}
      />
      <TerritoryLocationsPanel
        territoryLocations={territoryLocations}
        onSave={onSaveTerritoryLocation}
        onStatusChange={onTerritoryLocationStatusChange}
        onDelete={onDeleteTerritoryLocation}
        saving={saving}
      />
      <HousesPanel
        mode="registry"
        houses={houses}
        groups={groups}
        onSave={onSaveHouse}
        onGeneralStatusChange={onHouseStatusChange}
        onDelete={onDeleteHouse}
        saving={saving}
      />
      <DriversPanel
        mode="registry"
        drivers={drivers}
        groups={groups}
        onSave={onSaveDriver}
        onGeneralStatusChange={onDriverStatusChange}
        onDelete={onDeleteDriver}
        saving={saving}
      />
    </main>
  );
}
