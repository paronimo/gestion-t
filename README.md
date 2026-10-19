# Gestor mensual de salidas

Aplicación sencilla para configurar las salidas recurrentes de un mes, generar sus ocurrencias y administrar excepciones individuales. La configuración y las salidas se guardan en un archivo JSON local del backend.

## Archivos principales

- `backend/server.js`: configura Express y monta las rutas.
- `backend/routes/scheduleRoutes.js`: declara los endpoints REST del cronograma.
- `backend/controllers/scheduleController.js`: valida las solicitudes y coordina la lógica.
- `backend/models/scheduleModel.js`: lee y guarda los registros de conductores y casas y sus datos mensuales en `backend/data/months.json`.
- `backend/services/scheduleGenerator.js`: calcula fechas, días de semana y aplica la rotación de casas al generar salidas de grupo.
- `frontend/src/App.jsx`: selección del mes, carga de datos y acciones principales.
- `frontend/src/components/AdministrationPage.jsx`: administración de los registros generales.
- `frontend/src/components/MessagingPage.jsx` y `AvailabilityInquiriesPanel.jsx`: sección Mensajería y consulta de disponibilidad de casas.
- `shared/messaging.js`: generación de los mensajes de consulta a partir de las salidas reales (reutilizable, sin interfaz).
- `frontend/src/components/MonthlyConfiguration.jsx`: reglas, disponibilidad mensual y copia entre meses.
- `frontend/src/components/DriversPanel.jsx` y `HousesPanel.jsx`: paneles reutilizados para registro general y disponibilidad mensual.
- `frontend/src/components/CopyConfigurationPanel.jsx`: selección de origen, destino y elementos a copiar.
- `frontend/src/components/OutingsTable.jsx`: listado de salidas y acciones individuales.
- `frontend/src/components/OutingForm.jsx`: creación manual y edición individual.
- `frontend/src/services/api.js`: comunicación HTTP con Express.
- `package.json` y `scripts/dev.js` (en la raíz): lanzador que inicia backend y frontend juntos.

## Iniciar

Instala las dependencias una sola vez:

```sh
npm run setup
```

Y arranca todo con un único comando desde la raíz del proyecto:

```sh
npm run dev
```

Eso levanta el backend en `http://localhost:3000` y el frontend en `http://localhost:5173`, con la salida de cada uno etiquetada. Abrís `http://localhost:5173` y listo. Para detenerlo, `Ctrl+C` corta los dos procesos a la vez.

Si preferís dos terminales, también funciona por separado:

```sh
cd backend
npm run dev
```

```sh
cd frontend
npm run dev
```

Otros comandos desde la raíz:

- `npm test` — corre las pruebas del backend.
- `npm run build` — genera el build de producción del frontend.

El proxy de desarrollo de Vite reenvía `/api` al backend en `http://localhost:3000`.

## Reportes enviados desde la app Android

La app Android *Geditorio* envía los reportes de la pantalla **Reportar salida** al backend web. El backend los guarda en el mismo archivo de datos del gestor (`backend/data/months.json`, campo `reports`) y los devuelve por `GET /api/reports`.

### Autenticación (obligatoria)

Ambos endpoints exigen una sesión de Firebase Authentication. La app inicia sesión con correo y contraseña y envía el ID token en `Authorization: Bearer <token>`; el backend lo verifica con el Admin SDK (firma, emisor, audiencia, vencimiento y revocación). Sin token, `POST /api/reports` y `GET /api/reports` responden `401`. Los permisos se administran desde Firebase (crear/habilitar cuentas); el backend no tiene usuarios propios.

El backend necesita credenciales de cuenta de servicio. En `backend/.env` (no se sube a git):

