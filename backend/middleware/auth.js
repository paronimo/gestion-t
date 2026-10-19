// Verificación de la sesión de Firebase de los clientes (Android y web).
//
// El backend no tiene usuarios propios: las cuentas las administra Firebase
// Authentication desde su consola. El cliente inicia sesión con Firebase y
// envía el ID token en la cabecera "Authorization: Bearer <token>". Aquí se
// verifica ese token con el Admin SDK, que valida firma, emisor, audiencia
// (el proyecto), expiración y revocación.
//
// La cuenta de servicio se lee de FIREBASE_SERVICE_ACCOUNT (ruta al JSON) o de
// las variables FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.
// Las credenciales nunca salen del servidor.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let authInstance;

function credentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const account = JSON.parse(readFileSync(resolve(process.env.FIREBASE_SERVICE_ACCOUNT), 'utf8'));
    return { credential: cert(account), projectId: account.project_id };
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Las variables de entorno suelen guardar los saltos de línea como "\n".
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      projectId: process.env.FIREBASE_PROJECT_ID,
    };
  }
  return { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID };
}

function firebaseAuth() {
  if (authInstance) return authInstance;
  const app = getApps()[0] || initializeApp(credentials());
  authInstance = getAuth(app);
  return authInstance;
}

// Permite inyectar un verificador en las pruebas sin credenciales reales.
// Devuelve una función que recibe el token y resuelve con el usuario verificado.
export function verifierFromEnvironment() {
  if (process.env.FIREBASE_VERIFIER_MODULE) {
    return async (token) => {
      const verifier = await import(process.env.FIREBASE_VERIFIER_MODULE);
      return verifier.verify(token);
    };
  }
  return (token) => firebaseAuth().verifyIdToken(token, true);
}

function bearerToken(request) {
  const header = request.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

// Adjunta request.user = { uid, email, emailVerified } o responde 401.
export function requireAuth(verify = verifierFromEnvironment()) {
  return async (request, response, next) => {
    const token = bearerToken(request);
    if (!token) {
      response.status(401).json({ error: 'Falta la autenticación' });
      return;
    }

    try {
      const decoded = await verify(token);
      if (!decoded?.uid) {
        response.status(401).json({ error: 'Token de sesión no válido' });
        return;
      }
      request.user = {
        uid: decoded.uid,
        email: decoded.email || '',
        emailVerified: decoded.email_verified === true,
      };
      next();
    } catch {
      // Un token vencido, de otro proyecto o revocado no es un error del servidor.
      response.status(401).json({ error: 'Token de sesión no válido o vencido' });
    }
  };
}
