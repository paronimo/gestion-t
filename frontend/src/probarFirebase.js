import { db } from "./firebase";
import {
    collection,
    addDoc,
    getDocs
} from "firebase/firestore";

export async function probarFirebase() {
    try {
        // Guardar un documento de prueba
        const documento = await addDoc(collection(db, "prueba"), {
            mensaje: "Firebase funciona",
            fecha: new Date().toISOString()
        });

        console.log("Documento guardado con ID:", documento.id);

        // Leer los documentos guardados
        const resultado = await getDocs(collection(db, "prueba"));

        resultado.forEach((documento) => {
            console.log("Documento leído:", documento.data());
        });

    } catch (error) {
        console.error("Error al probar Firebase:", error);
    }
}