package com.fittodoay.android

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.util.UUID

class MediaParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val qa by lazy { QaHarness(compose) }
    private val device get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    @Before fun guard() { assumeTrue(InstrumentationRegistry.getArguments().getString("mediaParity") == "true"); qa.guard() }
    @Test fun radioFromServerCatalogPlaysAndPausesNatively() {
        qa.navigate(Screen.Settings)
        val track = qa.model.tracks.first { it.text("source_type") == "stream" }
        try {
            compose.runOnIdle { qa.model.audio.stop() }
            qa.visible(hasContentDescription("Источник"), "source menu").performClick()
            compose.onNodeWithText("Радио", substring = false).performClick()
            qa.visible(hasText(track.text("title", track.text("name")), substring = true) and hasClickAction() and hasAnyAncestor(hasTestTag("music-track-${track.getInt("id")}")), "server radio track").performClick()
            compose.waitUntil(60_000) { qa.model.audio.playing || qa.model.audio.error != null }
            qa.report("radio", obj("playing" to qa.model.audio.playing, "error" to qa.model.audio.error, "track_id" to track.getInt("id")))
            assertNull(qa.model.audio.error); assertTrue(qa.model.audio.playing)
            qa.capture("radio-playing")
            compose.onNodeWithContentDescription("Пауза или воспроизведение").performClick()
            compose.waitUntil(10_000) { !qa.model.audio.playing }
            qa.report("radio", obj("result" to "passed", "track_id" to track.getInt("id"), "native_playback" to true))
        } finally { compose.runOnIdle { qa.model.audio.stop() } }
    }
    private fun document(name: String, asset: String, mime: String): Uri {
        val resolver = qa.context.contentResolver
        val values = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, name); put(MediaStore.Downloads.MIME_TYPE, mime); put(MediaStore.Downloads.IS_PENDING, 1) }
        val uri = requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        resolver.openOutputStream(uri)!!.use { output -> InstrumentationRegistry.getInstrumentation().context.assets.open(asset).use { it.copyTo(output) } }
        resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
        return uri
    }
    private fun upload(button: String, name: String) {
        compose.runOnIdle { qa.model.notice = null; qa.model.error = null }
        qa.visible(button).performClick()
        check(device.wait(Until.hasObject(By.pkg("com.google.android.documentsui")), 8000)) { "Android document picker did not open" }
        var file = device.wait(Until.findObject(By.textContains(name)), 5000)
        if (file == null) {
            val roots = device.wait(Until.findObject(By.desc("Show roots")), 8000)
                ?: error("Document picker roots button is unavailable")
            device.waitForIdle(1000)
            val rootsBounds = roots.visibleBounds
            device.click(rootsBounds.centerX(), rootsBounds.centerY())
            val downloads = device.wait(Until.findObject(By.text("Downloads")), 8000)
                ?: error("Document picker Downloads root is unavailable")
            val downloadsBounds = downloads.visibleBounds
            device.click(downloadsBounds.centerX(), downloadsBounds.centerY())
            file = device.wait(Until.findObject(By.textContains(name)), 15_000)
        }
        if (file == null) { device.dumpWindowHierarchy(java.io.File(qa.directory, "picker.xml")); error("File not found in Android picker: $name") }
        device.waitForIdle(1500)
        val currentFile = device.findObject(UiSelector().textContains(name))
        check(currentFile.waitForExists(8000)) { "File disappeared from Android picker: $name" }
        val bounds = currentFile.visibleBounds
        check(device.click(bounds.centerX(), bounds.centerY())) { "Android picker did not accept the file" }
        // DocumentsUI can retain an explicit OPEN confirmation after a previous
        // multi-file selection. Verify return to our activity before waiting on HTTP.
        device.wait(Until.findObject(By.res("com.google.android.documentsui", "action_menu_select")), 1500)?.click()
        try {
            check(device.wait(Until.gone(By.pkg("com.google.android.documentsui")), 10_000)) { "Document picker did not return the selected file" }
            if (button == "Выбрать видео") {
                // V2 separates file selection from submitting the analysis, as the web does.
                compose.waitUntil(20_000) { compose.onAllNodes(hasText("Загрузить и разобрать", substring = false) and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
                qa.visible("Загрузить и разобрать").performClick()
            }
            compose.waitUntil(20_000) { qa.model.busy || qa.model.notice != null || qa.model.error != null }
            compose.waitUntil(240_000) { qa.model.notice?.startsWith("Файл загружен") == true || qa.model.error != null }
        } catch (error: Throwable) {
            qa.capture("upload-selection-failure")
            device.dumpWindowHierarchy(java.io.File(qa.directory, "upload-selection-failure.xml"))
            qa.report("upload-selection-failure", obj("package" to device.currentPackageName, "busy" to qa.model.busy, "notice" to qa.model.notice, "error" to qa.model.error))
            throw error
        }
        qa.waitRequest()
    }
    @Test fun globalPlaylistUploadsWithoutLeavingTheWorkout() = runBlocking<Unit> {
        qa.navigate(Screen.Workout)
        val name = "android-qa-sheet-${UUID.randomUUID().toString().take(8)}.mp3"
        val before = qa.api.call("/api/workouts/music/tracks/").rows().map { it.getInt("id") }.toSet()
        val uri = document(name, "qa-music.mp3", "audio/mpeg")
        var uploadedId: Int? = null
        try {
            compose.onNodeWithContentDescription("Плейлист").performClick()
            compose.onNodeWithText("Добавить музыку", substring = false).performClick()
            upload("Загрузить MP3", name)
            val uploaded = qa.model.tracks.single { it.getInt("id") !in before }
            uploadedId = uploaded.getInt("id")
            assertEquals(Screen.Workout, qa.model.screen)
            compose.onNodeWithTag("playlist-sheet").assertIsDisplayed()
            qa.capture("global-playlist-upload")
            compose.onNodeWithContentDescription("Закрыть").performClick()
            qa.report("global-playlist-upload", obj("result" to "passed", "remained_on_workout" to true, "native_picker_and_server_upload" to true))
        } finally {
            if (compose.onAllNodesWithTag("playlist-sheet").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithContentDescription("Закрыть").performClick()
            uploadedId?.let { qa.api.call("/api/workouts/music/tracks/$it/", "DELETE") }
            qa.context.contentResolver.delete(uri, null, null)
        }
    }
    @Test fun uploadQueueSeekShuffleAndBackgroundPlayback() = runBlocking<Unit> {
        qa.navigate(Screen.Settings)
        val prefix = "android-qa-${UUID.randomUUID().toString().take(8)}"
        val a = "$prefix-a.mp3"; val b = "$prefix-b.mp3"
        val documents = listOf(document(a, "qa-music.mp3", "audio/mpeg"), document(b, "qa-music.mp3", "audio/mpeg"))
        val before = qa.model.tracks.map { it.getInt("id") }.toSet()
        val created = mutableListOf<JSONObject>()
        try {
            compose.runOnIdle { qa.model.audio.stop() }
            for (name in listOf(a, b)) {
                upload("Загрузить MP3", name)
                val track = qa.model.tracks.first { it.getInt("id") !in before && created.none { previous -> previous.optInt("id") == it.optInt("id") } }
                created += track
            }
            assertEquals(2, created.size)
            qa.visible(hasContentDescription("Источник"), "source menu").performClick()
            compose.onNodeWithText("Файлы", substring = false).performClick()
            for (track in created) {
                qa.visible(hasContentDescription("Действия с треком: ${track.text("title", track.text("name"))}") and hasAnyAncestor(hasTestTag("music-track-${track.getInt("id")}")), "track actions").performClick()
                compose.onNodeWithText("В очередь", substring = false).performClick()
            }
            compose.waitUntil(20_000) { qa.model.audio.queue.size == 2 }
            compose.onNodeWithContentDescription("Пауза или воспроизведение").performClick()
            compose.waitUntil(30_000) { qa.model.audio.playing || qa.model.audio.error != null }
            assertNull(qa.model.audio.error); assertTrue(qa.model.audio.playing)
            compose.waitUntil(15_000) { qa.model.audio.durationMs > 0 }
            qa.visible(hasTestTag("music-seek"), "seek slider").performTouchInput { click(center) }
            compose.waitUntil(15_000) { qa.model.audio.positionMs > 40_000 }
            val expectedShuffle = !qa.model.audio.shuffle
            qa.visible(hasTestTag("music-shuffle"), "shuffle").performClick()
            compose.waitUntil(10_000) { qa.model.audio.shuffle == expectedShuffle }
            qa.capture("music-controls")
            val position = qa.model.audio.positionMs
            device.pressHome()
            compose.waitUntil(10_000) { qa.model.audio.positionMs > position + 1500 }
            val running = qa.context.getSystemService(android.app.ActivityManager::class.java).getRunningServices(100)
            assertTrue(running.any { it.service.className == PlaybackService::class.java.name && it.foreground })
            qa.context.startActivity(Intent(qa.context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP))
            compose.waitForIdle(); qa.capture("music-after-background")
            compose.onNodeWithContentDescription("Пауза или воспроизведение").performClick()
            compose.waitUntil(10_000) { !qa.model.audio.playing }
            qa.report("music", obj("result" to "passed", "uploaded_tracks" to created.size, "queue_size" to qa.model.audio.queue.size, "seek_position_ms" to qa.model.audio.positionMs, "foreground_service" to true))
        } finally {
            compose.runOnIdle { qa.model.audio.stop() }
            for (track in created) qa.api.call("/api/workouts/music/tracks/${track.getInt("id")}/", "DELETE")
            for (uri in documents) qa.context.contentResolver.delete(uri, null, null)
        }
    }
    @Test fun realVideoUploadAnalysisHistoryDetailsAndDeletion() = runBlocking<Unit> {
        qa.navigate(Screen.Technique)
        val name = "android-qa-technique-${UUID.randomUUID().toString().take(8)}.mp4"
        val uri = document(name, "qa-technique-real.mp4", "video/mp4")
        val before = qa.model.reviews.map { it.getInt("id") }.toSet()
        var reviewId: Int? = null
        try {
            upload("Выбрать видео", name)
            val created = qa.model.reviews.first { it.optInt("id") !in before }; reviewId = created.getInt("id")
            compose.waitUntil(240_000) { qa.model.reviews.firstOrNull { it.optInt("id") == reviewId }?.text("status") != "processing" }
            val review = qa.model.reviews.first { it.optInt("id") == reviewId }
            qa.capture("technique-analysis")
            qa.report("technique", obj("status" to review.text("status"), "review_id" to reviewId, "error_code" to review.text("error_code"), "summary" to review.text("summary")))
            assertTrue("Analysis failed: ${review.text("error_code")}: ${review.text("summary")}", review.text("status") in listOf("completed", "needs_confirmation"))
            qa.visible(hasText("Подробнее", substring = false) and hasAnyAncestor(hasTestTag("technique-review-$reviewId")), "review details").performClick()
            compose.onNodeWithText("Результат проверки").assertIsDisplayed(); qa.capture("technique-details")
            compose.onNodeWithText("Закрыть", substring = false).performClick()
            qa.visible(hasText("Удалить", substring = false) and hasAnyAncestor(hasTestTag("technique-review-$reviewId")), "delete own review").performClick()
            compose.onNode(hasText("Удалить", substring = false) and hasAnyAncestor(isDialog())).performClick(); qa.waitRequest()
            assertTrue(qa.api.call("/api/technique-reviews/").rows().none { it.optInt("id") == reviewId })
            reviewId = null
        } finally {
            reviewId?.let { qa.api.call("/api/technique-reviews/$it/", "DELETE") }
            qa.context.contentResolver.delete(uri, null, null)
        }
    }
    @Test fun multipleMp3FilesUseNativePickerAndBackendBatchContract() = runBlocking<Unit> {
        qa.navigate(Screen.Settings)
        val prefix = "android-qa-batch-${UUID.randomUUID().toString().take(8)}"
        val names = listOf("$prefix-a.mp3", "$prefix-b.mp3")
        val documents = names.map { document(it, "qa-music.mp3", "audio/mpeg") }
        var failure: Throwable? = null
        var stage = "picker"
        try {
            compose.runOnIdle { qa.model.notice = null; qa.model.error = null }
            qa.visible("Загрузить несколько MP3").performClick()
            for ((index, name) in names.withIndex()) {
                val file = device.findObject(UiSelector().textContains(name))
                if (!file.waitForExists(5000)) {
                    device.findObject(By.desc("Show roots"))?.click()
                    device.wait(Until.findObject(By.text("Downloads")), 5000)?.click()
                }
                check(file.waitForExists(8000)) { "Batch file not found: $name" }
                device.waitForIdle(1000)
                if (index == 0) file.longClick() else {
                    val bounds = file.visibleBounds; device.click(bounds.centerX(), bounds.centerY())
                }
            }
            val open = device.wait(Until.findObject(By.res("com.google.android.documentsui", "action_menu_select")), 5000)
                ?: device.findObject(By.text("OPEN")) ?: device.findObject(By.text("Open"))
            if (open == null) { device.dumpWindowHierarchy(java.io.File(qa.directory, "batch-picker.xml")); error("Batch picker confirmation was not available") }
            open.click()
            stage = "upload"
            compose.waitUntil(240_000) { qa.model.notice?.startsWith("Файлов загружено") == true || qa.model.error != null }; qa.waitRequest()
            stage = "verify"
            val tracks = qa.api.call("/api/workouts/music/tracks/").rows().filter { it.text("filename").contains(prefix) }
            assertEquals(2, tracks.size)
            qa.capture("music-batch-upload")
            qa.report("music-batch", obj("result" to "passed", "selected_files" to 2, "server_tracks" to tracks.size))
        } catch (error: Throwable) {
            failure = error
            qa.report("music-batch-failure", obj("stage" to stage, "error" to error.toString(), "model_error" to qa.model.error, "notice" to qa.model.notice))
            throw error
        } finally {
            try { qa.api.call("/api/workouts/music/tracks/").rows().filter { it.optBoolean("is_mine") && it.text("filename").contains(prefix) }
                .forEach { qa.api.call("/api/workouts/music/tracks/${it.getInt("id")}/", "DELETE") }
            } catch (cleanup: Throwable) { if (failure != null) failure.addSuppressed(cleanup) else throw cleanup }
            documents.forEach { qa.context.contentResolver.delete(it, null, null) }
        }
    }
}
