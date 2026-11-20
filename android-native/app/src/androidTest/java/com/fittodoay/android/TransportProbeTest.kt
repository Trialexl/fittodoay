package com.fittodoay.android

import androidx.test.platform.app.InstrumentationRegistry
import okhttp3.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.Assume.assumeTrue
import java.io.File
import java.util.concurrent.TimeUnit

/** Read-only, unauthenticated diagnostic. Certificate and hostname validation stay enabled. */
class TransportProbeTest {
    @Test fun compareFreshModernTlsHandshakes() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("transportProbe") == "true")
        val result = JSONObject()
        for (mode in listOf("default", "tls12")) {
            val samples = JSONArray()
            repeat(4) {
                val client = OkHttpClient.Builder().protocols(listOf(Protocol.HTTP_1_1))
                    .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS)).callTimeout(12, TimeUnit.SECONDS)
                    .followRedirects(false).apply {
                        if (mode == "tls12") connectionSpecs(listOf(ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS).tlsVersions(TlsVersion.TLS_1_2).build()))
                    }.build()
                try {
                    client.newCall(Request.Builder().url(BuildConfig.SERVER_URL + "/api/exercises/").build()).execute().use {
                        samples.put(obj("http_status" to it.code, "tls" to it.handshake?.tlsVersion?.javaName))
                    }
                } catch (error: Exception) { samples.put(obj("error" to error.javaClass.simpleName)) }
                finally { client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown() }
            }
            result.put(mode, samples)
        }
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(context.filesDir, "extended-parity").apply { mkdirs() }
        File(directory, "transport-probe.json").writeText(result.toString(2))
    }
}
