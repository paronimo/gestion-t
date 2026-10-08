import { Router } from 'express';
import {
  deleteDriver,
  deleteHouse,
  deleteOutingType,
  deleteTerritory,
  deleteTerritoryLocation,
  getAvailableDrivers,
  getAvailableHouses,
  getConfiguration,
  getDriverList,
  getDriverRotations,
  getHouseList,
  getHouseRotations,
  getMonthlyDriverList,
  getMonthlyHouseList,
  getMonthSummary,
  getOutings,
  getSchedulePdf,
  getTerritoryList,
  getTerritoryLocationList,
  getTypeList,
  postConfigurationCopy,
  postDriver,
  postHouse,
  postHouseRecord,
  postOuting,
  postOutingType,
  postTerritory,
  postTerritoryLocation,
  putConfiguration,
  putDriver,
  putDriverAvailability,
  putDriverRotation,
  putHouse,
  putHouseAvailability,
  putHouseRotation,
  putOuting,
  putOutingType,
  putTerritory,
  putTerritoryLocation,
  removeOuting,
} from '../controllers/scheduleController.js';

const router = Router();

router.get('/drivers', getDriverList);
router.post('/drivers', postDriver);
router.put('/drivers/:id', putDriver);
router.delete('/drivers/:id', deleteDriver);
router.get('/houses', getHouseList);
router.post('/houses', postHouseRecord);
router.put('/houses/:id', putHouse);
router.delete('/houses/:id', deleteHouse);
router.get('/months/:year/:month/summary', getMonthSummary);
router.get('/outing-types', getTypeList);
router.post('/outing-types', postOutingType);
router.put('/outing-types/:id', putOutingType);
router.delete('/outing-types/:id', deleteOutingType);
router.get('/territories', getTerritoryList);
router.post('/territories', postTerritory);
router.put('/territories/:id', putTerritory);
router.delete('/territories/:id', deleteTerritory);
router.get('/territory-locations', getTerritoryLocationList);
router.post('/territory-locations', postTerritoryLocation);
router.put('/territory-locations/:id', putTerritoryLocation);
router.delete('/territory-locations/:id', deleteTerritoryLocation);
router.get('/months/:year/:month/drivers/available', getAvailableDrivers);
router.get('/months/:year/:month/drivers', getMonthlyDriverList);
router.put('/months/:year/:month/drivers/:id/availability', putDriverAvailability);
router.get('/months/:year/:month/driver-rotations', getDriverRotations);
router.put('/months/:year/:month/driver-rotations', putDriverRotation);
router.get('/months/:year/:month/houses/available', getAvailableHouses);
router.get('/months/:year/:month/houses', getMonthlyHouseList);
router.post('/months/:year/:month/houses', postHouse);
router.put('/months/:year/:month/houses/:id/availability', putHouseAvailability);
router.get('/months/:year/:month/house-rotations', getHouseRotations);
router.put('/months/:year/:month/house-rotations', putHouseRotation);
router.post('/months/:year/:month/copy-from/:sourceYear/:sourceMonth', postConfigurationCopy);
router.get('/months/:year/:month/configuration', getConfiguration);
router.put('/months/:year/:month/configuration', putConfiguration);
router.get('/months/:year/:month/schedule.pdf', getSchedulePdf);
router.get('/months/:year/:month/outings', getOutings);
router.post('/months/:year/:month/outings', postOuting);
router.put('/months/:year/:month/outings/:id', putOuting);
router.delete('/months/:year/:month/outings/:id', removeOuting);

export default router;
