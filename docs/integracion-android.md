# Integración Android — vínculo de conductores, informes y consultas

> Documento de diseño del **PASO 7**. No publica reglas, no migra datos y no
> desarrolla la aplicación Android. Describe el estado real del modelo y lo que
> hay que decidir antes de programar el móvil.

## 0. Estado del paso 6 (punto de partida)

Comprobado contra el proyecto real el **2026-10-11**:

| Comprobación | Resultado real |
|---|---|
| Conexión a Firestore con la cuenta de servicio (`gedistorio`) | ❌ **Bloqueada**: error `8 RESOURCE_EXHAUSTED: Quota exceeded` |
| Cuota gratuita de Firestore | Agotada (lecturas/escrituras del día) |
| Reglas aún publicadas | No se pueden comprobar desde el cliente sin cuota. `backend/firestore.rules.propuesta` sigue siendo **una propuesta no publicada** |
| `months.json` | ✅ Intacto (hash `b5d78408…`, idéntico a su respaldo, sin cambios en git) |
| Fuente de datos del backend | ✅ Firestore (no hay `SCHEDULE_DATA_FILE` en `.env`) |

**Consecuencia:** toda la verificación que dependa de leer o escribir Firestore
queda **bloqueada por cuota**, no aprobada. Lo que sí se pudo verificar de forma
real (autorización por token, arranque, reinicio, persistencia de configuración,
suite de pruebas) está en el informe final.

---

## 1. Vínculo entre conductores y cuentas

### 1.1 Los cuatro identificadores (no confundir)

| Identificador | Dónde vive | Qué es |
|---|---|---|
| `uid` | `conductores/{id}.uid` | UID de Firebase Authentication. **Hueco creado en la migración, hoy `null`.** |
| `conductorId` | `usuarios/{uid}.conductorId` | Referencia desde el perfil de usuario al conductor. **No existe todavía.** |
| `driverId` | `salidas/{id}.driverId` | ID **interno** del conductor en `conductores`. Ya se usa y se conserva. |
| `conductorUid` | `salidas/{id}.conductorUid` | Copia del UID de Auth **en la propia salida**, para que las reglas comparen sin leer otro documento. **Hueco creado en la migración, hoy `null`.** |

```
usuarios/{uid}                      conductores/{conductorId}
  rol: "admin" | …                    uid: <UID de Auth>   ← hoy null
  conductorId: <conductorId>  ──────► id: <conductorId>
                                              ▲
                                              │ driverId
                                              │
                            salidas/{salidaId}┴── driverId: <conductorId>
                                                   conductorUid: <UID>  ← hoy null
```

### 1.2 Qué existe HOY en los datos

Verificado sobre `backend/data/months.json` (que es copia del origen migrado):

- **29 conductores**. Sus claves son exactamente:
  `id, active, firstName, lastName, category, group`. **Ningún conductor tiene `uid`.**
- **144 salidas**. Sus claves incluyen `driverId` (puede ser `null`) pero
  **ninguna tiene `conductorUid`**.
- **1 cuenta de Authentication**: `uid = hIYs5RrRAEVP1sxOBu7FTbMNd7F3`
  (`nimoparo44@gmail.com`).
- Coincidencia `driverId` ↔ conductor: la auditoría de la migración lo comprobaba
  (`verificar-migracion.js`), pero **no se puede reverificar en Firestore ahora
  mismo por la cuota**.

### 1.3 Regla de oro: no inventar vínculos

Ni `conductorUid` en la salida ni `uid` en el conductor deben rellenarse
automáticamente. **Un UID asignado al conductor equivocado daría a una persona
acceso a las salidas de otra y capacidad de enviar informes falsos.** La única
asignación admisible es una que verifique la correspondencia con datos reales
(nombre/apellido del conductor ↔ perfil de la cuenta), y aun así conviene que la
confirme un administrador.

### 1.4 Vínculos pendientes

