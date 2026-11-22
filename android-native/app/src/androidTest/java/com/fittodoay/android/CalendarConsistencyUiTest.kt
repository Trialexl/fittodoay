@file:OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
package com.fittodoay.android

import android.app.Application
import androidx.activity.ComponentActivity
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File
import java.time.LocalDate
import java.time.YearMonth
import java.util.UUID

/** Isolated Room data; real calendar and gestures, no real training writes. */
class CalendarConsistencyUiTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>(effectContext = NoMotion)
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private lateinit var original: String
    private lateinit var model: AppModel
    private val models = ViewModelStore()
    private val today = LocalDate.now()
    private val args get() = InstrumentationRegistry.getArguments()
    private val exercise = obj("template_exercise_id" to 3, "defaults" to obj("has_weight" to true, "has_time" to false))
    private val set = obj("set_index" to 1)
    private val log = obj("id" to 55, "workout_day" to 77, "template_exercise" to 3, "set_index" to 1, "actual_reps" to 10, "actual_weight" to 10)
    @Before fun prepare() {
        assumeTrue(args.getString("audit") == "true")
        original = SessionStore(context).read()
        val marker = JSONObject(File(context.filesDir, "qa-account.json").readText())
        check(marker.text("purpose") == "android-native-qa" && marker.text("session_digest") == localAccountKey(original))
        val account = "calendar-audit:${UUID.randomUUID()}"
        val plan = obj("id" to 77, "date" to today.toString(), "folders" to JSONArray(), "logs" to JSONArray().put(log))
        runBlocking(Dispatchers.IO) {
            val store = LocalDataStore(context, account)
            store.write("/api/profile/preferences/", obj("theme" to args.getString("polishTheme", "light")))
            store.writeSnapshot("local:all:/api/analytics/days/", obj("items" to JSONArray().put(obj("date" to today.toString(), "load" to 500))), 1)
            OfflineStore(context, account).cache(today.toString(), plan)
        }
        SessionStore(context).write(account)
        compose.runOnUiThread { model = AppModel(context.applicationContext as Application, "https://calendar-audit.invalid", { false }); models.put("model", model) }
        compose.waitUntil(15_000) { !model.refreshing && !model.draftLoading }
    }
    @After fun restore() {
        if (::model.isInitialized) compose.runOnUiThread { models.clear() }
        if (::original.isInitialized) SessionStore(context).write(original)
    }
    private fun capture(name: String) {
        compose.waitForIdle(); instrumentation.waitForIdleSync()
        val directory = File(context.filesDir, "audit-review").apply { mkdirs() }
        val suffix = "-${args.getString("polishTheme", "light")}-${args.getString("layoutName", "reference")}"
        instrumentation.uiAutomation.takeScreenshot().let { pixels ->
            File(directory, name + suffix + ".png").outputStream().use { pixels.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; pixels.recycle()
        }
    }
    private fun load() = compose.onNodeWithTag("calendar-load-$today", useUnmergedTree = true)
    private fun waitLoad(value: String) = compose.waitUntil(10_000) {
        load().fetchSemanticsNode().config[SemanticsProperties.Text].joinToString("") { it.text } == value
    }
    private fun content(body: @Composable () -> Unit) {
        compose.setContent { MaterialTheme(colorScheme = fitColors(args.getString("polishTheme") == "dark", Color(0xffa855f7), true), typography = FitTypography) { body() } }
    }
    @Test fun calendarImmediatelyReflectsEditsAndUndoWithoutInternet() {
        var open by mutableStateOf(true)
        content { FitApp(model); if (open) WorkoutCalendar(model) { open = false } }
        waitLoad("100")
        compose.runOnUiThread { model.logSet(exercise, set, "6", "20", "", model.plan.array("logs").single()) }
        compose.waitUntil(10_000) { model.workoutSaving == 0 }
        waitLoad("120")
        capture("calendar-local-edit")
        compose.onNodeWithText("Закрыть", substring = false).performClick()
        compose.runOnUiThread { open = true }
        waitLoad("120")
        compose.runOnUiThread { model.undoCompletedSet(model.plan.array("logs").single()) {} }
        compose.waitUntil(10_000) { model.workoutSaving == 0 }
        waitLoad("—")
        capture("calendar-local-undo")
    }
    @Test fun calendarHasSixWeeksAndDistinguishesTodayFromTheSelection() {
        val selected = if (today.dayOfMonth == 1) today.plusDays(1) else today.minusDays(1)
        compose.runOnUiThread { model.date = selected.toString() }
        var open by mutableStateOf(true)
        content { FitApp(model); if (open) WorkoutCalendar(model) { open = false } }
        val first = YearMonth.from(today).atDay(1).let { it.minusDays((it.dayOfWeek.value - 1).toLong()) }
        compose.onNodeWithTag("calendar-date-${first.plusDays(41)}").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("calendar-date-$today").performScrollTo().assertIsNotSelected().assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Сегодня"))
        capture("calendar-six-weeks-today")
        compose.onNode(hasText("Сегодня", substring = false) and hasAnyAncestor(isDialog())).performClick()
        assertEquals(today.toString(), model.date)
        compose.onNodeWithTag("workout-calendar").assertDoesNotExist()
    }
    @Test fun aDaySelectedInAnalyticsOpensItsWorkout() {
        compose.runOnUiThread { model.screen = Screen.Analytics; model.days = listOf(obj("date" to today.toString(), "load" to 100)) }
        content { FitApp(model) }
        compose.onNodeWithTag("chart-load").performScrollTo()
        try { compose.waitUntil(15_000) { compose.onAllNodes(hasTestTag("metric-chart-loading") and hasAnyAncestor(hasTestTag("chart-load"))).fetchSemanticsNodes().isEmpty() } }
        catch (failure: Throwable) {
            capture("single-day-chart-failure")
            File(context.filesDir, "audit-review/single-day-chart-failure.txt").writeText(compose.onRoot().printToString() + "\nData: " + model.days)
            throw failure
        }
        compose.onNodeWithTag("chart-load").performTouchInput { click(center) }
        val action = compose.onNodeWithTag("chart-load-open-workout").performScrollTo()
        val covered = action.fetchSemanticsNode().boundsInRoot.bottom - compose.onNodeWithTag("floating-player-dock").fetchSemanticsNode().boundsInRoot.top + 8
        if (covered > 0) compose.onNodeWithTag("page-scroll").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.ScrollBy) { it(0f, covered) }
        action.performClick()
        compose.waitUntil(10_000) { model.screen == Screen.Workout && !model.refreshing }
        assertEquals(today.toString(), model.date)
        compose.onNodeWithContentDescription("Открыть календарь тренировок").assertIsDisplayed()
    }
}
