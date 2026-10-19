import { Router } from 'express';
import { getOutings } from '../controllers/scheduleController.js';
import { requireAuth } from '../middleware/auth.js';

// Consulta del cronograma desde la app Android.
//
// GET /api/months/:year/:month/outings ya existe para la web y ya devuelve
// cada salida con id, fecha, hora, tipo, territorio y conductor. La web lo usa
// sin sesión desde su propio origen; Android, en cambio, se conecta desde otro
// dispositivo, así que necesita una ruta protegida. Esta ruta no agrega ni
// transforma datos: reutiliza el mismo controlador, la misma validación y el
// mismo formato (getOutings).
//
// No se protege /api/months/:year/:month/outings directamente para no cambiar
// el comportamiento actual del gestor web.
export function createScheduleRouter({ verify } = {}) {
  const router = Router();
  router.get('/schedule/:year/:month/outings', requireAuth(verify), getOutings);
  return router;
}
