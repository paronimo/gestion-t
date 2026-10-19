import { Router } from 'express';
import { getReports, postReport } from '../controllers/reportController.js';
import { requireAuth } from '../middleware/auth.js';

// Reportes enviados desde la app Android. Las dos rutas exigen una sesión
// válida de Firebase: los reportes contienen datos de las salidas y del
// conductor, no son información pública.
export function createReportRouter({ verify } = {}) {
  const router = Router();
  const auth = requireAuth(verify);

  router.post('/reports', auth, postReport);
  router.get('/reports', auth, getReports);

  return router;
}
