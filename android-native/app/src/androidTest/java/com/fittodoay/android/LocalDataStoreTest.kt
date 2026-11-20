package com.fittodoay.android

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

class LocalDataStoreTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun responsesSurviveNewStoreAndAreIsolatedBetweenAccounts() {
        val account = "local-store-test:${UUID.randomUUID()}"
        val first = LocalDataStore(context, account)
        first.write("/api/profile/", obj("weight_kg" to 81.25))
        assertEquals(81.25, (LocalDataStore(context, account).read("/api/profile/") as JSONObject).getDouble("weight_kg"), 0.001)
        assertNull(LocalDataStore(context, "other:$account").read("/api/profile/"))
        first.remove("/api/profile/")
    }
    @Test fun deletedRecordsCannotReappearFromTheirCachedCollection() {
        val store = LocalDataStore(context, "local-store-test:${UUID.randomUUID()}")
        store.write("/api/programs/folders/", JSONArray().put(obj("id" to 1)).put(obj("id" to 2)))
        store.write("/api/programs/folders/1/", obj("id" to 1))
        store.recordMutation("/api/programs/folders/1/", "DELETE", null, JSONObject())
        assertNull(store.read("/api/programs/folders/1/"))
        assertEquals(2, store.read("/api/programs/folders/")!!.rows().single().getInt("id"))
        store.remove("/api/programs/folders/")
    }
    @Test fun authenticationAndMusicCannotEnterTheDatabase() {
        val store = LocalDataStore(context, "local-store-test:${UUID.randomUUID()}")
        for (path in listOf("/api/auth/login/", "/api/workouts/music/tracks/")) {
            try { store.write(path, obj("token" to "must-not-be-written")); fail("Excluded data was accepted") }
            catch (_: IllegalArgumentException) { }
            assertNull(store.read(path))
        }
    }
    @Test fun originalVideoSurvivesTemporaryUploadFileRemovalAndAudioIsRejected() {
        val token = "local-media-test:${UUID.randomUUID()}"
        val temporary = File.createTempFile("local-video-test", ".mp4", context.cacheDir)
        InstrumentationRegistry.getInstrumentation().context.assets.open("qa-technique.mp4").use { input -> temporary.outputStream().use { input.copyTo(it) } }
        val expected = temporary.readBytes()
        val kept = LocalMediaStore(context, token).preserveVideo("review:qa", temporary, "video/mp4")
        temporary.delete()
        assertArrayEquals(expected, LocalMediaStore(context, token).existing("review:qa")!!.readBytes())
        assertNull(LocalMediaStore(context, "other:$token").existing("review:qa"))
        try { LocalMediaStore(context, token).preserveVideo("music", kept, "audio/mpeg"); fail("Audio must not be copied") } catch (_: IllegalArgumentException) { }
        LocalDataStore(context, token).write("local:video:123", obj("file" to kept.name, "media_key" to "review:qa"))
        LocalMediaStore(context, token).removeReviewVideo(123)
        assertFalse(kept.exists())
        assertNull(LocalMediaStore(context, token).existing("review:qa"))
    }
}
