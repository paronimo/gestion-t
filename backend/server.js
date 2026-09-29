import express from 'express';
import scheduleRoutes from './routes/scheduleRoutes.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', scheduleRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  const status = error.status === 400 ? 400 : 500;
  response.status(status).json({ error: status === 400 ? 'Solicitud no válida' : 'Error interno del servidor' });
});

app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});