import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';

// Traduce los códigos de error de Firebase a mensajes entendibles.
// No se revela si el correo existe o no: los dos casos dicen lo mismo.
function loginErrorMessage(error) {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'El correo no tiene un formato válido.';
    case 'auth/missing-password':
      return 'Escribí la contraseña.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Correo o contraseña incorrectos.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Esperá unos minutos y volvé a probar.';
    case 'auth/network-request-failed':
      return 'No se pudo conectar con Firebase. Revisá tu conexión a internet.';
    case 'auth/operation-not-allowed':
      return 'El inicio de sesión con correo y contraseña no está habilitado en Firebase.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
    case 'auth/argument-error':
      return 'La configuración de Firebase no es válida (revisá apiKey en src/firebase.js).';
    default:
      // Firebase devuelve códigos nuevos con el tiempo. Se reconoce por el texto
      // para no mostrar nunca el mensaje crudo en inglés.
      if (/invalid-api-key|api-key-not-valid/i.test(error?.code || error?.message || '')) {
        return 'La configuración de Firebase no es válida (revisá apiKey en src/firebase.js).';
      }
      return 'No se pudo iniciar sesión. Intentá de nuevo.';
  }
}

// Pantalla de inicio de sesión. Solo pide correo y contraseña y delega en Firebase.
// No crea usuarios ni perfiles: eso se administra desde la consola de Firebase.
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (sending) return;
    setError('');
    setSending(true);
    try {
      // Si sale bien, AuthGate detecta la sesión con onAuthStateChanged.
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (signInError) {
      setError(loginErrorMessage(signInError));
      setSending(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">Planificación mensual</p>
        <h1>Salidas de predicación</h1>
        <p className="login-note">Ingresá con tu cuenta para administrar el gestor.</p>

        <label className="field">
          <span>Correo electrónico</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="login-error" role="alert">{error}</p>}

        <button className="button button-primary login-submit" type="submit" disabled={sending} aria-busy={sending}>
          {sending && <span className="spinner" aria-hidden="true" />}
          {sending ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="login-hint">
          Las cuentas y el rol de cada usuario se administran desde la consola de Firebase.
        </p>
      </form>
    </main>
  );
}
