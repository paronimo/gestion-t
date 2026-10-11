# Informe del PASO 7 — Verificación del gestor e integración Android

Fecha: **2026-10-11**. Trabajo sobre el proyecto existente, sin rehacer ni eliminar
funcionalidades.

---

## 1. Estado del paso 6 (antes de nada)

Comprobado contra el proyecto real:

| Comprobación | Resultado |
|---|---|
| Lectura a Firestore con la cuenta de servicio (`gedistorio`) | ❌ **`8 RESOURCE_EXHAUSTED: Quota exceeded`** |
| Escritura en Firestore | ❌ No se intentó (bloqueada igual) |
| Cuota gratuita del proyecto | **Agotada** (la cuota gratuita es de 50 000 lecturas/día, 20 000 escrituras/día y 20 000 borrados/día — [Firebase, límites de Firestore](https://firebase.google.com/docs/firestore/quotas)) |
| Reglas de Firestore | **No comprobables hoy**; `firestore.rules.propuesta` sigue **sin publicar** |
| `months.json` | ✅ Intacto (ver §3) |
| Fuente de datos del backend | ✅ Firestore (no hay `SCHEDULE_DATA_FILE` en `.env`) |

**El paso 6 no está cerrado.** Sigue habiendo cuota agotada, por lo que **no se
puede afirmar que Firestore y las reglas estén listas**. Todo lo que exige leer o
escribir Firestore queda **bloqueado**, no aprobado.

---

## 2. Pruebas REALES completadas

Estas pruebas se ejecutaron y pasaron de verdad, contra procesos y datos reales.

### 2.1 Programa en marcha
- **Backend arrancado** (`node --env-file-if-exists=.env server.js`): «Backend
  escuchando en http://localhost:3000». ✅
- **Reinicio del backend**: se mató el proceso y se relanzó; volvió a escuchar y
  respondió. ✅ (la persistencia de *datos* en Firestore no se pudo comprobar: ver §4)

### 2.2 Autorización (HTTP real, no simulada)
Todas contra `/api/drivers` en el backend en marcha:

| Petición | Resultado real |
|---|---|
| Sin encabezado `Authorization` | **401** `{ "error": "Falta el token de sesión…" }` ✅ |
| `Authorization: Bearer token-falso-invalido` | **401** `{ "error": "El token de sesión no es válido." }` ✅ |
| `Authorization: cosas` (sin Bearer) | **401** ✅ |
| `Authorization: Basic abc` | **401** ✅ |
| `Authorization: Bearer ` (vacío) | **401** ✅ |
| Ruta inexistente `/api/no-existe` con token basura | **401** (el middleware protege antes del router) ✅ |

### 2.3 Conexión real con Firebase
- **Cuenta de servicio** `firebase-adminsdk-fbsvc@gedistorio.iam.gserviceaccount.com`
  válida: el Admin SDK autentica contra Google, y es la propia Google la que
  responde `Quota exceeded` (no un fallo de credenciales). ✅
- **Firebase Authentication accesible**: `listUsers()` devolvió **1 cuenta**,
  `uid = hIYs5RrRAEVP1sxOBu7FTbMNd7F3` (`nimoparo44@gmail.com`). ✅
- **Endpoint de login de Google alcanzable**: `accounts:signInWithPassword`
  respondió con un error real de Google (`MISSING_PASSWORD`) al no tener
  contraseña, lo que confirma que la vía de inicio de sesión funciona. ✅
  **No se pudo completar el login** por falta de la contraseña de prueba → §4.

### 2.4 Suite de pruebas del proyecto
`npm run test` desde la raíz: **76/76 pruebas del backend + 30/30 de `shared`,
0 fallos.** ✅
Cubren, con un JSON temporal, el modelo y generador completos: rotación de casas
(orden, reinicio de ciclo, grupos y meses independientes, casas no elegibles),
conductores (disponibilidad por día/turno, semanas alternadas, corrección manual que
sobrevive a la regeneración, sábado/domingo sin repetir anciano), conservación de
**IDs** al regenerar, conservación de excepciones manuales, copia entre meses,
catálogos y territorios.

> ⚠️ Esto es una prueba de lógica de negocio **contra archivo**, no contra Firestore.
> No sustituye la verificación real pendiente.

### 2.5 Arnés de verificación real creado
`backend/scripts/verificar-gestor.js` — habla con el backend por HTTP e intenta
Firestore de verdad. **Ejecutado**: reporta correctamente las 3 pruebas de
autorización como ✅ y **marca como bloqueado** (no como aprobado) todo lo demás,
porque faltan las credenciales de administrador. Reutilizable en cuanto haya cuota:

```sh
# Solo lectura (recomendado primero)
GESTOR_EMAIL=tu-correo-admin GESTOR_PASSWORD=… node scripts/verificar-gestor.js

# Con escritura real (crea/edita/borra y regenera un mes de prueba, y lo limpia)
GESTOR_EMAIL=… GESTOR_PASSWORD=… node scripts/verificar-gestor.js --con-escritura
```

---

## 3. `months.json` intacto y fuentes de datos separadas

| Comprobación | Resultado |
|---|---|
| Hash de `months.json` | `b5d78408db3d348113e3fcb2da8f8cc55d9c6a4e6acf2b1041e620ef19b1b601` |
| Hash de su respaldo `months.json.bak-20261011-000118` | **Idéntico** al actual |
| Fecha de modificación | 2026-10-09 (anterior a todas mis pruebas) |
| Git | `git status` de `months.json`: **sin cambios** |
| Fuente activa del backend | **Firestore** (`SCHEDULE_DATA_FILE` no está en `.env`) |

`months.json` **no se modificó** durante este paso. La separación de fuentes es
correcta: el backend usa **una sola** fuente (Firestore), y `months.json` solo se
usa en las pruebas automáticas mediante `SCHEDULE_DATA_FILE` contra un archivo
temporal. **No se mezclan.**

---

## 4. Pruebas BLOQUEADAS (y por qué)

| Prueba pedida | Estado | Motivo exacto |
|---|---|---|
| Inicio de sesión del administrador | ⛔ Bloqueada | Falta la contraseña de la cuenta admin (no está en el repo, correctamente) |
| Rechazo de usuario autenticado **sin rol admin** | ⛔ Bloqueada | Requiere una **segunda cuenta real sin rol admin**; solo existe 1 cuenta |
| Crear / consultar / editar / borrar salidas | ⛔ Bloqueada | Cuota de Firestore agotada (error 8) |
| Generar recurrentes sin duplicar | ⛔ Bloqueada | Cuota (verificado solo en la suite contra archivo) |
| Conservar IDs y excepciones al regenerar | ⛔ Bloqueada | Cuota (verificado solo en la suite contra archivo) |
| Editar / borrar catálogos | ⛔ Bloqueada | Cuota |
| Mantener conductores, casas, territorios, ubicaciones, disponibilidad, rotaciones | ⛔ Bloqueada | Cuota |
| Exportaciones PDF | ⛔ Bloqueada | Requiere leer Firestore para construir el PDF |
| Reiniciar el backend y comprobar persistencia en Firestore | ⛔ Bloqueada | El reinicio ✅, pero la lectura posterior a Firestore falla por cuota |

**No se afirma que ninguna de estas haya pasado.** Se probaron contra archivo en la
suite §2.4, que es una comprobación distinta y menor.

---

## 5. Vínculos de conductores que faltan

Detalle completo en `docs/integracion-android.md` (§1). Resumen:

| Vínculo | Cantidad | Estado |
|---|---|---|
| `conductores/{id}.uid` (UID de Auth) | **29 de 29 en `null`** | No hay ninguna cuenta de conductor creada |
| Cuentas de conductor en Authentication | **0** de las identificadas | Solo existe 1 cuenta, y es la del administrador |
| `salidas/{id}.conductorUid` | **144 de 144 en `null`** | Se completará al dar `uid` a los conductores |
| `usuarios/{uid}.conductorId` | **0** | El campo aún no existe |
| Colección `informes` | **0 documentos** | Aún no creada |

La correspondencia `driverId` ↔ conductor la comprobaba el script de auditoría de la
migración, pero **no se puede reverificar hoy en Firestore por la cuota**.

**No se asignó ningún UID automáticamente.** Hacerlo daría a una persona acceso a
las salidas de otra y a enviar informes falsos.

---

## 6. Decisiones que debo confirmar antes de programar Android

1. **Publicar las reglas.** `firestore.rules.propuesta` sigue sin publicar. ¿La
   revisás y la publicás vos desde la consola de Firebase? Hasta entonces el móvil
   no podrá leer nada.
2. **Catálogo de `resultado` de los informes**: ¿qué valores exactos? (p. ej.
   *Realizada* / *No realizada* / *Cancelada* / *Reagendada*). No los invento.
3. **Un informe por salida o varios por envío**, y si el conductor puede corregirlo.
4. **¿Campo `estado`?** (borrador/enviado/revisado) o basta con la existencia.
5. **Datos extra del informe**: ¿asistencia, hora real, incidencias? ¿Adjuntos
   (implicaría Firebase Storage, hoy no configurado)?
6. **Índices compuestos** en Firestore (ver `docs/integracion-android.md` §3.6):
   hay que crearlos o simplificar las consultas antes de publicar reglas.
7. **Cuota**: ¿el proyecto pasa a un plan de pago, o se espera al reinicio diario
   de la cuota gratuita para completar la verificación?
8. **Alta de cuentas de conductor**: ¿quién crea las cuentas de Authentication y
   cómo se verifica el vínculo con cada conductor (nombre/apellido)? Se necesita una
   **cuenta de prueba sin rol admin** para completar la prueba de rechazo por rol.

---

## 7. Archivos creados / modificados en este paso

- **Nuevo** `backend/scripts/verificar-gestor.js` — arnés de verificación real
  (solo lectura por defecto; escritura solo con `--con-escritura`).
- **Nuevo** `docs/integracion-android.md` — vínculos, `informes/{id}` y consultas.
- **Nuevo** `docs/informe-paso7.md` — este informe.
- **No se modificó** ningún archivo existente de funcionalidad.
- **No se tocó** `months.json`, ni se migró, ni se publicaron reglas.
