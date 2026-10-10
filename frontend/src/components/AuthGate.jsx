import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import LoginScreen from './LoginScreen.jsx';

// Códigos de error de Firebase Auth traducidos. Si la sesión guardada ya no sirve
// (usuario borrado o contraseña cambiada), hay que volver a la pantalla de ingreso.
function authErrorMessage(error) {
  switch (error?.code) {
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Esperá unos minutos y volvé a probar.';
    case 'auth/invalid-credential':
    case 'auth/user-token-expired':
    case 'auth/user-disabled':
    case 'auth/user-not-found':
      return 'La sesión guardada ya no es válida. Iniciá sesión de nuevo.';
    case 'auth/network-request-failed':
      return 'No se pudo conectar con Firebase. Revisá tu conexión a internet.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
    case 'auth/argument-error':
      return 'La configuración de Firebase no es válida (revisá apiKey en src/firebase.js).';
    default:
      // Firebase agrega códigos nuevos con el tiempo. Se reconoce por el texto
      // para no mostrar nunca el mensaje crudo en inglés.
      if (/invalid-api-key|api-key-not-valid/i.test(error?.code || error?.message || '')) {
        return 'La configuración de Firebase no es válida (revisá apiKey en src/firebase.js).';
      }
      return 'No se pudo iniciar sesión. Intentá de nuevo.';
  }
}

// Normaliza un campo de Firestore para compararlo sin sorpresas:
// - convierte a texto (tolera que el valor no sea string),
// - quita espacios de los costados,
// - pasa a minúsculas,
// - quita comillas literales si se escribieron por error ("admin" -> admin).
function normalizeField(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '');
}

// Describe lo que realmente se leyó del documento, para que el mensaje de error
// diga el valor y el tipo en lugar de dejar al usuario adivinando.
function describeField(name, value) {
  if (value === undefined) return ` (El documento no tiene el campo "${name}".)`;
  if (value === null) return ` (El campo "${name}" está vacío.)`;
  const type = typeof value;
  if (type !== 'string') return ` (El campo "${name}" no es texto, es de tipo ${type}.)`;
  return ` (Se leyó "${name}": ${JSON.stringify(value)}.)`;
}

// Arranca el estado antes de la primera respuesta de Firebase.
function initialStatus() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'offline', user: null, role: null };
  }
  return { kind: 'loading', user: null, role: null };
}

function authErrorStatus(error) {
  const offline = error?.code === 'auth/network-request-failed'
    || (typeof navigator !== 'undefined' && navigator.onLine === false);
  return offline
    ? { kind: 'offline', user: null, role: null }
    : { kind: 'error', message: authErrorMessage(error), user: null, role: null };
}

async function logoutAndReturn(after) {
  await signOut(auth).catch(() => {});
  return after;
}

