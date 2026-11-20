package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.io.File
import java.time.LocalDate
import java.util.UUID

/** Deterministic UI + durable queue assertions. Synthetic session, radios off; never writes real workout logs. */
class WorkoutFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var qa: QaHarness
    private lateinit var enrolled: String
    private lateinit var testToken: String
    private val offline get() = OfflineStore(context, testToken)
    private val date get() = LocalDate.now().toString()
    private fun field(label: String) = compose.onNode(hasContentDescription(label) and hasAnyAncestor(hasTestTag("workout-timer-screen")))
    private fun hideKeyboard() {
        androidx.test.uiautomator.UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()
        compose.waitForIdle()
        compose.onNodeWithTag("workout-timer-screen").assertIsDisplayed()
    }
    private fun row(id: Int, index: Int) = compose.onNodeWithTag("set-row-$id-$index")
    private fun clickSet(id: Int, index: Int) { compose.onNode(hasText(if (id == 91012) "▷ Начать" else "+ Отметить", substring = false) and hasAnyAncestor(hasTestTag("set-row-$id-$index"))).performScrollTo().performClick() }
    private fun recreate() {
        compose.runOnIdle { compose.activity.viewModelStore.clear() }
        compose.activityRule.scenario.recreate()
        compose.runOnIdle { qa.model = compose.activity.model }; qa.waitRequest(allowError = true)
    }
    @Before fun prepare() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("workoutFlow") == "true")
        val manager = context.getSystemService(android.net.ConnectivityManager::class.java)
        check(manager.activeNetwork == null) { "Workout flow suite requires radios OFF" }
        qa = QaHarness(compose); qa.guard(requireNetwork = false); qa.waitRequest(allowError = true)
        enrolled = SessionStore(context).read(); testToken = "workout-flow:${UUID.randomUUID()}"
        val fixture = JSONObject(File(context.filesDir, "visual-reference.json").readText())
        check(fixture.text("source") == "recorded-server-responses" && fixture.text("account_kind") == "synthetic")
        val plan = normalizePlan(fixture.getJSONObject("plan"))
        val reference = plan.array("folders").first().array("templates").first().array("exercises").first()
        val exercises = JSONArray()
        for (i in 1..12) {
            val e = JSONObject(reference.toString()).put("template_exercise_id", 91000 + i).put("is_active", true)
            e.put("source", JSONObject(reference.getJSONObject("source").toString()).put("name", "QA упражнение $i").put("has_time", i == 12).put("has_weight", i != 12))
            e.put("defaults", obj("has_time" to (i == 12), "has_weight" to (i != 12), "reps" to 10, "weight" to 6.25, "time" to 60, "rest" to 600))
            e.put("sets", JSONArray().put(obj("set_index" to 1, "default_reps" to 10, "default_weight" to 6.25, "default_time" to 60, "rest" to 600))
                .put(obj("set_index" to 2, "default_reps" to 10, "default_weight" to 6.25, "default_time" to 60, "rest" to 600)))
            exercises.put(e)
        }
        plan.put("id", 919191).put("date", date).put("logs", JSONArray()).put("folders", JSONArray().put(obj("id" to 9191, "name" to "QA длинный чеклист",
            "templates" to JSONArray().put(obj("id" to 9192, "name" to "QA тренировочный день", "exercises" to exercises)))))
        plan.remove("plan_snapshot"); plan.remove("set_logs")
        val store = LocalDataStore(context, testToken)
        store.write("/api/workouts/plan/?date=$date", plan)
        store.write("/api/profile/preferences/", obj("design_version" to "v2", "theme" to "light", "accent_color" to "#a855f7"))
        compose.runOnIdle { qa.model.pauseLocalSync(); SessionStore(context).write(testToken) }
        recreate()
        compose.runOnIdle { qa.model.error = null; qa.model.notice = null }
        assertEquals(24, qa.model.plan.array("folders").flatMap { it.array("templates") }.flatMap { it.array("exercises") }.sumOf { it.array("sets").size })
    }
    @After fun restore() {
        if (!::enrolled.isInitialized) return
        compose.runOnIdle { qa.model.cancelWorkoutTimer(); qa.model.pauseLocalSync(); SessionStore(context).write(enrolled) }
        recreate()
    }
    @Test fun completedSetUsesModalWithCancelSaveAndUndo() {
        clickSet(91001, 1)
        compose.onNodeWithText("Пропустить отдых", substring = false).performScrollTo().performClick(); qa.waitRequest()
        fun edit() { compose.onNode(hasContentDescription("Изменить подход 1") and hasAnyAncestor(hasTestTag("set-row-91001-1"))).performScrollTo().performClick() }
        fun modalField(label: String) = compose.onNode(hasContentDescription(label) and hasAnyAncestor(hasTestTag("completed-set-dialog")))
        val before = qa.model.plan.toString()
        edit()
        compose.onNodeWithText("Правка подхода", substring = false).assertIsDisplayed()
        modalField("Вес (кг)").performTextReplacement("7,5")
        assertEquals(before, qa.model.plan.toString())
        qa.capture("v2-completed-set-edit")
        compose.onNodeWithText("Отмена", substring = false).performClick()
        assertEquals(before, qa.model.plan.toString())
        edit()
        modalField("Вес (кг)").assertTextEquals("6,25")
        compose.onNodeWithContentDescription("Увеличить повторы").performClick()
        modalField("Повторы").assertTextEquals("11")
        modalField("Вес (кг)").performTextReplacement("7,5")
        compose.onNodeWithText("Сохранить", substring = false).performClick(); qa.waitRequest()
        compose.onNodeWithTag("completed-set-dialog").assertDoesNotExist()
        assertFalse(qa.model.workoutTimerActive)
        val result = offline.queue().single().getJSONObject("body")
        assertEquals(11, result.getInt("actual_reps")); assertEquals(7.5, result.getDouble("actual_weight"), 0.0)
        edit()
        modalField("Повторы").performTextReplacement("0")
        compose.onNodeWithText("Сохранить", substring = false).performClick()
        compose.onNodeWithTag("completed-set-dialog").assertIsDisplayed()
        assertEquals(11, offline.queue().single().getJSONObject("body").getInt("actual_reps"))
        compose.onNodeWithText("Отмена", substring = false).performClick()
        edit()
        compose.onNodeWithText("Отменить выполнение", substring = false).performClick()
        compose.onNodeWithTag("completed-set-dialog").assertDoesNotExist()
        assertTrue(offline.queue().isEmpty())
        assertTrue(qa.model.plan.array("logs").isEmpty())
        qa.capture("v2-completed-set-undone")
    }
    @Test fun noRestRequiresSaveAndExecutionExpiryTransitionsToReview() {
        compose.runOnIdle {
            val changed = JSONObject(qa.model.plan.toString())
            val exercises = changed.array("folders").single().array("templates").single().array("exercises")
            exercises.first().getJSONArray("sets").getJSONObject(0).put("rest", 0)
            exercises.last().getJSONArray("sets").getJSONObject(0).put("default_time", 2)
            qa.model.plan = changed
        }
        clickSet(91001, 1)
        compose.onNodeWithText("Результат подхода", substring = false).assertIsDisplayed()
        compose.onNodeWithTag("workout-timer-clock").assertDoesNotExist()
        assertTrue(offline.queue().isEmpty())
        qa.capture("flow-zero-rest-review")
        compose.onNodeWithText("Сохранить подход", substring = false).performScrollTo().performClick(); qa.waitRequest()
        assertEquals(1, offline.queue().size)
        clickSet(91012, 1)
        compose.onNodeWithText("Прервать", substring = false).performScrollTo().performClick()
        assertEquals(1, offline.queue().size)
        assertFalse(qa.model.workoutTimerActive)
        clickSet(91012, 1)
        compose.waitUntil(8000) { qa.model.executionUntil == 0L && qa.model.restPending != null }
        assertEquals("2", qa.model.restPending!!.text("time"))
        assertEquals(1, offline.queue().size)
        qa.capture("flow-execution-expired-rest")
        compose.onNodeWithContentDescription("Закрыть таймер").performClick()
        assertEquals(1, offline.queue().size)
        // Completing every set folds the exercise; the result remains available on expansion.
        clickSet(91001, 2)
        compose.onNodeWithText("Пропустить отдых", substring = false).performScrollTo().performClick(); qa.waitRequest()
        row(91001, 1).assertDoesNotExist()
        compose.onNodeWithTag("workout-exercise-toggle-91001").performScrollTo().performClick()
        row(91001, 1).assertExists(); row(91001, 2).assertExists()
        qa.capture("flow-completed-exercise-reopened")
    }
    @Test fun longChecklistRestExecutionCollapseAndDurableResults() {
        // Reach the bottom by scrolling; there must be no server/queue write on timer start.
        clickSet(91012, 1)
        compose.onNodeWithText("Выполнение", substring = false).assertIsDisplayed()
        assertTrue(offline.queue().isEmpty()); qa.capture("flow-execution-full")
        compose.onNodeWithText("Свернуть", substring = false).assertDoesNotExist()
        val heading = compose.onNode(hasText("QA упражнение 12", substring = false) and hasAnyAncestor(hasTestTag("workout-timer-screen"))).fetchSemanticsNode().boundsInRoot
        val dial = compose.onNodeWithTag("workout-timer-clock").fetchSemanticsNode().boundsInRoot
        if (compose.activity.resources.configuration.screenWidthDp <= 820) assertTrue("V2 mobile puts the exercise above the dial", heading.top < dial.top)
        compose.onNodeWithText("Завершить раньше", substring = false).performScrollTo().performClick()
        assertTrue(qa.model.restPending!!.text("time").toInt() in 1..59)
        assertTrue(offline.queue().isEmpty())
        field("Время (сек)").performScrollTo().performTextReplacement("23")
        compose.onNodeWithText("Свернуть", substring = false).performClick()
        qa.capture("flow-rest-collapsed-bottom")
        val restDeadline = qa.model.restUntil
        recreate() // New ViewModel reads the durable pending form and collapsed state.
        assertTrue(qa.model.timerCollapsed); assertEquals(restDeadline, qa.model.restUntil)
        assertEquals("23", qa.model.restPending!!.text("time"))
        compose.onNodeWithContentDescription("Развернуть таймер").performClick()
        field("Время (сек)").assertTextContains("23")
        compose.onNodeWithText("Пропустить отдых", substring = false).performScrollTo().performClick(); qa.waitRequest()
        assertEquals(1, offline.queue().size)
        val timed = offline.queue().single().getJSONObject("body")
        assertEquals(23, timed.getInt("actual_time")); assertTrue(timed.isNull("actual_weight")); assertTrue(timed.isNull("actual_reps"))
        assertNull(TimerStore(context, testToken).read("rest"))

        // Weighted set: close cancels; edited result is saved only after skip/expiry.
        clickSet(91001, 1)
        qa.capture("flow-rest-full")
        field("Вес (кг)").performScrollTo().performTextReplacement("7,5")
        hideKeyboard()
        compose.onNodeWithText("Пропустить отдых", substring = false).performScrollTo()
        qa.capture("flow-rest-result-editor")
        compose.onNodeWithText("Свернуть", substring = false).performClick()
        val deadline = qa.model.restUntil
        compose.onNodeWithTag("workout-day-toggle-9192").performScrollTo().performClick()
        compose.onNodeWithTag("workout-exercise-toggle-91001").assertDoesNotExist()
        compose.onNodeWithTag("workout-day-toggle-9192").performClick()
        compose.onNodeWithContentDescription("Развернуть таймер").performClick()
        assertEquals(deadline, qa.model.restUntil)
        field("Вес (кг)").assertTextContains("7,5")
        compose.onNodeWithContentDescription("Закрыть таймер").performClick()
        assertEquals(1, offline.queue().size)
        clickSet(91001, 1)
        field("Повторы").performScrollTo().performTextReplacement("0")
        compose.onNodeWithText("Пропустить отдых", substring = false).performScrollTo().performClick()
        assertNotNull(qa.model.error); assertEquals(1, offline.queue().size)
        field("Повторы").performScrollTo().performTextReplacement("11")
        field("Вес (кг)").performScrollTo().performTextReplacement("7,5")
        compose.onNodeWithText("Свернуть", substring = false).performClick()
        // Expire while collapsed: save exactly once, using the edited values.
        compose.runOnIdle { qa.model.advanceWorkoutTimer(qa.model.restUntil + 1) }; qa.waitRequest()
        val weighted = offline.queue().single { it.getJSONObject("body").optInt("template_exercise") == 91001 }.getJSONObject("body")
        assertEquals(11, weighted.getInt("actual_reps")); assertEquals(7.5, weighted.getDouble("actual_weight"), 0.0)
        assertEquals(2, offline.queue().size)
        compose.runOnIdle { qa.model.advanceWorkoutTimer(Long.MAX_VALUE) }
        assertEquals(2, offline.queue().size)
        row(91001, 1).performScrollTo(); qa.capture("flow-checklist-saved-result")
        compose.onNodeWithTag("workout-exercise-toggle-91001").performScrollTo().performClick()
        row(91001, 1).assertDoesNotExist()
        compose.onNodeWithTag("workout-exercise-toggle-91001").performClick()
        row(91001, 1).assertExists()
        compose.onNodeWithTag("workout-folder-toggle-9191").performScrollTo().performClick()
        compose.onNodeWithTag("workout-day-toggle-9192").assertDoesNotExist()
        qa.capture("flow-checklist-folder-collapsed")
        qa.report("workout-flow", obj("result" to "passed", "sets" to 24, "synthetic_local_only" to true,
            "collapse_restore" to true, "early_execution" to true, "queue_records" to offline.queue().size))
    }
}
