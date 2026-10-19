package com.example.geditorio.data.reporte

import com.example.geditorio.data.ReporteError
import com.example.geditorio.data.model.ReporteSalida
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Resultado del envío de un reporte al backend web.
 *
 * [guardado] solo es true cuando el servidor respondio 200/201 con
 * "report" en el cuerpo: es decir, cuando el backend confirmo que lo guardo.
 */
data class EnvioReporte(
    val guardado: Boolean,
    val duplicado: Boolean,
    val salidaId: String,
    val recibidoEn: String,
    val error: ReporteError? = null
) {
    companion object {
        fun fallido(error: ReporteError) = EnvioReporte(
            guardado = false,
            duplicado = false,
            salidaId = "",
            recibidoEn = "",
            error = error
        )
    }
}

/**
 * Cliente HTTP del envio de reportes. No guarda credenciales: el token lo
 * entrega [com.example.geditorio.data.AuthRepository] en cada envio, porque
 * Firebase lo renueva solo cuando vence.
 *
 * El cuerpo que se manda es el mismo modelo [ReporteSalida] que ya usa la
 * pantalla. La fecha real, el tipo de salida y el turno los completa el
 * backend a partir de la salida del cronograma, asi que el celular no puede
 * inventarlos.
 */
class ReporteHttp(
    private val baseUrl: String,
    private val timeoutMs: Int = 15_000,
    private val conexion: (URL) -> HttpURLConnection = { url -> url.openConnection() as HttpURLConnection }
) {

    /** true cuando hay una URL de servidor configurada. */
    val configurada: Boolean
        get() = baseUrl.isNotBlank()

    /**
     * Envia el reporte.
     *
     * [claveIdempotencia] identifica el intento: si el celular reintenta el
     * mismo reporte (se perdio la respuesta, se apreto Enviar dos veces), el
     * backend devuelve el reporte ya guardado en lugar de crear otro.
     */
    suspend fun enviar(
        reporte: ReporteSalida,
        token: String,
        claveIdempotencia: String
    ): EnvioReporte = withContext(Dispatchers.IO) {
        if (!configurada) return@withContext EnvioReporte.fallido(ReporteError.SIN_CONFIGURAR)
        if (token.isBlank()) return@withContext EnvioReporte.fallido(ReporteError.SIN_SESION)

        val cuerpo = cuerpoJson(reporte)
        val url = URL(endpoint())
        var conexionAbierta: HttpURLConnection? = null

        try {
            val request = conexion(url).apply {
                requestMethod = "POST"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Idempotency-Key", claveIdempotencia)
            }
            conexionAbierta = request

            request.outputStream.use { salida ->
                salida.write(cuerpo.toByteArray(Charsets.UTF_8))
            }

            val codigo = request.responseCode
            when (codigo) {
                HttpURLConnection.HTTP_OK, HttpURLConnection.HTTP_CREATED -> leerGuardado(request, codigo)
                401, 403 -> EnvioReporte.fallido(ReporteError.SIN_AUTORIZACION)
                404 -> EnvioReporte.fallido(ReporteError.SALIDA_NO_ENCONTRADA)
                else -> EnvioReporte.fallido(ReporteError.SERVIDOR)
            }
        } catch (e: IOException) {
            // Sin red, servidor apagado, DNS o timeout: nunca es un envio exitoso.
            EnvioReporte.fallido(ReporteError.SIN_CONEXION)
        } catch (e: Exception) {
            EnvioReporte.fallido(ReporteError.GENERICO)
        } finally {
            conexionAbierta?.disconnect()
        }
    }

    private fun endpoint(): String = baseUrl.trimEnd('/') + "/api/reports"

    private fun leerGuardado(request: HttpURLConnection, codigo: Int): EnvioReporte {
        val texto = request.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        val json = try {
            JSONObject(texto)
        } catch (e: Exception) {
            // Un 2xx sin el reporte en el cuerpo no confirma nada: se trata como fallo.
            return EnvioReporte.fallido(ReporteError.SERVIDOR)
        }

        val report = json.optJSONObject("report")
            ?: return EnvioReporte.fallido(ReporteError.SERVIDOR)

        return EnvioReporte(
            guardado = true,
            duplicado = json.optBoolean("duplicate", false) || codigo == HttpURLConnection.HTTP_OK,
            salidaId = report.optString("salidaId"),
            recibidoEn = report.optString("receivedAt")
        )
    }

    companion object {
        /**
         * Cuerpo JSON del reporte, con el mismo formato que espera el backend.
         * Separado para poder probarlo sin red.
         */
        fun cuerpoJson(reporte: ReporteSalida): String {
            val json = JSONObject()
            json.put("salidaId", reporte.salidaId)
            json.put("realizada", reporte.realizada)
            json.put("observaciones", reporte.observaciones)
            json.put("territorioTexto", reporte.territorioTexto)
            return json.toString()
        }
    }
}
