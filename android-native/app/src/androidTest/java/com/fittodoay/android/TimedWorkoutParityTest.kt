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
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun timedCatalogExerciseRecordsSecondsWithoutHiddenRepsOrWeight() = runBlocking<Unit> {
        assumeTrue(InstrumentationRegistry.getArguments().getString("timedParity") == "true")
        val qa = QaHarness(compose); qa.guard()
        val exercise = qa.api.call("/api/exercises/?q=plank").rows().first { it.optBoolean("has_time") }
        val folder = qa.api.call("/api/programs/folders/", "POST", obj("name" to "QA таймер ${UUID.randomUUID().toString().take(6)}")) as JSONObject
        try {
            val day = qa.api.call("/api/programs/templates/", "POST", obj("folder" to folder.getInt("id"), "name" to "QA время", "is_active" to true,
                "schedule_type" to "weekly", "schedule_config" to obj("days_of_week" to JSONArray().put(LocalDate.now().dayOfWeek.value - 1)),
                "template_exercises" to JSONArray().put(obj("exercise_id" to exercise.get("id"), "set_override" to 1, "time_override" to 2, "rest_override" to 0)))) as JSONObject
            qa.navigate(Screen.Workout)
            qa.visible(hasText("Таймер", substring = false) and hasAnyAncestor(hasTestTag("workout-program-${folder.getInt("id")}")), "execution timer").performClick()
            compose.onNodeWithText("Выполнение", substring = false).assertIsDisplayed()
            compose.waitUntil(10_000) { compose.onAllNodesWithText("Готово", substring = false).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Завершить подход", substring = false).performClick(); qa.waitRequest()
            val id = day.array("template_exercises").single().getInt("id")
            val log = normalizePlan(qa.api.call("/api/workouts/plan/?date=${qa.model.date}") as JSONObject).array("logs").single { it.optInt("template_exercise") == id }
            assertEquals(2, log.getInt("actual_time")); assertTrue(log.isNull("actual_reps")); assertTrue(log.isNull("actual_weight"))
            qa.capture("timed-exercise-complete")
            qa.report("timed-exercise", obj("result" to "passed", "seconds" to 2, "hidden_reps_and_weight_omitted" to true))
        } finally {
            compose.runOnIdle { qa.model.executionUntil = 0; qa.model.restUntil = 0 }
            qa.api.call("/api/programs/folders/${folder.getInt("id")}/", "DELETE")
        }
    }
}
