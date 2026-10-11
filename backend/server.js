import express from 'express';
import { requireAdmin } from './middleware/auth.js';
import scheduleRoutes from './routes/scheduleRoutes.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

function isFirestoreQuotaError(error) {
  return error?.code === 8
    || error?.code === '8'
    || error?.code === 'RESOURCE_EXHAUSTED'
    || error?.code === 'resource-exhausted'
    || /quota exceeded/i.test(error?.message || '');
}

// Todas las rutas de /api exigen sesión verificada y rol "admin".
// Se aplica aquí, antes del router, para que ninguna ruta quede sin protección.
// No basta con ocultar pantallas en React: el backend responde igual si alguien
// llama a la API directamente.
app.use('/api', requireAdmin, scheduleRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  if (isFirestoreQuotaError(error)) {
    response.status(503).json({
      error: 'Se agotó la cuota disponible de Firestore. Espera a que se restablezca o revisa el uso y el plan del proyecto.',
    });
    return;
  }

  const status = error.status === 400 ? 400 : 500;
  response.status(status).json({ error: status === 400 ? 'Solicitud no válida' : 'Error interno del servidor' });
});

app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});