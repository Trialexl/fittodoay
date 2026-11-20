package com.fittodoay.android

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class LocalDataPolicyTest {
    @Test fun failedArchiveRefreshKeepsCompletedCopyAndOfflineReadsAllPages() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val disk = Memory()
            val path = "/api/technique-reviews/"
            val api = Api(server.url("/").toString(), storage = { disk }) { "qa" }
            server.enqueue(MockResponse().setBody("""{"items":[{"id":2}],"next":"/api/technique-reviews/?cursor=old"}"""))
            server.enqueue(MockResponse().setBody("""{"items":[{"id":1}],"next":null}"""))
            assertEquals(2, api.all(path).rows().size)
            server.enqueue(MockResponse().setBody("""{"items":[{"id":3}],"next":"/api/technique-reviews/?cursor=old"}"""))
            server.enqueue(MockResponse().setResponseCode(503).setBody("{}"))
            assertEquals(listOf(2, 1), api.all(path).rows().map { it.getInt("id") })
            val offline = Api(server.url("/").toString(), storage = { disk }, networkAvailable = { false }) { "qa" }
            assertEquals(listOf(2, 1), offline.all(path).rows().map { it.getInt("id") })
            assertEquals(4, server.requestCount)
        } finally { server.shutdown() }
    }
    @Test fun missingOfflineDataIsReportedWithoutPretendingTheCollectionIsEmpty() = runBlocking {
        val api = Api("https://unused.invalid", storage = { Memory() }, networkAvailable = { false }) { "qa" }
        try { api.call("/api/profile/"); fail("Expected a missing local copy") } catch (_: LocalDataUnavailableException) { }
    }
    @Test fun aggregateExerciseStatisticsAreNotInventedForAnUncachedPeriod() {
        val allTime = obj("items" to JSONArray().put(obj("exercise" to 1, "load" to 1000)))
        assertNull(localQuery("/api/analytics/exercises/?start=2026-11-20&end=2026-11-20") { allTime })
    }
    @Test fun automaticResumeRetriesTemporaryFailuresButNotMissingRoutesOrStorageErrors() {
        assertTrue(isTransientLocalFailure(java.net.SocketTimeoutException()))
        assertTrue(isTransientLocalFailure(ApiException(503, "temporary")))
        assertTrue(isTransientLocalFailure(ApiException(429, "temporary")))
        assertFalse(isTransientLocalFailure(ApiException(404, "missing")))
        assertFalse(isTransientLocalFailure(ApiException(401, "revoked")))
        assertFalse(isTransientLocalFailure(LocalStorageException("full")))
    }
    private class Memory : ResponseStorage {
        val values = mutableMapOf<String, String>()
        override fun read(path: String): Any? = values[path]?.let(::parseStoredJson)
        override fun write(path: String, value: Any) { values[path] = value.toString() }
        override fun remove(path: String) { values.remove(path) }
        override fun recordMutation(path: String, method: String, body: JSONObject?, result: Any) { write("$method:$path", result) }
    }
    @Test fun successfulReadsAreDurableAndOnlineRefreshReplacesThem() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val disk = Memory()
            val api = Api(server.url("/").toString(), storage = { disk }) { "qa" }
            server.enqueue(MockResponse().setBody("{\"age\":30}")); api.call("/api/profile/")
            server.enqueue(MockResponse().setBody("{\"age\":31}")); api.call("/api/profile/")
            assertEquals(31, (disk.read("/api/profile/") as JSONObject).getInt("age"))
            assertEquals(2, server.requestCount)
        } finally { server.shutdown() }
    }
    @Test fun offlineReadDoesNotAttemptHttpAndCanBeOpenedByANewApi() = runBlocking {
        val disk = Memory().apply { write("/api/profile/", obj("age" to 30)) }
        var readFromDevice = false
        val api = Api("https://unused.invalid", storage = { disk }, networkAvailable = { false }, onLocalRead = { readFromDevice = true }) { "qa" }
        assertEquals(30, (api.call("/api/profile/") as JSONObject).getInt("age"))
        assertTrue(readFromDevice)
    }
    @Test fun unauthorizedAndMissingRoutesCannotBeHiddenByOldData() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val disk = Memory().apply { write("/api/profile/", obj("age" to 30)) }
            val api = Api(server.url("/").toString(), storage = { disk }) { "qa" }
            for (status in listOf(401, 403, 404)) {
                server.enqueue(MockResponse().setResponseCode(status).setBody("{\"detail\":\"unavailable\"}"))
                try { api.call("/api/profile/"); fail("Must preserve HTTP $status") } catch (error: ApiException) { assertEquals(status, error.status) }
            }
        } finally { server.shutdown() }
    }
    @Test fun temporaryServerFailureCanUseTheLastSavedResponse() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val disk = Memory().apply { write("/api/profile/", obj("age" to 30)) }
            val api = Api(server.url("/").toString(), storage = { disk }) { "qa" }
            server.enqueue(MockResponse().setResponseCode(503).setBody("{}"))
            assertEquals(30, (api.call("/api/profile/") as JSONObject).getInt("age"))
        } finally { server.shutdown() }
    }
    @Test fun neitherMusicNorAuthenticationResponsesAreStored() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val disk = Memory(); val api = Api(server.url("/").toString(), storage = { disk }) { "qa" }
            server.enqueue(MockResponse().setBody("{\"token\":\"never-store\"}")); api.call("/api/auth/login/", "POST", obj("password" to "never-store"))
            server.enqueue(MockResponse().setBody("[]")); api.call("/api/workouts/music/tracks/")
            assertTrue(disk.values.isEmpty())
        } finally { server.shutdown() }
    }
    @Test fun catalogSearchAndFolderFilterWorkWithoutPreviouslyOpeningThoseQueries() {
        val values = mapOf("/api/exercises/" to JSONArray().put(obj("id" to "a", "name" to "Жим гантелей")).put(obj("id" to "b", "name" to "Приседания")),
            "/api/programs/templates/" to JSONArray().put(obj("id" to 1, "folder" to 10)).put(obj("id" to 2, "folder" to 20)))
        assertEquals("a", localQuery("/api/exercises/?q=%D0%B3%D0%B0%D0%BD%D1%82%D0%B5%D0%BB", values::get)!!.rows().single().text("id"))
        assertEquals(2, localQuery("/api/programs/templates/?folder=20", values::get)!!.rows().single().getInt("id"))
    }
    @Test fun explicitDateRangeUsesTheCompleteLocalHistory() {
        val all = obj("items" to JSONArray().put(obj("date" to "2026-10-01", "weight_kg" to 80)).put(obj("date" to "2026-11-20", "weight_kg" to 81)))
        val result = localQuery("/api/analytics/body-weight/?start=2026-11-20&end=2026-11-20") { if (it == "local:all:/api/analytics/body-weight/") all else null }
        assertEquals(81, result!!.rows().single().getInt("weight_kg"))
    }
}
