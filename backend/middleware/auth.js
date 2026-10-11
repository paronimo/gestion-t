import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Autorización del backend con Firebase Authentication.
//
// Flujo de cada petición protegida:
//   1. Se lee el token del encabezado "Authorization: Bearer TOKEN".
//   2. Se verifica contra Firebase con el SDK de servidor (firebase-admin).
//   3. Se obtiene el UID del usuario ya verificado (no del cuerpo ni de la URL).
//   4. Se lee /usuarios/{uid} en Firestore.
//   5. Se exige que el campo "rol" sea exactamente "admin".
//
// Nada de esto confía en datos que mande React: el UID y el rol se leen del
// token verificado y de Firestore, nunca del request.

// El SDK de administrador es distinto del SDK web del frontend. Se inicializa
// una sola vez y solo aquí, para no crear varias aplicaciones.
let adminApp = null;

function loadServiceAccount() {
  // Se acepta la ruta a un archivo de cuenta de servicio *o* las credenciales
  // por partes. En ningún caso se sube nada de esto al repositorio.
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (filePath) {
    const absolute = resolve(filePath);
    const parsed = JSON.parse(readFileSync(absolute, 'utf8'));
    return cert(parsed);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Las claves suelen venir con "\n" literales; hay que convertirlos a saltos reales.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  // En Google Cloud (Cloud Run, App Engine, Functions) basta con esto.
  return applicationDefault();
}

function getAdminServices() {
  if (adminApp) return adminApp;

  if (getApps().length > 0) {
    adminApp = getApps()[0];
  } else {
    adminApp = initializeApp({ credential: loadServiceAccount() });
  }

  return adminApp;
}

// Separa "Bearer TOKEN" y devuelve solo el token, o null si el formato no sirve.
function tokenFromHeader(request) {
  const header = request.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

// Normaliza el rol igual que el frontend: tolera espacios, mayúsculas y comillas
// escritas por error. Sigue exigiendo exactamente "admin".
function roleOf(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '');
}

export async function requireAdmin(request, response, next) {
  const token = tokenFromHeader(request);

  if (!token) {
    return response.status(401).json({ error: 'Falta el token de sesión. Iniciá sesión de nuevo.' });
  }

  let decoded;
  try {
    decoded = await getAuth(getAdminServices()).verifyIdToken(token);
  } catch (error) {
    // Token vencido, alterado o de otro proyecto: en todos los casos, 401.
    const expired = error?.code === 'auth/id-token-expired';
    return response.status(401).json({
      error: expired
        ? 'La sesión venció. Iniciá sesión de nuevo.'
        : 'El token de sesión no es válido.',
    });
  }

  // El UID sale del token ya verificado, nunca del cuerpo de la petición.
  const uid = decoded.uid;

  try {
    const snapshot = await getFirestore(getAdminServices()).collection('usuarios').doc(uid).get();

    if (!snapshot.exists) {
      return response.status(403).json({ error: 'Tu cuenta no tiene perfil de administrador.' });
    }

    if (roleOf(snapshot.data()?.rol) !== 'admin') {
      return response.status(403).json({ error: 'Tu cuenta no tiene permisos de administrador.' });
    }

    // Datos ya verificados, disponibles para los controladores si hacen falta.
    request.user = { uid, email: decoded.email || null };
    next();
  } catch (error) {
    // Un fallo al leer Firestore NO autoriza: se responde error, no se deja pasar.
    // Se anota el código de error para poder diagnosticar sin exponer detalles al cliente.
    console.error('No se pudo verificar el rol del usuario:', error?.code || error?.message || error);

    // Un fallo de permisos de Firestore casi siempre significa que las reglas
    // todavía no permiten al SDK de administrador, o que la credencial no es válida.
    if (error?.code === 'permission-denied' || error?.code === 7) {
      return response.status(500).json({
        error: 'No se pudo leer tu perfil en Firestore. Revisá las reglas y las credenciales del servidor.',
      });
    }

    response.status(500).json({ error: 'No se pudo verificar el permiso. Intentá de nuevo.' });
  }
}