// Decide qué se muestra: el login, un aviso claro, o los niños (el gestor).
// La sesión sobrevive a la recarga porque Firebase lee su propia persistencia;
// no se guarda nada aparte.
export default function AuthGate({ children }) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    let active = true;

    // onAuthStateChanged se dispara al cargar y cada vez que cambia la sesión.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      if (!user) {
        setStatus({ kind: 'signedOut', user: null, role: null });
        return;
      }

      (async () => {
        try {
          // Solo identifica al usuario logueado. No crea documentos ni asigna roles.
          const snapshot = await getDoc(doc(db, 'usuarios', user.uid));
          if (!active) return;

          if (!snapshot.exists()) {
            const next = await logoutAndReturn({
              kind: 'noProfile',
              message: 'Tu cuenta no tiene un perfil en /usuarios. Pedí a un administrador que lo cree y volvé a intentar.',
              user: null,
              role: null,
            });
            if (!active) return;
            setStatus(next);
            return;
          }

          const data = snapshot.data() || {};

          // El campo `rol` decide el acceso. Se normaliza para tolerar "admin",
          // "Admin" o " admin ", y también comillas literales escritas por error
          // ("\"admin\""), sin abrir la puerta a otros valores.
          const role = normalizeField(data.rol);
          if (role !== 'admin') {
            const next = await logoutAndReturn({
              kind: 'notAdmin',
              // El detalle muestra QUÉ se leyó de verdad, para no tener que adivinar.
              message: `Tu cuenta existe, pero no tiene rol de administrador. Solo un administrador puede entrar al gestor.${describeField('rol', data.rol)}`,
              user: null,
              role: null,
            });
            if (!active) return;
            setStatus(next);
            return;
          }

          // Comprobación cruzada: el `email` del documento debe coincidir con el
          // de la sesión. El correo de la sesión lo entrega Firebase, nunca el formulario.
          const documentEmail = normalizeField(data.email);
          const sessionEmail = normalizeField(user.email);
          if (documentEmail && sessionEmail && documentEmail !== sessionEmail) {
            const next = await logoutAndReturn({
              kind: 'mismatch',
              message: `Tu perfil no coincide con la cuenta con la que iniciaste sesión. El documento dice "${documentEmail}" y la sesión es "${sessionEmail}". Revisá el documento en /usuarios.`,
              user: null,
              role: null,
            });
            if (!active) return;
            setStatus(next);
            return;
          }

          setStatus({ kind: 'ready', user, role, profile: data });
        } catch (error) {
          if (!active) return;
          // Permisos de Firestore o red: se cierra la sesión y se avisa.
          await signOut(auth).catch(() => {});
          const next = authErrorStatus(error);
          if (next.kind === 'error') {
            next.message = error?.code === 'permission-denied'
              ? 'No se pudo leer tu perfil. Revisá que las reglas de Firestore permitan leer /usuarios/{uid} al usuario logueado.'
              : next.message;
          }
          if (!active) return;
          setStatus(next);
        }
      })();
    });

    function handleOnline() {
      if (auth.currentUser) return;
      setStatus((current) => (current.kind === 'offline' ? initialStatus() : current));
    }
    function handleOffline() {
      setStatus((current) => (current.kind === 'offline' ? current : { kind: 'offline', user: null, role: null }));
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (status.kind === 'loading') {
    return <main className="auth-shell"><p className="auth-state">Verificando sesión…</p></main>;
  }

  if (status.kind === 'signedOut') {
    return <LoginScreen />;
  }

  if (status.kind === 'offline') {
    return (
      <main className="auth-shell">
        <section className="auth-card" role="alert">
          <p className="eyebrow">Sin conexión</p>
          <h1>No se pudo verificar la sesión</h1>
          <p className="auth-message">
            Firebase Authentication necesita internet la primera vez para restaurar tu sesión.
            Revisá la conexión y reintentá.
          </p>
          <div className="auth-actions">
            <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (status.kind === 'noProfile' || status.kind === 'notAdmin' || status.kind === 'mismatch') {
    const titles = {
      noProfile: 'Tu cuenta no tiene perfil',
      notAdmin: 'No sos administrador',
      mismatch: 'El perfil no coincide',
    };
    return (
      <main className="auth-shell">
        <section className="auth-card" role="alert">
          <p className="eyebrow">Acceso restringido</p>
          <h1>{titles[status.kind]}</h1>
          <p className="auth-message">{status.message}</p>
          <div className="auth-actions">
            <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
              Volver a intentar
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (status.kind === 'error') {
    return (
      <main className="auth-shell">
        <section className="auth-card" role="alert">
          <p className="eyebrow">No se pudo entrar</p>
          <h1>Ocurrió un problema</h1>
          <p className="auth-message">{status.message}</p>
          <p className="auth-hint">
            Si sos administrador, puede ser un problema de reglas de Firestore o de conexión.
          </p>
          <div className="auth-actions">
            <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        </section>
      </main>
    );
  }

  return children;
}
