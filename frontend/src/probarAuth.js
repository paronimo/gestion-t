import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export function probarAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log("No hay ningún usuario iniciado en Firebase.");
            return;
        }

        console.log("Usuario detectado.");
        console.log("UID:", user.uid);
        console.log("Email:", user.email);

        try {
            const documento = await getDoc(
                doc(db, "usuarios", user.uid)
            );

            if (!documento.exists()) {
                console.warn("El usuario existe en Authentication, pero no tiene perfil en Firestore.");
                return;
            }

            const datos = documento.data();

            console.log("Perfil de Firestore:", datos);
            console.log("Rol:", datos.rol);
            console.log("¿Es administrador?:", datos.rol === "admin");
        } catch (error) {
            console.error("Error al consultar el perfil:", error);
        }
    });
}