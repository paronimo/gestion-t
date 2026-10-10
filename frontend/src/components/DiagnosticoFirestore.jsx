import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import LoginScreen from './LoginScreen.jsx';

// DIAGNÓSTICO TEMPORAL. No forma parte del gestor: sirve para ver qué hay
// realmente en Firestore con la sesión iniciada. Se puede borrar cuando
// el acceso ya funcione.
// Se abre agregando #diagnostico a la URL: http://localhost:5173/#diagnostico

function describir(valor) {
  if (valor === undefined) return 'undefined';
  if (valor === null) return 'null';
  if (typeof valor === 'string') return `string = ${JSON.stringify(valor)}`;
  return `${typeof valor} = ${String(valor)}`;
}

export default function DiagnosticoFirestore() {
  const [user, setUser] = useState(undefined);
  const [reporte, setReporte] = useState(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  async function revisar() {
    if (!user) return;
    const resultado = { uid: user.uid, emailSesion: user.email };
    try {
      const propio = await getDoc(doc(db, 'usuarios', user.uid));
      resultado.miDocumento = propio.exists()
        ? { existe: true, campos: Object.fromEntries(Object.entries(propio.data()).map(([k, v]) => [k, describir(v)])) }
        : { existe: false };
    } catch (error) {
      resultado.miDocumento = { error: error.code || error.message };
    }
    try {
      const todos = await getDocs(collection(db, 'usuarios'));
      resultado.todosLosDocumentos = todos.docs.map((d) => ({
        id: d.id,
        coincideConMiUid: d.id === user.uid,
        campos: Object.fromEntries(Object.entries(d.data()).map(([k, v]) => [k, describir(v)])),
      }));
      resultado.total = todos.size;
    } catch (error) {
      resultado.todosLosDocumentos = { error: error.code || error.message };
    }
    setReporte(resultado);
  }

  if (user === undefined) {
    return <main className="auth-shell"><p className="auth-state">Cargando…</p></main>;
  }
  if (!user) return <LoginScreen />;

  return (
    <main className="auth-shell" style={{ alignItems: 'flex-start' }}>
      <section className="auth-card" style={{ width: 'min(900px, 100%)', textAlign: 'left' }}>
        <p className="eyebrow">Diagnóstico temporal</p>
        <h1>Firestore</h1>
        <p className="auth-message">
          Sesión: <strong>{user.email}</strong><br />
          UID: <code>{user.uid}</code>
        </p>
        <div className="auth-actions" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <button className="button button-primary" type="button" onClick={revisar}>Revisar Firestore</button>
          <button className="button button-quiet" type="button" onClick={() => signOut(auth)}>Cerrar sesión</button>
        </div>
        {reporte && (
          <pre style={{ marginTop: 20, padding: 16, overflow: 'auto', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}>
            {JSON.stringify(reporte, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
