import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
const db = getFirestore(app);

export { db };
export default app;