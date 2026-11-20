package com.fittodoay.android

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue

/** Opt-in: uses the enrolled synthetic identity and downloads no music. */
class LocalDataLiveTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun serverDataAndExerciseImagesRemainInPrivateStorage() = runBlocking<Unit> {
        assumeTrue(InstrumentationRegistry.getArguments().getString("localDataLive") == "true")
        val qa = QaHarness(compose); qa.guard()
        compose.runOnIdle { qa.model.pauseLocalSync() }
        val token = SessionStore(qa.context).read()
        val store = LocalDataStore(qa.context, token)
        for (path in listOf("/api/profile/", "/api/profile/preferences/", "/api/programs/folders/", "/api/programs/templates/", "/api/exercises/", "/api/workouts/logs/", "/api/technique-reviews/")) {
            qa.model.api.call(path)
            assertNotNull("Not persisted: $path", LocalDataStore(qa.context, token).read(path))
        }
        val catalog = store.read("/api/exercises/")!!.rows()
        assertTrue(catalog.isNotEmpty())
        val images = catalog.flatMap { it.array("images") }.map { exerciseImageUrl(it.text("path")) }.distinct()
        assertTrue(images.isNotEmpty())
        val media = LocalMediaStore(qa.context, token)
        val file = media.image(images.first())
        assertTrue(file.isFile && file.length() > 0)
        val bitmap = android.graphics.BitmapFactory.decodeFile(file.absolutePath)
        assertNotNull("Stored response is not an exercise image", bitmap); bitmap?.recycle()
        assertEquals(file, LocalMediaStore(qa.context, token).existing(images.first()))
        assertTrue(store.paths("/api/workouts/music/").isEmpty())
        assertTrue(store.paths("/api/auth/").isEmpty())
        qa.report("local-data-live", obj("result" to "passed", "catalog_exercises" to catalog.size,
            "expected_images" to images.size, "images_on_device" to images.count { media.existing(it) != null },
            "saved_responses" to store.count(), "music_mirrored" to false,
            "full_sync_complete" to ((store.read("local:sync") as? org.json.JSONObject)?.optBoolean("complete") == true)))
    }
}