```sh
FIREBASE_SERVICE_ACCOUNT=/ruta/al/serviceAccount.json
# o, si se prefiere por variables:
# FIREBASE_PROJECT_ID=gedistorio
# FIREBASE_CLIENT_EMAIL=...@gedistorio.iam.gserviceaccount.com
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

La cuenta de servicio se descarga desde **Configuración del proyecto → Cuentas de servicio** en la consola de Firebase. Nunca se guarda en la app Android ni en el frontend.

### API

- `POST /api/reports` (sesión requerida) — cuerpo:
  ```json
  {
    "salidaId": "<id de la salida del cronograma>",
    "realizada": true,
    "observaciones": "texto libre",
    "territorioTexto": "T 4 : 7250, 7251 (Faltan: 7270)"
  }
  ```
  El tipo de salida, la fecha, el turno, el territorio asignado y el conductor se copian del cronograma en el servidor: el cliente no puede reescribirlos. Responde `201` con `{ report, duplicate: false }` al guardar, `200` con `duplicate: true` si el mismo usuario ya lo había enviado (misma salida, o misma cabecera `Idempotency-Key`), `400` con datos inválidos, `401` sin sesión válida, `404` si la salida no existe y `500` ante un fallo del servidor.
- `GET /api/reports` (sesión requerida) — `{ reports: [...], count }`, opcionalmente `?salidaId=...&limit=...`.

Desde la web, `getReports({ token })` en `frontend/src/services/api.js` consulta los reportes. La sección «Reportes recibidos» queda para una etapa posterior.

### Configurar la URL del servidor en Android

El backend escucha en todas las interfaces; en un celular real hay que usar la IP del equipo donde corre (misma red Wi-Fi), por ejemplo `http://192.168.1.50:3000`.

La URL se configura al compilar, en `geditorio/gradle.properties`:

```properties
geditorio.backendUrl=http://192.168.1.50:3000
```

También se puede pasar como variable de entorno: `GEDITORIO_BACKEND_URL=http://192.168.1.50:3000 ./gradlew assembleDebug`. Si no se configura nada se usa `http://10.0.2.2:3000` (el equipo anfitrión visto desde el emulador). No se usa tráfico sin cifrar en producción: para un servidor fuera de la red local debe ser `https`.

## Uso

1. Elige el mes y año.
2. Abre **Configuración del mes**, agrega reglas por día, hora, tipo, grupo y lugar, y guárdalas.
3. Guardar la configuración genera las salidas recurrentes del mes. También puedes usar **Generar / actualizar mes** para regenerarlas.
4. Edita o elimina una ocurrencia desde la tabla para afectar solo esa salida. Usa **Agregar salida manual** para una excepción.

Al guardar una configuración se vuelven a generar las salidas recurrentes del mes; las salidas manuales se conservan. Los cambios individuales no modifican las reglas. Los datos quedan en el backend local; no se incluye una base de datos externa.

Los conductores se registran una vez con nombre, apellido y categoría. Su estado habilitado y los días de mañana de los precursores se guardan por mes. Los ancianos con grupo asociado solo aparecen como opción en salidas de ese grupo. Cambiar la disponibilidad no elimina ni modifica asignaciones existentes.

En **Administración** se crean, editan y habilitan/deshabilitan los registros generales de casas y conductores. La **Configuración del mes** cambia solamente su disponibilidad mensual y los días de precursores.

La sección **Mensajería → Disponibilidad de casas** lista las casas con la opción **Preguntar disponibilidad** activada que aparecen como punto de encuentro en el mes. Para cada una muestra las fechas reales y genera un mensaje (por ejemplo *"¿Estaría disponible tu casa para estas fechas?"* seguido de *"🟤 Sábado 10 a las 10:00 AM"*) que se copia al portapapeles con **Copiar mensaje**. **✅ Confirmar** solo registra la confirmación y no toca las salidas; **❌ Rechazar** quita la casa como punto de encuentro únicamente de las salidas de esa consulta, sin eliminarla del registro general ni de otros meses. Todavía no se envían notificaciones automáticas: los mensajes se copian y pegan a mano.

Las casas se registran una vez con nombre, grupo y la opción de uso congregacional de fin de semana. Su disponibilidad se guarda por mes. En una salida se ofrecen las casas de su grupo y, si es congregacional en sábado o domingo, las casas marcadas para ese uso. Las asignaciones existentes no cambian cuando se quita una casa de la disponibilidad.

La rotación de casas se ordena por grupo dentro de **Casas disponibles** con botones para subir, bajar, agregar o quitar. Al generar, cada salida recurrente con grupo usa la siguiente casa de su orden; al terminarlo, vuelve al comienzo. Solo participan casas del mismo grupo, activas y disponibles para ese mes. Cambiar el orden no modifica salidas existentes: se aplica al regenerar. La regeneración reemplaza las ocurrencias recurrentes según el comportamiento existente y conserva salidas manuales.

