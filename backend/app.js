import express from 'express';
import scheduleRoutes from './routes/scheduleRoutes.js';
import { createReportRouter } from './routes/reportRoutes.js';
import { createScheduleRouter } from './routes/outsideScheduleRoutes.js';

// `verify` permite sustituir la verificación real de Firebase en las pruebas.
// En producción se omite y se usa el Admin SDK con las credenciales del .env.
export function createApp({ verify } = {}) {
  const app = express();

  app.use(express.json());
  app.use('/api', scheduleRoutes);
  app.use('/api', createReportRouter({ verify }));
  app.use('/api', createScheduleRouter({ verify }));

  app.use((error, _request, response, _next) => {
    console.error(error);
    const status = error.status === 400 ? 400 : 500;
    response.status(status).json({ error: status === 400 ? 'Solicitud no válida' : 'Error interno del servidor' });
  });

  return app;
}

export default createApp;
