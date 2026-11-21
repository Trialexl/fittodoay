package com.fittodoay.android

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class ApiTest {
    @Test fun cancelledNavigationDoesNotWaitForDelayedHttpHeaders() = runBlocking {
        server.enqueue(MockResponse().setHeadersDelay(5, java.util.concurrent.TimeUnit.SECONDS).setBody("[]"))
        val request = launch { api.call("/api/programs/folders/") }
        assertNotNull(withContext(Dispatchers.IO) { server.takeRequest(3, java.util.concurrent.TimeUnit.SECONDS) })
        val start = System.nanoTime()
        request.cancelAndJoin()
        assertTrue("Cancelling a screen must cancel its socket promptly", (System.nanoTime() - start) / 1_000_000 < 1000)
    }
    @Test fun anOutboxPreflightMustNotUseAnOfflineCachedResponse() = runBlocking {
        val memory = object : ResponseStorage {
            override fun read(path: String): Any = obj("logs" to org.json.JSONArray())
            override fun write(path: String, value: Any) = Unit
            override fun remove(path: String) = Unit
            override fun recordMutation(path: String, method: String, body: org.json.JSONObject?, result: Any) = Unit
        }
        val offline = Api(server.url("/").toString(), storage = { memory }, networkAvailable = { false }) { "test-token" }
        try { offline.call("/api/workouts/plan/", useLocalFallback = false); fail("A cached plan is not proof that a server log is absent") }
        catch (_: LocalDataUnavailableException) { }
        assertEquals(0, server.requestCount)
    }
    @Test fun archiveFollowsRelativePagesAndKeepsAllItems() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"items":[{"id":4}],"next":"/api/llm-agent/threads/?cursor=older"}"""))
        server.enqueue(MockResponse().setBody("""{"items":[{"id":3},{"id":2}],"next":null}"""))
        assertEquals(listOf(4, 3, 2), api.all("/api/llm-agent/threads/").rows().map { it.getInt("id") })
        assertEquals("Token test-token", server.takeRequest().getHeader("Authorization"))
        assertEquals("/api/llm-agent/threads/?cursor=older", server.takeRequest().path)
    }
    @Test fun archiveRejectsForeignAndRepeatedPagesBeforeSendingToken() = runBlocking {
        for (next in listOf("https://foreign.example/api/llm-agent/threads/", "//foreign.example/api/llm-agent/threads/", "/api/profile/", "/api/llm-agent/threads/")) {
            server.enqueue(MockResponse().setBody(JSONObject().put("items", org.json.JSONArray()).put("next", next).toString()))
            try { api.all("/api/llm-agent/threads/"); fail("Untrusted pagination accepted") } catch (_: IllegalArgumentException) { }
            assertEquals("/api/llm-agent/threads/", server.takeRequest().path)
        }
        assertEquals(4, server.requestCount)
    }
    @Test fun musicBatchUsesRepeatedFilesPartsWithoutChangingTheApiContract() = runBlocking {
        val first = java.io.File.createTempFile("qa-a", ".mp3").apply { writeText("first") }
        val second = java.io.File.createTempFile("qa-b", ".mp3").apply { writeText("second") }
        try {
            // Audio normalization can exceed OkHttp's default ten-second read timeout.
            server.enqueue(MockResponse().setHeadersDelay(11, java.util.concurrent.TimeUnit.SECONDS).setResponseCode(201).setBody("{\"items\":[{\"id\":1},{\"id\":2}]}"))
            val result = api.uploadFiles("/api/workouts/music/tracks/upload/", "files", listOf(UploadFile("a.mp3", "audio/mpeg", first), UploadFile("b.mp3", "audio/mpeg", second)))
            assertEquals(2, result.rows().size)
            val request = server.takeRequest(); val body = request.body.readUtf8()
            assertTrue(body.contains("name=\"files\"; filename=\"a.mp3\"")); assertTrue(body.contains("name=\"files\"; filename=\"b.mp3\""))
            assertEquals("Token test-token", request.getHeader("Authorization"))
        } finally { first.delete(); second.delete() }
    }
    @Test fun idempotentPreferencePutCanRecoverFromConnectionLoss() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setBody("{\"theme\":\"dark\"}"))
        assertEquals("dark", (api.call("/api/profile/preferences/", "PUT", obj("theme" to "dark")) as JSONObject).text("theme"))
    }
    @Test fun interruptedReadCanRecoverWithoutRepeatingAMutation() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setBody("{\"id\":42}"))
        val result = api.call("/api/profile/") as JSONObject
        assertEquals(42, result.getInt("id"))
        assertTrue(server.requestCount >= 2)
    }
    private lateinit var server: MockWebServer
    private lateinit var api: Api
    @Before fun setup() { server = MockWebServer(); server.start(); api = Api(server.url("/").toString()) { "test-token" } }
    @After fun teardown() { server.shutdown() }

    @Test fun tokenAndJsonReachExistingBackendContract() = runBlocking {
        server.enqueue(MockResponse().setBody("{\"id\":12}"))
        api.call("/api/workouts/logs/", "POST", obj("workout_day" to 7, "template_exercise" to 9, "set_index" to 1, "actual_weight" to 22.5))
        val request = server.takeRequest()
        assertEquals("Token test-token", request.getHeader("Authorization"))
        assertEquals("POST", request.method)
        assertEquals("/api/workouts/logs/", request.path)
        val body = JSONObject(request.body.readUtf8())
        assertEquals(22.5, body.getDouble("actual_weight"), 0.0)
        assertEquals(7, body.getInt("workout_day"))
    }
    @Test fun unauthorizedIsDistinctFromOfflineAndPreservesFriendlyMessage() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("{\"detail\":\"Войдите снова\"}"))
        try { api.call("/api/profile/"); fail("Expected unauthorized") }
        catch (error: ApiException) { assertEquals(401, error.status); assertEquals("Войдите снова", error.message) }
    }
    @Test fun redirectsDoNotForwardTokenToAnotherOrigin() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", "https://example.org/"))
        try { api.call("/api/profile/"); fail("Redirect must not be followed") }
        catch (error: ApiException) { assertEquals(302, error.status) }
        assertEquals(1, server.requestCount)
    }
    @Test fun emptyDeleteResponseIsSuccessful() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        assertEquals(0, (api.call("/api/programs/folders/1/", "DELETE") as JSONObject).length())
        assertEquals("DELETE", server.takeRequest().method)
    }
    @Test fun collectionShapesMatchBothExistingApiFormats() = runBlocking {
        server.enqueue(MockResponse().setBody("[{\"id\":1}]"))
        server.enqueue(MockResponse().setBody("{\"items\":[{\"id\":2}]}"))
        assertEquals(1, api.call("/api/programs/folders/").rows().single().getInt("id"))
        assertEquals(2, api.call("/api/technique-reviews/").rows().single().getInt("id"))
    }
    @Test fun anonymousLoginDoesNotSendAnEmptyToken() = runBlocking {
        val anonymous = Api(server.url("/").toString()) { "" }
        server.enqueue(MockResponse().setBody("{\"token\":\"new-token\"}"))
        anonymous.call("/api/auth/login/", "POST", obj("email" to "test@example.com", "password" to "test-only"))
        assertNull(server.takeRequest().getHeader("Authorization"))
    }
    @Test fun htmlFromProxyCannotMasqueradeAsSavedChanges() = runBlocking {
        server.enqueue(MockResponse().setBody("<html>upstream error</html>"))
        try { api.call("/api/profile/"); fail("Malformed successful response must be rejected") }
        catch (error: ApiException) { assertEquals(502, error.status) }
    }
}
