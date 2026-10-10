import { initializeApp } from "firebase/app";
<<<<<<< Updated upstream
<<<<<<< Updated upstream
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
=======
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
>>>>>>> Stashed changes
=======
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
>>>>>>> Stashed changes

const firebaseConfig = {
    apiKey: "AIzaSyCEzYZ7Rey7-g-Gpv92nP-VyGsuC2z98sI",
    authDomain: "gedistorio.firebaseapp.com",
    projectId: "gedistorio",
    storageBucket: "gedistorio.firebasestorage.app",
    messagingSenderId: "191499340564",
    appId: "1:191499340564:web:e4d977df9fae9d52ce9001",
    measurementId: "G-2WC5RWEVQG"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

<<<<<<< Updated upstream
<<<<<<< Updated upstream
export { db };
=======
=======
>>>>>>> Stashed changes
// Se exportan auth y db desde aquí para no volver a inicializar la app en otros archivos.
// Si ya usabas Firestore en otro lado, reemplazá ese uso por este mismo db.
export const auth = getAuth(app);
export const db = getFirestore(app);

<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
export default app;