La **Rotación de conductores** guarda por mes una lista de ancianos y otra de conductores asociados para cada grupo. Al generar se prefieren ancianos con al menos siete días desde su última asignación, después conductores del grupo; si no hay opción semanal, se admite cualquier candidato que no haya trabajado el día anterior. Los precursores solo pueden cubrir mañanas de martes a viernes marcadas como disponibles. Las salidas congregacionales de sábado/domingo usan la lista de ancianos evitando repetir a la misma persona ambos días cuando hay alternativa. Si no hay candidato, queda `Sin definir`.

Editar el conductor de una salida recurrente fija solo esa ocurrencia; al regenerarla se conserva y no cambia el orden de rotación. Las salidas manuales siguen fuera de la generación recurrente.

La **Rotación de conductores** mantiene listas mensuales separadas de ancianos y otros conductores asociados a cada grupo. También muestra por separado la disponibilidad de precursores y las demás personas. Al generar, se respetan categoría, grupo, estado general, disponibilidad mensual y días configurados para precursores. Se prefiere una semana entre asignaciones; nunca se asigna la misma persona en días consecutivos. Los ancianos de sábado/domingo se filtran con la misma regla. Si no hay candidato, la salida queda **Sin definir**. Una corrección manual queda ligada a esa ocurrencia y no cambia la rotación; se conserva al regenerar la misma regla/fecha.

## API

- `GET /api/months/:year/:month/configuration`
- `PUT /api/months/:year/:month/configuration`
- `GET /api/months/:year/:month/outings`
- `POST /api/months/:year/:month/outings`
- `PUT /api/months/:year/:month/outings/:id`
- `DELETE /api/months/:year/:month/outings/:id`
- `GET /api/drivers`
- `POST /api/drivers`
- `PUT /api/drivers/:id`
- `DELETE /api/drivers/:id` (solo sin asignaciones históricas)
- `GET /api/houses`
- `POST /api/houses`
- `PUT /api/houses/:id`
- `DELETE /api/houses/:id` (solo sin asignaciones históricas)
- `GET /api/months/:year/:month/drivers`
- `PUT /api/months/:year/:month/drivers/:id/availability`
- `GET /api/months/:year/:month/driver-rotations`
- `PUT /api/months/:year/:month/driver-rotations`
- `GET /api/months/:year/:month/driver-rotations`
- `PUT /api/months/:year/:month/driver-rotations`
- `GET /api/months/:year/:month/drivers/available?date=YYYY-MM-DD&time=HH:mm&group=...`
- `GET /api/months/:year/:month/houses`
- `POST /api/months/:year/:month/houses`
- `PUT /api/houses/:id`
- `PUT /api/months/:year/:month/houses/:id/availability`
- `GET /api/months/:year/:month/houses/available?date=YYYY-MM-DD&group=...&type=...`
- `GET /api/months/:year/:month/house-rotations`
- `PUT /api/months/:year/:month/house-rotations`
- `POST /api/months/:year/:month/copy-from/:sourceYear/:sourceMonth`
- `GET /api/months/:year/:month/availability-inquiries`
- `GET /api/months/:year/:month/houses/:id/availability-message`
- `POST /api/months/:year/:month/houses/:id/availability/confirm`
- `POST /api/months/:year/:month/houses/:id/availability/reject` (cuerpo `{ outingIds: [...] }`)
- `POST /api/reports` (sesión de Firebase; ver *Reportes enviados desde la app Android*)
- `GET /api/reports?salidaId=...&limit=...` (sesión de Firebase)

En la copia mensual, las reglas recurrentes sin grupo y las configuraciones de grupo (reglas que incluyen un grupo) se seleccionan por separado. Se pueden copiar además las disponibilidades de casas, conductores y días de precursores. No se copian salidas individuales; las recurrencias seleccionadas se generan con las fechas del destino y se conservan las salidas manuales de ese destino.

Las pruebas del modelo usan un JSON temporal y cubren rotación normal, reinicio del ciclo, orden personalizado, grupos y meses independientes, y casas no elegibles. Se ejecutan con `cd backend && npm test`.

`backend/reportRoutes.test.js` levanta la app real con un archivo temporal y una verificación de sesión inyectada (`createApp({ verify })`/`FIREBASE_VERIFIER_MODULE`), y cubre recepción, persistencia, consulta, texto del territorio y manzanas, datos inválidos, reintentos y envíos simultáneos sin duplicados, `401` sin sesión válida y `500` ante fallos del servidor. Las pruebas Android (`cd geditorio && ./gradlew testDebugUnitTest`) incluyen `ReporteHttpTest` con un servidor HTTP local y `SalidaRepositoryEnvioTest` para el bloqueo de dobles envíos.
