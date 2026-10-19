import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

// Carga backend/.env si existe (credenciales de Firebase, puerto). Node 20.12+
// resuelve loadEnvFile; en versiones anteriores se ignora y se usan las
// variables de entorno del sistema.
const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const port = process.env.PORT || 3000;
const app = createApp();

// Escucha en todas las interfaces para que el backend sea accesible desde un
// celular en la misma red (http://IP-DEL-EQUIPO:3000), no solo desde localhost.
app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});