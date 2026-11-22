package com.fittodoay.android

import org.json.JSONArray
import org.junit.Test
import org.junit.Assert.*
import java.time.LocalDate

class CalendarHistoryTest {
    private val date = "2026-11-22"
    private fun response(value: Double, stamp: Long) = StoredResponse(obj("items" to JSONArray().put(obj("date" to date, "load" to value))), stamp)
    private fun day(stamp: Long, reps: Int = 6) = LocalWorkoutDay(obj("date" to date, "logs" to JSONArray().put(obj("actual_reps" to reps, "actual_weight" to 20))), stamp)
    @Test fun lateServerResponseDoesNotEraseANewerLocalEdit() {
        assertEquals(120.0, calendarLoads(response(100.0, 10), LocalWorkoutHistory(mapOf(date to day(20))))[date]!!, .001)
    }
    @Test fun genuinelyNewServerDataWinsOverAnOlderCachedPlan() {
        assertEquals(300.0, calendarLoads(response(300.0, 30), LocalWorkoutHistory(mapOf(date to day(20))))[date]!!, .001)
    }
    @Test fun unsentChangesWinEvenWhenAnUnchangedPlanWasReadMoreRecently() {
        assertEquals(120.0, calendarLoads(response(300.0, 30), LocalWorkoutHistory(mapOf(date to day(20)), setOf(date)))[date]!!, .001)
    }
    @Test fun undoingTheLastSetShowsZeroRatherThanTheOldServerTotal() {
        val empty = LocalWorkoutDay(obj("date" to date, "logs" to JSONArray()), 50)
        assertEquals(0.0, calendarLoads(response(100.0, 10), LocalWorkoutHistory(mapOf(date to empty)))[date]!!, .001)
    }
    @Test fun anUnknownDayIsNotInventedAsAnEmptyWorkout() {
        assertTrue(calendarLoads(null, LocalWorkoutHistory()).isEmpty())
        assertEquals(120.0, calendarLoads(null, LocalWorkoutHistory(mapOf(date to day(0))))[date]!!, .001)
    }
    @Test fun historicalWeighInDoesNotBecomeTheLatestWeight() {
        val rows = listOf(obj("date" to "2026-11-21", "weight_kg" to 80), obj("date" to "2026-11-19", "weight_kg" to 90))
        val local = listOf(obj("path" to "/api/workouts/weigh-in/", "date" to "2026-11-18", "body" to obj("date" to "2026-11-18", "weight_kg" to 95)))
        assertEquals(80, analyticsWeightRows(withQueuedWeights(rows, local), "week", LocalDate.parse(date)).last().getInt("weight_kg"))
    }
    @Test fun queuedWeightsRespectBothEndsOfTheSelectedPeriod() {
        val rows = listOf("2026-11-15", "2026-11-16", date, "2026-11-23").map { obj("date" to it, "weight_kg" to 80) }
        assertEquals(listOf("2026-11-16", date), analyticsWeightRows(rows, "week", LocalDate.parse(date)).map { it.text("date") })
    }
}