| Vínculo | Cantidad | Estado |
|---|---|---|
| Conductores sin `uid` | 29 de 29 | Pendiente: no hay ninguna cuenta de conductor creada |
| Cuentas de conductor en Auth | 0 identificadas | Pendiente: solo existe 1 cuenta, y es de administrador |
| Salidas con `conductorUid` nulo | 144 de 144 | Pendiente: se completará al asignar `uid` a los conductores |
| `usuarios/{uid}.conductorId` | 0 | Campo aún no existe |
| Colección `informes` | 0 documentos | Aún no creada |

---

## 2. Propuesta de `informes/{id}`

Documento que un conductor envía para informar el resultado de una salida
**asignada a él**. El móvil solo **añade** informes; nunca modifica la planificación.

### 2.1 Campos propuestos

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `salidaId` | string | Elige el conductor entre sus salidas | ID del documento `salidas/{id}` |
| `uid` | string | Lo pone la app con el usuario autenticado | **Debe** ser `request.auth.uid`; las reglas lo exigen |
| `conductorId` | string | Derivado en el móvil de `usuarios/{uid}.conductorId` | Facilita informes por persona; opcional pero útil |
| `fecha` | string `YYYY-MM-DD` | Copiada de la salida | Denormalizada, para consultar sin leer la salida |
| `mes` | string `YYYY-MM` | Derivado de `fecha` | Índice para listar por mes (igual que en `salidas`) |
| `hora` | string `HH:mm` | Copiada de la salida | Contexto del informe |
| `tipoSalida` | string | Copiada de la salida | Contexto |
| `diaSemana` | string | Derivado de `fecha` | Contexto |
| `resultado` | string (catálogo) | Marcado por el conductor | **Valores a confirmar por ti** (§ Decisiones) |
| `observaciones` | string | Texto libre del conductor | Puede ir vacío; límite sugerido 500 caracteres |
| `enviadoEn` | timestamp | `DateTime.now()` del móvil | Fecha/hora de envío |
| `estado` | string | `"enviado"` al crear | **A confirmar** (§ Decisiones) |

### 2.2 Lo que el informe NO puede hacer

- **No modifica `salidas`.** Un conductor no tiene permiso de escritura sobre
  `salidas` (las reglas lo bloquean con `allow write: if false`).
- **No cambia de dueño.** El `uid` del informe no se puede editar (lo exige la regla).
- **No crea informes a nombre de otro:** al crear, `uid == request.auth.uid`.
- No borra informes: solo el administrador puede (`delete: if esAdmin()`).

### 2.3 Preguntas abiertas (no las decido sin tu confirmación)

1. **Valores de `resultado`**: ¿qué catálogo exacto? (p. ej. *Realizada*,
   *No realizada*, *Cancelada*, *Reagendada*). No los fijo por mi cuenta.
2. **Un informe por salida o varios**: ¿un conductor puede enviar y luego
   corregir el mismo informe, o cada envío es un documento nuevo?
3. **`estado`**: ¿hace falta (borrador/enviado/revisado) o basta con la
   existencia del documento?
4. **Datos extra**: ¿asistencia (número de publicadores), hora real de inicio/fin,
   incidencias? Cambian el formulario del móvil.
5. **Adjuntos** (foto del territorio/nota): implica Firebase Storage, que hoy
   no está en el proyecto.

---

## 3. Consultas de Android compatibles con las reglas

Recordatorio: en Firestore las reglas **autorizan o niegan**, no filtran. Si la
consulta no incluye el filtro que la regla exige, Firestore **rechaza la consulta
completa**; no devuelve una lista recortada. Por eso cada lectura de abajo lleva
**obligatoriamente** su `where`.

### 3.1 Iniciar sesión

```
FirebaseAuth.getInstance()…signInWithEmailAndPassword(email, password)
```
La app no habla con Express: el conductor usa Firestore directamente. El rol no
importa en la app; las reglas deciden qué puede leer.

