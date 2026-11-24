@file:OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
package com.fittodoay.android

import android.app.Application
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File
import java.time.LocalDate
import java.util.UUID

/** Real Compose gestures with isolated Room fixtures. Audio uses temporary MP3s in enrolled QA only. */
class PolishRegressionTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>(effectContext = NoMotion)
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private lateinit var original: String
    private lateinit var account: String
    private lateinit var model: AppModel
    private val models = ViewModelStore()
    private var uploadedAudio: Int? = null
    private val args get() = InstrumentationRegistry.getArguments()
    @Before fun prepare() {
        assumeTrue(args.getString("polish") == "true")
        original = SessionStore(context).read()
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        check(marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == localAccountKey(original))
        account = "polish:${UUID.randomUUID()}"
        LocalDataStore(context, account).apply {
            write("/api/profile/preferences/", obj("design_version" to "v2", "theme" to args.getString("polishTheme", "light")))
            write("/api/programs/folders/", JSONArray()); write("/api/programs/templates/", JSONArray())
            write("/api/profile/", JSONObject())
            write("/api/workouts/plan/?date=${LocalDate.now()}", plan(LocalDate.now(), 9191))
        }
        SessionStore(context).write(account)
        val dark = args.getString("polishTheme") == "dark"
        compose.runOnUiThread {
            val bars = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT) { dark }
            compose.activity.enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
            model = AppModel(context.applicationContext as Application, "https://polish.invalid", { false }); models.put("model", model)
        }
        compose.waitUntil(15_000) { !model.refreshing && !model.draftLoading && model.workoutSaving == 0 }
    }
    private fun plan(date: LocalDate, id: Int) = obj("id" to id, "date" to date.toString(), "folders" to JSONArray(), "logs" to JSONArray())
    private fun content(body: @Composable () -> Unit) {
        compose.setContent { MaterialTheme(colorScheme = fitColors(args.getString("polishTheme") == "dark", Color(0xffa855f7), true), typography = FitTypography, shapes = FitShapes) { Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { body() } } }
    }
    private fun capture(name: String) {
        compose.waitForIdle(); instrumentation.waitForIdleSync()
        androidx.test.uiautomator.UiDevice.getInstance(instrumentation).waitForIdle(500)
        val directory = File(context.filesDir, "polish-review").apply { mkdirs() }
        val suffix = "-${args.getString("polishTheme", "light")}-${args.getString("layoutName", "reference")}"
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
            File(directory, name + suffix + ".png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
        }
    }
    private fun SemanticsNodeInteraction.assertHeightAtMost(maximum: androidx.compose.ui.unit.Dp) = apply {
        assertTrue("Expected height <= $maximum; actual=${fetchSemanticsNode().boundsInRoot.height}px", fetchSemanticsNode().boundsInRoot.height <= maximum.value * context.resources.displayMetrics.density + 1)
    }
    @After fun restore() {
        if (::model.isInitialized) compose.runOnUiThread { model.audio.stop(); model.cancelWorkoutTimer(); models.clear() }
        uploadedAudio?.let { id -> runBlocking { Api { original }.call("/api/workouts/music/tracks/$id/", "DELETE") } }
        if (::original.isInitialized) SessionStore(context).write(original)
    }
    private fun tracks(count: Int = 80): List<JSONObject> = (1..count).map { index -> obj("id" to index, "name" to "Трек $index — длинное название для проверки прокрутки", "filename" to "system/${if (index <= count / 2) "rock" else "ambient"}/track-$index.mp3", "source_type" to "file") }
    private fun startLocalTrack(track: JSONObject) {
        val sound = File(context.cacheDir, "polish-sound.mp3")
        instrumentation.context.assets.open("qa-music.mp3").use { input -> sound.outputStream().use { input.copyTo(it) } }
        val uploaded = runBlocking {
            val response = Api { original }.upload("/api/workouts/music/tracks/upload/", "file", "polish-${UUID.randomUUID()}.mp3", "audio/mpeg", sound)
            if (response is JSONObject && response.has("id")) response else response.rows().single()
        }
        uploadedAudio = uploaded.getInt("id")
        val local = JSONObject(track.toString()).put("url", uploaded.getString("url"))
        // PlaybackService requires HTTPS and resolves its own server credentials.
        // Retain that production behavior while the UI model uses isolated Room data.
        SessionStore(context).write(original)
        compose.runOnUiThread { model.audio.play(local, listOf(local), model.token) }
        compose.waitUntil(45_000) { model.audio.trackId == track.optInt("id") && model.audio.durationMs > 0 }
    }
    @Test fun playerIsOnlyVisibleOnTheChecklist() {
        content { FitApp(model) }
        compose.onNodeWithTag("mini-player").assertExists()
        for (screen in Screen.entries.filter { it != Screen.Workout }) {
            compose.runOnUiThread { model.screen = screen }
            compose.onNodeWithTag("mini-player").assertDoesNotExist()
        }
        compose.runOnUiThread { model.screen = Screen.Workout }
        compose.onNodeWithTag("mini-player").assertExists()
        capture("player-checklist-only")
    }
    @Test fun inlineChatMentionOpensTheExistingExerciseWindow() {
        val source = obj("id" to "press", "name" to "Жим лёжа", "description" to "Техника QA")
        val text = "Попробуйте ЖИМ_ЛЕЖА сегодня."
        compose.runOnUiThread {
            model.messages = listOf(obj("id" to 1, "role" to "assistant", "content" to text))
            model.chatReferences = listOf(obj("exercise" to source))
        }
        content { ChatDialog(model) {} }
        val header = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        compose.onNodeWithText("AI-помощник").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(header) }
        if (args.getString("polishTheme") == "dark") assertTrue("Dark chat title must remain readable", header.single().layoutInput.style.color.red > .5f)
        capture("chat-inline-mention")
        val node = compose.onNodeWithText(text)
        val results = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        node.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(results) }
        val layout = results.single()
        node.performTouchInput { click(layout.getBoundingBox(text.indexOf("ЖИМ") + 1).center) }
        compose.onNodeWithTag("exercise-info-sheet").assertExists()
        compose.onNodeWithText("Описание", substring = false).assertExists()
        compose.onNodeWithText("Статистика", substring = false).assertExists()
        capture("chat-exercise-window")
    }
    @Test fun queueReordersByDraggingWithoutMoveMenuButtons() {
        val library = tracks(3)
        compose.runOnUiThread { model.audio.play(library.first(), library, model.token) }
        compose.waitUntil(15_000) { model.audio.queue.size == 3 }
        content { PlaylistSheet(model) {} }
        compose.onNodeWithContentDescription("Показать очередь").performClick()
        val first = compose.onNodeWithTag("queue-0").fetchSemanticsNode().boundsInRoot
        val second = compose.onNodeWithTag("queue-1").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("drag-queue-0").performTouchInput { swipe(center, center + Offset(0f, second.center.y - first.center.y + 12f), 700) }
        compose.waitUntil(15_000) { model.audio.queue.map { it.first } == listOf(2, 1, 3) }
        compose.onNodeWithContentDescription("Действия в очереди 1").performClick()
        compose.onNodeWithText("Выше").assertDoesNotExist(); compose.onNodeWithText("Ниже").assertDoesNotExist()
        capture("queue-drag-order")
    }
    @Test fun asyncCatalogOpensTheCurrentFolderAndScrollsToTheCurrentTrack() {
        val library = tracks()
        startLocalTrack(library[67])
        compose.runOnUiThread { model.tracks = emptyList(); model.preferences = JSONObject() }
        content { PlaylistSheet(model) {} }
        compose.onNodeWithTag("music-search").assertDoesNotExist()
        compose.runOnUiThread { model.tracks = library; model.preferences = obj("music_group_by" to "folder") }
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("music-track-68").fetchSemanticsNodes().any { it.boundsInRoot.height > 0 } }
        compose.onNodeWithTag("music-track-68").assertIsDisplayed()
        compose.onNodeWithTag("music-track-1").assertDoesNotExist()
        compose.onNodeWithText("Ambient", substring = false).assertIsDisplayed()
        compose.onNodeWithTag("playlist-toolbar").assertHeightAtMost(48.dp)
        compose.onNodeWithTag("playlist-list").assertHeightIsAtLeast(220.dp)
        // A tall tablet can already display the end of the folder after jumping
        // to the current track. The invariant is that upload belongs to the list.
        if (compose.onAllNodesWithTag("playlist-add-music").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithTag("playlist-add-music").assert(hasAnyAncestor(hasTestTag("playlist-list")))
        capture("playlist-current-folder")
        compose.onNodeWithTag("playlist-list").performScrollToNode(hasTestTag("playlist-add-music"))
        compose.onNodeWithTag("playlist-add-music").assertIsDisplayed().assert(hasAnyAncestor(hasTestTag("playlist-list")))
        capture("playlist-footer")
        compose.onNodeWithTag("playlist-add-music").performClick()
        compose.onNodeWithText("Один или несколько MP3").assertIsDisplayed()
        compose.onNodeWithText("К трекам").performClick()
        compose.onNodeWithTag("music-track-68").assertIsDisplayed()
    }
    @Test fun preferencesThatArriveAfterOpeningAreAppliedAndSearchIsOptional() {
        compose.runOnUiThread { model.tracks = tracks(8).map { JSONObject(it.toString()).put("artist", "Исполнитель QA") }; model.preferences = JSONObject() }
        content { PlaylistSheet(model) {} }
        compose.onNodeWithText("Rock", substring = false).assertExists()
        compose.runOnUiThread { model.preferences = obj("music_group_by" to "artist") }
        compose.onNodeWithTag("playlist-group-Исполнитель QA").assertExists()
        compose.onNodeWithContentDescription("Открыть поиск музыки").performClick()
        compose.onNodeWithTag("music-search").performTextReplacement("Трек 3")
        compose.onNodeWithTag("music-track-3").assertIsDisplayed()
        compose.onNodeWithTag("music-track-1").assertDoesNotExist()
        compose.onNodeWithTag("playlist-toolbar").assertHeightAtMost(64.dp)
        capture("playlist-search")
        compose.onNodeWithTag("music-search").performTextReplacement("ambient")
        compose.onNodeWithTag("music-track-5").assertIsDisplayed()
        compose.onNodeWithTag("music-track-1").assertDoesNotExist()
        compose.onNodeWithContentDescription("Закрыть поиск музыки").performClick()
        compose.onNodeWithTag("music-search").assertDoesNotExist()
        compose.onNodeWithTag("playlist-toolbar").assertHeightAtMost(48.dp)
    }
    @Test fun seekDragIsAccurateAndDoesNotJumpBackOnRelease() {
        val library = tracks(4)
        startLocalTrack(library[0])
        compose.runOnUiThread { model.tracks = library; model.audio.toggle() }
        content { PlaylistSheet(model) {} }
        val slider = compose.onNodeWithTag("music-seek")
        slider.assertHeightIsAtLeast(48.dp)
        slider.performTouchInput { swipe(Offset(width * .2f, height / 2f), Offset(width * .75f, height / 2f), 700) }
        compose.waitUntil(10_000) { model.audio.positionMs in 80_000..100_000 }
        val position = model.audio.positionMs
        compose.waitForIdle()
        assertTrue(kotlin.math.abs(model.audio.positionMs - position) < 1000)
        capture("playlist-seek")
    }
    @Test fun downwardSwipeRefreshesTheChecklistAndSettingsHaveOneEntry() {
        val tomorrow = LocalDate.now().plusDays(1)
        LocalDataStore(context, account).write("/api/workouts/plan/?date=$tomorrow", plan(tomorrow, 9192))
        compose.runOnUiThread { model.date = tomorrow.toString(); model.error = "Предыдущая ошибка обновления" }
        content { FitApp(model) }
        compose.onNodeWithText("Ещё⌄").assertDoesNotExist()
        compose.onNodeWithText("Обновить", substring = false).assertDoesNotExist()
        compose.onNodeWithContentDescription("Настройки оформления").assertDoesNotExist()
        compose.onNodeWithTag("page-scroll").performTouchInput { swipeDown(startY = height * .12f, endY = height * .88f, durationMillis = 700) }
        compose.waitUntil(10_000) { model.plan.optInt("id") == 9192 && !model.refreshing }
        assertNull("A successful pull refresh clears the old error", model.error)
        capture("checklist-floating-player")
        compose.onNodeWithTag("open-settings").performClick()
        compose.waitUntil(10_000) { model.screen == Screen.Settings && !model.refreshing }
        compose.onNodeWithTag("settings-Оформление").assertIsDisplayed()
        compose.onNodeWithText("Группы мышц на тренировке").assertDoesNotExist()
        capture("settings")
        compose.onNodeWithTag("settings-Оформление").performClick()
        compose.onNodeWithText("Группы мышц на тренировке").assertExists()
    }
    @Test fun chartControlsAndLegendsRemainCompactWithAnAnnualHistory() {
        val series = (0..364).associate { LocalDate.now().minusDays((364 - it).toLong()).toString() to (120.0 + it % 17 * 7 + it / 4) }
        val lines = (1..10).map { TrendLine("program-$it", "Программа $it с длинным названием", series.mapValues { (_, value) -> value * it }) }
        content { Page { MetricPlot(lines, "line", "annual-chart") } }
        compose.onNodeWithTag("annual-chart").performScrollTo().assertHeightIsAtLeast(220.dp)
        compose.waitUntil(15_000) { compose.onAllNodes(hasTestTag("metric-chart-loading") and hasAnyAncestor(hasTestTag("annual-chart"))).fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithTag("annual-chart").performTouchInput { click(Offset(width * .65f, height * .5f)) }
        compose.onNodeWithTag("annual-chart-tooltip").assertExists()
        compose.onNodeWithTag("annual-chart-legend").performScrollTo().assertHeightAtMost(110.dp)
        compose.onNodeWithText("Все серии · 10").assertExists()
        capture("annual-chart-legend")
        compose.onNodeWithText("Все серии · 10").performScrollTo().performClick()
        compose.onNodeWithText("Серии графика").assertIsDisplayed()
        compose.onNode(hasText("Программа 4 с длинным названием") and hasClickAction()).performScrollTo().performClick()
        capture("annual-chart-focused")
    }
    @Test fun exerciseRankingShowsFiveRowsAndChartOptionsStayInTheirSheet() {
        compose.runOnUiThread {
            model.exerciseStats = (1..15).map { obj("name" to "Упражнение $it", "load" to 300 - it, "sets" to it * 3) }
            model.trends = obj("folders" to JSONArray().put(obj("id" to 1, "name" to "Годовая программа", "series" to JSONArray((0..364).map { obj("date" to LocalDate.now().minusDays(it.toLong()).toString(), "load" to 100 + it % 30) }))))
        }
        content { AnalyticsScreen(model) }
        compose.onNodeWithTag("top-exercises").performScrollTo()
        compose.onNodeWithTag("top-exercise-4").assertExists()
        compose.onNodeWithTag("top-exercise-5").assertDoesNotExist()
        compose.onNodeWithTag("chart-toolbar").performScrollTo().assertHeightAtMost(68.dp)
        compose.onNodeWithText("Детализация").assertDoesNotExist()
        compose.onNodeWithContentDescription("Параметры графика").performClick()
        compose.onNodeWithText("Группировка", substring = false).assertIsDisplayed()
        capture("chart-options")
        compose.onNodeWithText("Готово").performClick()
        compose.onNodeWithTag("trend-chart-line").performScrollTo()
        capture("analytics-compact")
    }
    @Test fun automaticWeightFocusUsesFullViewportOutsideChecklist() {
        compose.runOnUiThread {
            model.screen = Screen.Analytics
            model.weights = (0..30).map { obj("date" to LocalDate.now().minusDays(it.toLong()).toString(), "weight_kg" to 80.0 + it / 10.0) }
        }
        content { FitApp(model) }
        compose.runOnUiThread { model.focusBodyWeight = true }
        compose.waitUntil(10_000) { !model.focusBodyWeight }
        compose.waitForIdle()
        val panel = compose.onNodeWithTag("analytics-body-weight").fetchSemanticsNode().boundsInRoot
        val dock = compose.onNodeWithTag("floating-player-dock").fetchSemanticsNode().boundsInRoot
        val viewport = compose.onNodeWithTag("page-scroll").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("mini-player").assertDoesNotExist()
        val availableBottom = if (dock.height > 0) dock.top else viewport.bottom
        if (panel.height <= availableBottom - viewport.top) assertTrue("Focused weight chart should fit the viewport", panel.bottom <= availableBottom + 2)
        else assertTrue("At least the focused chart's center must be visible", panel.center.y < availableBottom)
        capture("weight-focus-floating-dock")
    }
    @Test fun draggingExercisesChangesTheDraftAndCancelDoesNotChangeTheProgram() {
        val exercises = (1..3).map { obj("id" to it, "exercise" to obj("name" to "Упражнение $it", "default_sets" to 3, "default_reps" to 10)) }
        val day = obj("id" to 5, "folder" to 1, "name" to "Тестовый день", "schedule_type" to "weekly", "schedule_config" to obj("days_of_week" to JSONArray().put(0)), "template_exercises" to JSONArray(exercises))
        var open by mutableStateOf(true)
        content { if (open) DayDialog(day, model) { open = false } }
        compose.onNodeWithTag("day-editor-list").performScrollToIndex(1)
        val handle = compose.onNodeWithTag("drag-exercise-1")
        val first = compose.onNodeWithTag("day-order-1").fetchSemanticsNode().boundsInRoot
        val second = compose.onNodeWithTag("day-order-2").fetchSemanticsNode().boundsInRoot
        handle.performTouchInput { swipe(center, center + Offset(0f, second.center.y - first.center.y + 12f), 700) }
        compose.onNodeWithTag("day-order-1").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Позиция 2 из 3"))
        capture("day-drag-order")
        compose.onNodeWithText("Отмена", substring = false).performClick()
        assertFalse(open)
        assertEquals(listOf(1, 2, 3), day.array("template_exercises").map { it.optInt("id") })
    }
}
