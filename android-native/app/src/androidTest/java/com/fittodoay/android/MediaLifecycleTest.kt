package com.fittodoay.android

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.json.JSONArray
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File

class MediaLifecycleTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun preparePausedQueue() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("mediaPhase") == "prepare")
        val qa = QaHarness(compose); qa.guard(requireNetwork = false)
        val recorded = File(qa.directory, "media-process-before.json")
        // Reuse identifiers previously read from this server. This case checks paused
        // queue persistence while offline; real decoding is covered by MediaParityTest.
        val ids = if (recorded.exists()) JSONObject(recorded.readText()).optJSONArray("ids") else null
        val cached = if (ids != null) (0 until ids.length()).map { index -> val id = ids.getInt(index)
            obj("id" to id, "title" to "QA cached track $id", "url" to "/api/workouts/music/tracks/$id/file/") } else emptyList()
        val tracks = if (cached.size >= 2) cached.take(2) else {
            qa.waitRequest(); qa.navigate(Screen.Settings)
            qa.model.tracks.filter { it.text("source_type") == "file" }.take(2)
        }
        assertEquals(2, tracks.size)
        compose.runOnIdle { qa.model.audio.stop(); tracks.forEach { qa.model.audio.enqueue(it) }; qa.model.audio.shuffle = true; qa.model.audio.volume = .35f }
        compose.waitUntil(15_000) { qa.model.audio.queue.size == 2 && qa.model.audio.shuffle && kotlin.math.abs(qa.model.audio.volume - .35f) < .01 }
        qa.report("media-process-before", obj("ids" to JSONArray(tracks.map { it.optInt("id") })))
    }
    @Test fun verifyPausedQueueAfterProcessDeath() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("mediaPhase") == "verify")
        val qa = QaHarness(compose); qa.guard(preserveTimers = true, requireNetwork = false)
        val saved = JSONObject(File(qa.directory, "media-process-before.json").readText()).getJSONArray("ids")
        val expected = (0 until saved.length()).map { saved.getInt(it) }
        compose.waitUntil(15_000) { qa.model.audio.queue.map { it.first } == expected }
        assertTrue(qa.model.audio.shuffle)
        assertEquals(.35f, qa.model.audio.volume, .01f)
        assertFalse(qa.model.audio.playing)
        qa.report("media-process", obj("result" to "passed", "queue_count" to expected.size, "shuffle_restored" to true, "volume_restored" to true, "paused_on_restart" to true))
        compose.runOnIdle { qa.model.audio.stop() }
    }
}
