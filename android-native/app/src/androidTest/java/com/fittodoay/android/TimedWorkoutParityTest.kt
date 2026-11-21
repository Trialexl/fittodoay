@file:OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)

package com.fittodoay.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONArray
import org.junit.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import java.time.LocalDate
import java.util.UUID

class TimedWorkoutParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>(effectContext = NoMotion)
    @Test fun weightedSetIsOnlySavedAfterReviewAndSkip() = runBlocking<Unit> {
        assumeTrue(InstrumentationRegistry.getArguments().getString("timedParity") == "true")
        val qa = QaHarness(compose); qa.guard()
        val exercise = qa.api.call("/api/exercises/").rows().first { it.optBoolean("has_weight") && !it.optBoolean("has_time") }
        val folder = qa.api.call("/api/programs/folders/", "POST", obj("name" to "QA отдых ${UUID.randomUUID().toString().take(6)}")) as JSONObject
        try {
            val day = qa.api.call("/api/programs/templates/", "POST", obj("folder" to folder.getInt("id"), "name" to "QA результат", "is_active" to true,
                "schedule_type" to "weekly", "schedule_config" to obj("days_of_week" to JSONArray().put(LocalDate.now().dayOfWeek.value - 1)),
                "template_exercises" to JSONArray().put(obj("exercise_id" to exercise.get("id"), "set_override" to 2, "rep_override" to 10, "weight_override" to 5, "rest_override" to 600)))) as JSONObject
            val id = day.array("template_exercises").single().getInt("id")
            qa.navigate(Screen.Workout)
            compose.onAllNodes(hasText("+ Отметить", substring = false) and hasAnyAncestor(hasTestTag("workout-program-${folder.getInt("id")}"))).onFirst().performScrollTo().performClick()
            fun field(label: String) = compose.onNode(hasContentDescription(label) and hasAnyAncestor(hasTestTag("workout-timer-screen")))
            field("Повторы").performScrollTo().performTextReplacement("11")
            field("Вес (кг)").performScrollTo().performTextReplacement("7,5")
            val deadline = qa.model.restUntil
            compose.onNodeWithText("Свернуть", substring = false).performClick()
            val before = normalizePlan(qa.api.call("/api/workouts/plan/?date=${qa.model.date}") as JSONObject)
            assertTrue(before.array("logs").none { it.optInt("template_exercise") == id })
            assertEquals(deadline, qa.model.restUntil)
            compose.onNodeWithContentDescription("Развернуть таймер").performClick()
            field("Вес (кг)").assertTextContains("7,5")
            compose.onNodeWithText("Пропустить отдых", substring = false).performScrollTo().performClick(); qa.waitRequest()
            val after = normalizePlan(qa.api.call("/api/workouts/plan/?date=${qa.model.date}") as JSONObject)
            val log = after.array("logs").single { it.optInt("template_exercise") == id }
            assertEquals(11, log.getInt("actual_reps")); assertEquals(7.5, log.getDouble("actual_weight"), 0.0)
            assertTrue(log.isNull("actual_time"))
            fun editSaved() { compose.onNode(hasContentDescription("Изменить подход 1") and hasAnyAncestor(hasTestTag("set-row-$id-1"))).performScrollTo().performClick() }
            fun editField(label: String) = compose.onNode(hasContentDescription(label) and hasAnyAncestor(hasTestTag("completed-set-dialog")))
            editSaved(); editField("Вес (кг)").performTextReplacement("8,5")
            compose.onNodeWithText("Отмена", substring = false).performClick()
            val cancelled = normalizePlan(qa.api.call("/api/workouts/plan/?date=${qa.model.date}") as JSONObject).array("logs").single { it.optInt("template_exercise") == id }
            assertEquals(7.5, cancelled.getDouble("actual_weight"), 0.0)
            editSaved(); editField("Вес (кг)").performTextReplacement("8,5"); editField("Повторы").performTextReplacement("12")
            qa.capture("v2-edit-completed-live")
            compose.onNodeWithText("Сохранить", substring = false).performClick(); qa.waitRequest()
            val patched = normalizePlan(qa.api.call("/api/workouts/plan/?date=${qa.model.date}") as JSONObject).array("logs").single { it.optInt("template_exercise") == id }
            assertEquals(log.getInt("id"), patched.getInt("id")); assertEquals(12, patched.getInt("actual_reps")); assertEquals(8.5, patched.getDouble("actual_weight"), 0.0)
            assertFalse(qa.model.workoutTimerActive)
            editSaved(); compose.onNodeWithText("Отменить выполнение", substring = false).performClick(); qa.waitRequest()
            assertTrue(normalizePlan(qa.api.call("/api/workouts/plan/?date=${qa.model.date}") as JSONObject).array("logs").none { it.optInt("template_exercise") == id })
            qa.report("completed-edit-live", obj("result" to "passed", "cancel_preserves_fact" to true, "patch_same_record" to true, "undo_deletes_fact" to true))
            qa.report("weighted-rest-live", obj("result" to "passed", "reps" to 11, "weight" to 7.5, "saved_before_confirmation" to false))
        } finally {
            compose.runOnIdle { qa.model.cancelWorkoutTimer() }
            qa.api.call("/api/programs/folders/${folder.getInt("id")}/", "DELETE")
        }
    }
    @Test fun timedCatalogExerciseRecordsSecondsWithoutHiddenRepsOrWeight() = runBlocking<Unit> {
        assumeTrue(InstrumentationRegistry.getArguments().getString("timedParity") == "true")
        val qa = QaHarness(compose); qa.guard()
        val exercise = qa.api.call("/api/exercises/?q=plank").rows().first { it.optBoolean("has_time") }
        val folder = qa.api.call("/api/programs/folders/", "POST", obj("name" to "QA таймер ${UUID.randomUUID().toString().take(6)}")) as JSONObject
        try {
            val day = qa.api.call("/api/programs/templates/", "POST", obj("folder" to folder.getInt("id"), "name" to "QA время", "is_active" to true,
                "schedule_type" to "weekly", "schedule_config" to obj("days_of_week" to JSONArray().put(LocalDate.now().dayOfWeek.value - 1)),
                "template_exercises" to JSONArray().put(obj("exercise_id" to exercise.get("id"), "set_override" to 1, "time_override" to 5, "rest_override" to 0)))) as JSONObject
            qa.navigate(Screen.Workout)
            qa.visible(hasText("▷ Начать", substring = false) and hasAnyAncestor(hasTestTag("workout-program-${folder.getInt("id")}")), "execution timer").performClick()
            compose.onNodeWithText("Выполнение", substring = false).assertIsDisplayed()
            compose.waitUntil(15_000) { qa.model.executionUntil == 0L && qa.model.restPending != null }
            assertEquals("5", qa.model.restPending!!.text("time"))
            compose.onNodeWithText(if (qa.model.restDuration > 0) "Пропустить отдых" else "Сохранить подход", substring = false).performScrollTo().performClick(); qa.waitRequest()
            val id = day.array("template_exercises").single().getInt("id")
            val log = normalizePlan(qa.api.call("/api/workouts/plan/?date=${qa.model.date}") as JSONObject).array("logs").single { it.optInt("template_exercise") == id }
            assertEquals(5, log.getInt("actual_time")); assertTrue(log.isNull("actual_reps")); assertTrue(log.isNull("actual_weight"))
            qa.capture("timed-exercise-complete")
            qa.report("timed-exercise", obj("result" to "passed", "seconds" to 5, "hidden_reps_and_weight_omitted" to true))
        } finally {
            compose.runOnIdle { qa.model.executionUntil = 0; qa.model.restUntil = 0 }
            qa.api.call("/api/programs/folders/${folder.getInt("id")}/", "DELETE")
        }
    }
}
