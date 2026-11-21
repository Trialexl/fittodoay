package com.fittodoay.android

import org.junit.Assert.*
import org.junit.Test

class WorkoutContractsTest {
    @Test fun pendingUndoWinsOverAStaleServerSnapshotAndAcknowledgement() {
        val log = obj("id" to 7, "template_exercise" to 3, "set_index" to 1, "actual_reps" to 10)
        val server = obj("logs" to org.json.JSONArray().put(log))
        val removal = obj("key" to "set:1:3:1", "date" to "2026-11-19", "method" to "DELETE", "path" to "/api/workouts/logs/7/", "body" to log)
        assertTrue(withQueuedChanges(server, listOf(removal), "2026-11-19").array("logs").isEmpty())
        assertTrue(withSyncedChange(server, removal, obj()).array("logs").isEmpty())
        assertEquals(1, server.array("logs").size)
    }
    @Test fun pendingWeightIsVisibleBeforeTheServerAcceptsIt() {
        val server = listOf(obj("date" to "2026-11-19", "weight_kg" to 80), obj("date" to "2026-11-18", "weight_kg" to 81))
        val pending = obj("date" to "2026-11-19", "path" to "/api/workouts/weigh-in/", "body" to obj("date" to "2026-11-19", "weight_kg" to 82))
        val result = withQueuedWeights(server, listOf(pending))
        assertEquals(2, result.size)
        assertEquals(82, result.single { it.text("date") == "2026-11-19" }.getInt("weight_kg"))
        assertEquals(80, server.first().getInt("weight_kg"))
    }
    @Test fun refreshingAnOlderServerPlanCannotHidePendingLocalEdits() {
        val server = obj("logs" to org.json.JSONArray().put(obj("id" to 7, "template_exercise" to 3, "set_index" to 1, "actual_reps" to 10)))
        val entry = obj("key" to "set:1:3:1", "date" to "2026-11-19", "path" to "/api/workouts/logs/7/", "body" to obj("template_exercise" to 3, "set_index" to 1, "actual_reps" to 11))
        val merged = withQueuedChanges(server, listOf(entry), "2026-11-19")
        assertEquals(11, merged.array("logs").single().getInt("actual_reps")); assertTrue(merged.array("logs").single().optBoolean("queued"))
        assertEquals(10, server.array("logs").single().getInt("actual_reps"))
        assertEquals(10, withQueuedChanges(server, listOf(entry), "2026-11-20").array("logs").single().getInt("actual_reps"))
    }
    @Test fun dailyLoadMatchesBackendWeightedBodyweightAndTimedRules() {
        val plan = obj("logs" to org.json.JSONArray().put(obj("actual_weight" to 6.25, "actual_reps" to 10))
            .put(obj("actual_weight" to 0, "actual_reps" to 12)).put(obj("actual_time" to 60)))
        assertEquals(80.5, workoutLoad(plan), 0.0001)
    }
    @Test fun djangoPlanSnapshotAndSetLogsBecomeVisibleInNativeChecklist() {
        val response = obj("id" to 7, "date" to "2026-11-19", "status" to "in_progress",
            "plan_snapshot" to obj("folders" to org.json.JSONArray().put(obj("id" to 3, "name" to "Сила"))),
            "set_logs" to org.json.JSONArray().put(obj("id" to 9, "set_index" to 1)),
            "weigh_in" to obj("weight_kg" to "80.5"))
        val plan = normalizePlan(response)
        assertEquals("Сила", plan.array("folders").single().text("name"))
        assertEquals(9, plan.array("logs").single().getInt("id"))
        assertEquals(7, plan.getInt("id"))
        assertEquals("80.5", plan.getJSONObject("weigh_in").text("weight_kg"))
        assertFalse(plan.has("plan_snapshot")); assertFalse(plan.has("set_logs"))
    }
    @Test fun timedSetsDoNotRecordHiddenRepsOrWeight() {
        val exercise = obj("template_exercise_id" to 8, "source" to obj("has_time" to true, "has_weight" to true))
        val payload = setLogPayload(1, exercise, 2, "10", "50", "45")
        assertTrue(payload.isNull("actual_reps")); assertTrue(payload.isNull("actual_weight"))
        assertEquals(45, payload.getInt("actual_time"))
    }
    @Test fun weightedSetsAcceptRussianDecimalSeparator() {
        val exercise = obj("template_exercise_id" to 8, "source" to obj("has_time" to false, "has_weight" to true))
        val payload = setLogPayload(1, exercise, 2, "12", "22,5", "45")
        assertEquals(12, payload.getInt("actual_reps")); assertEquals(22.5, payload.getDouble("actual_weight"), 0.0)
        assertTrue(payload.isNull("actual_time"))
    }
    @Test(expected = IllegalArgumentException::class) fun invalidSetsCannotEnterOfflineQueue() {
        setLogPayload(1, obj("template_exercise_id" to 8), 1, "-2", "0", "0")
    }
}
