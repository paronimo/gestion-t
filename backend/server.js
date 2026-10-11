import express from 'express';
import { requireAdmin } from './middleware/auth.js';
import scheduleRoutes from './routes/scheduleRoutes.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Todas las rutas de /api exigen sesión verificada y rol "admin".
// Se aplica aquí, antes del router, para que ninguna ruta quede sin protección.
// No basta con ocultar pantallas en React: el backend responde igual si alguien
// llama a la API directamente.
app.use('/api', requireAdmin, scheduleRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  const status = error.status === 400 ? 400 : 500;
  response.status(status).json({ error: status === 400 ? 'Solicitud no válida' : 'Error interno del servidor' });
});

app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});