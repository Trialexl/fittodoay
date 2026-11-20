package com.fittodoay.android

import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class WorkoutTimerContractTest {
    private fun exercise(id: Int, rest: Int = 60, active: Boolean = true) = obj("template_exercise_id" to id, "is_active" to active,
        "defaults" to obj("rest" to rest), "sets" to JSONArray().put(obj("set_index" to 1)).put(obj("set_index" to 2)))
    private fun plan(vararg exercises: org.json.JSONObject) = obj("folders" to JSONArray().put(obj("templates" to JSONArray().put(obj("exercises" to JSONArray(exercises.toList()))))), "logs" to JSONArray())
    @Test fun restUsesSetThenExerciseDefault() {
        val e = exercise(1, 75); val p = plan(e)
        assertEquals(75, restSecondsForSet(p, e, e.array("sets")[0]))
        assertEquals(0, restSecondsForSet(p, e, obj("set_index" to 1, "rest" to 0)))
    }
    @Test fun finalSetGetsTenSecondCompletionEvenWithZeroRest() {
        val e = exercise(1, 0); assertEquals(10, restSecondsForSet(plan(e), e, e.array("sets")[1]))
    }
    @Test fun upcomingSetsAcrossExercisesAndDisabledExercises() {
        val a = exercise(1); val b = exercise(2)
        assertEquals(60, restSecondsForSet(plan(a, b), a, a.array("sets")[1]))
        assertEquals(10, restSecondsForSet(plan(a, exercise(2, active = false)), a, a.array("sets")[1]))
    }
    @Test fun alreadyCompletedLaterSetsDoNotExtendRest() {
        val e = exercise(1); val p = plan(e).put("logs", JSONArray().put(obj("template_exercise" to 1, "set_index" to 2)))
        assertEquals(10, restSecondsForSet(p, e, e.array("sets")[0]))
    }
    @Test fun earlyFinishUsesElapsedSecondsAndBounds() {
        val state = obj("time" to "60", "started_at" to 1000L, "end_at" to 61000L)
        assertEquals(7, executionSeconds(state, 7500))
        assertEquals(60, executionSeconds(state, 99000))
        assertEquals(1, executionSeconds(state, 1000))
    }
    @Test fun legacyExecutionDeadlineStillCalculatesElapsed() {
        assertEquals(4, executionSeconds(obj("time" to "30", "end_at" to 31000L), 5000))
    }
}
