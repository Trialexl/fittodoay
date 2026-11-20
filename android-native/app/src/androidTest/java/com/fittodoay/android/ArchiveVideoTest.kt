package com.fittodoay.android

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

/** Real HTTPS bytes -> private files -> reopened store, with a test-only CA. */
class ArchiveVideoTest {
    @Test fun oldVideoIsDownloadedOnceSurvivesReopenAndCanBeDeleted() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val certificate = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
        val serverTls = HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val trusted = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val transport = OkHttpClient.Builder().proxy(java.net.Proxy.NO_PROXY).sslSocketFactory(trusted.sslSocketFactory(), trusted.trustManager)
            .followRedirects(false).followSslRedirects(false).build()
        val server = MockWebServer().apply { useHttps(serverTls.sslSocketFactory(), false); start() }
        val token = "archive-video-test:${UUID.randomUUID()}"
        try {
            val bytes = InstrumentationRegistry.getInstrumentation().context.assets.open("qa-technique.mp4").use { it.readBytes() }
            server.enqueue(MockResponse().setHeader("Content-Type", "video/mp4").setBody(okio.Buffer().write(bytes)))
            val review = obj("id" to 123, "video_url" to "/api/technique-reviews/123/video/", "video_filename" to "original.mp4")
            val store = LocalMediaStore(context, token, server.url("/").toString(), transport)
            val file = store.downloadReviewVideo(review)
            assertArrayEquals(bytes, file.readBytes())
            val request = server.takeRequest()
            assertEquals("/api/technique-reviews/123/video/", request.path)
            assertEquals("Token $token", request.getHeader("Authorization"))
            assertArrayEquals(bytes, LocalMediaStore(context, token).reviewVideo(123)!!.readBytes())
            assertEquals(file, store.downloadReviewVideo(review))
            assertEquals(1, server.requestCount)
            assertNull(LocalMediaStore(context, "other:$token").reviewVideo(123))
            val retriever = android.media.MediaMetadataRetriever()
            try { retriever.setDataSource(file.absolutePath); assertNotNull(retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)) }
            finally { retriever.release() }
            store.removeReviewVideo(123)
            assertNull(store.reviewVideo(123)); assertFalse(file.exists())
            try { store.downloadReviewVideo(obj("id" to 124, "video_url" to "https://foreign.example/video.mp4")); fail("Foreign URL accepted") }
            catch (_: IllegalArgumentException) { }
            assertEquals(1, server.requestCount)
        } finally { server.shutdown() }
    }
}
