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

## Uso

1. Elige el mes y año.
2. Abre **Configuración del mes**, agrega reglas por día, hora, tipo, grupo y lugar, y guárdalas.
3. Guardar la configuración genera las salidas recurrentes del mes. También puedes usar **Generar / actualizar mes** para regenerarlas.
4. Edita o elimina una ocurrencia desde la tabla para afectar solo esa salida. Usa **Agregar salida manual** para una excepción.

Al guardar una configuración se vuelven a generar las salidas recurrentes del mes; las salidas manuales se conservan. Los cambios individuales no modifican las reglas. Los datos quedan en el backend local; no se incluye una base de datos externa.

Los conductores se registran una vez con nombre, apellido y categoría. Su estado habilitado y los días de mañana de los precursores se guardan por mes. Los ancianos con grupo asociado solo aparecen como opción en salidas de ese grupo. Cambiar la disponibilidad no elimina ni modifica asignaciones existentes.

En **Administración** se crean, editan y habilitan/deshabilitan los registros generales de casas y conductores. La **Configuración del mes** cambia solamente su disponibilidad mensual y los días de precursores.

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

En la copia mensual, las reglas recurrentes sin grupo y las configuraciones de grupo (reglas que incluyen un grupo) se seleccionan por separado. Se pueden copiar además las disponibilidades de casas, conductores y días de precursores. No se copian salidas individuales; las recurrencias seleccionadas se generan con las fechas del destino y se conservan las salidas manuales de ese destino.

Las pruebas del modelo usan un JSON temporal y cubren rotación normal, reinicio del ciclo, orden personalizado, grupos y meses independientes, y casas no elegibles. Se ejecutan con `cd backend && npm test`.
