import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import DiagnosticoFirestore from './components/DiagnosticoFirestore.jsx';

// Página de diagnóstico temporal: se abre solo con #diagnostico en la URL.
// La app normal no cambia en absoluto.
const mostrarDiagnostico = window.location.hash === '#diagnostico';

createRoot(document.getElementById('root')).render(
  <StrictMode>{mostrarDiagnostico ? <DiagnosticoFirestore /> : <App />}</StrictMode>,
);