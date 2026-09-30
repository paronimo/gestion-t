import { initializeApp } from "firebase/app";

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "gedistorio.firebaseapp.com",
    projectId: "gedistorio",
    storageBucket: "gedistorio.firebasestorage.app",
    messagingSenderId: "191499340564",
    appId: "1:191499340564:web:e4d977df9fae9d52ce9001",
    measurementId: "G-2WC5RWEVQG"
};

const app = initializeApp(firebaseConfig);

export default app;