### 3.2 Consultar SOLO las salidas asignadas al conductor

```
db.collection("salidas")
  .whereEqualTo("conductorUid", FirebaseAuth.getInstance().currentUser.uid)
  .whereEqualTo("mes", "2026-10")      // opcional: acota el mes
  .orderBy("date").orderBy("time")     // requiere el índice 3.6
```

- **El `whereEqualTo("conductorUid", uid)` es obligatorio**: es el que la regla
  `salidas` exige. Sin él, Firestore rechaza la consulta.
- **Nunca** se hace `db.collection("salidas").get()` y se filtra en el teléfono:
  eso descargaría las 144 salidas (y fallaría contra las reglas propuestas).
- La consulta se hace **del lado del servidor**: la app solo recibe sus propias salidas.

### 3.3 Consultar los catálogos que la salida necesita (dirección/Maps)

Con sesión iniciada, las reglas permiten leer:
`casas/{id}`, `ubicaciones/{id}`, `ubicacionesTerritorio/{id}`, `conductores/{id}`,
`tiposSalida/{id}`, `meses/{YYYY-MM}`.
El móvil resuelve el `placeId` de su salida leyendo el documento correspondiente
por su `id` (lectura directa, no `list` completo salvo que haga falta).

### 3.4 Enviar un informe

```
val informe = mapOf(
  "salidaId" to salidaId,
  "uid" to uid,                    // el propio; lo exige la regla
  "fecha" to salida.fecha,
  "mes" to salida.fecha.substring(0, 7),
  "resultado" to resultado,        // valor del catálogo acordado
  "observaciones" to observaciones,
  "enviadoEn" to FieldValue.serverTimestamp()
)
db.collection("informes").add(informe)
```
La regla de creación exige `request.resource.data.uid == request.auth.uid`.

### 3.5 Consultar sus propios informes

```
db.collection("informes")
  .whereEqualTo("uid", FirebaseAuth.getInstance().currentUser.uid)
  .orderBy("enviadoEn", Query.Direction.DESCENDING)
```

### 3.6 Índices compuestos que habrá que crear

Las consultas con **dos o más igualdades/direcciones** necesitan índice. A crearlos
(o a simplificar la consulta) **antes** de publicar reglas:

| Colección | Campos | Para |
|---|---|---|
| `salidas` | `conductorUid` ↑, `mes` ↑, `date` ↑, `time` ↑ | salidas del conductor por mes |
| `salidas` | `conductorUid` ↑, `date` ↑, `time` ↑ | salidas del conductor sin acotar mes |
| `informes` | `uid` ↑, `enviadoEn` ↓ | últimos informes del conductor |
| `informes` | `uid` ↑, `mes` ↑ | informes por mes |

### 3.7 Compatibilidad con las reglas propuestas

| Consulta | Regla que la permite | ¿Compatible? |
|---|---|---|
| `salidas` con `conductorUid == uid` | `resource.data.conductorUid == request.auth.uid` | ✅ (con el filtro incluido) |
| `informes` con `uid == uid` | `resource.data.uid == request.auth.uid` | ✅ |
| crear `informes` con `uid == uid` | `request.resource.data.uid == request.auth.uid` | ✅ |
| `casas` / `ubicaciones` / `conductores` (lectura) | `haySesion()` | ✅ |
| `salidas` sin filtro de `conductorUid` | — | ❌ rechazada |
| cualquier escritura en `salidas`, `meses`, catálogos | `allow write: if false` | ❌ prohibida |

---

## 4. Límites respetados en este paso

- No se desarrolló la aplicación Android.
- No se volvió a migrar ningún dato.
- No se publicaron reglas: `firestore.rules.propuesta` sigue siendo una propuesta.
- No se borraron datos ni se tocaron funcionalidades existentes
  (el único archivo nuevo de backend es `scripts/verificar-gestor.js`, de solo lectura
  salvo que se invoque con `--con-escritura`).
