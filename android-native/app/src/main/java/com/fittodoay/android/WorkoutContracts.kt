package com.fittodoay.android

import org.json.JSONObject
import org.json.JSONArray

fun normalizePlan(response: JSONObject): JSONObject = JSONObject(response.toString()).apply {
    val snapshot = response.optJSONObject("plan_snapshot") ?: JSONObject()
    put("folders", snapshot.optJSONArray("folders") ?: response.optJSONArray("folders") ?: JSONArray())
    put("logs", response.optJSONArray("set_logs") ?: response.optJSONArray("logs") ?: JSONArray())
    if (text("date").isEmpty()) put("date", snapshot.text("date"))
    remove("plan_snapshot"); remove("set_logs")
}

fun withQueuedChanges(serverPlan: JSONObject, queue: List<JSONObject>, date: String): JSONObject = JSONObject(serverPlan.toString()).apply {
    for (entry in queue.filter { it.text("date") == date }) {
        val body = entry.getJSONObject("body")
        if (entry.text("path").startsWith("/api/workouts/logs/")) {
            val local = JSONObject(body.toString()).put("id", -1).put("queued", true).put("queue_key", entry.text("key"))
            val kept = array("logs").filterNot { it.optInt("template_exercise") == body.optInt("template_exercise") && it.optInt("set_index") == body.optInt("set_index") }
            put("logs", JSONArray(if (entry.text("method") == "DELETE") kept else kept + local))
        } else if (entry.text("path") == "/api/workouts/weigh-in/") put("weigh_in", JSONObject(body.toString()))
    }
}

/** Apply one acknowledged mutation, then project any newer local intentions over it. */
fun withSyncedChange(plan: JSONObject, entry: JSONObject, result: JSONObject): JSONObject = JSONObject(plan.toString()).apply {
    val body = entry.getJSONObject("body")
    if (entry.text("path").startsWith("/api/workouts/logs/")) {
        val kept = array("logs").filterNot { it.optInt("template_exercise") == body.optInt("template_exercise") && it.optInt("set_index") == body.optInt("set_index") }
        put("logs", JSONArray(if (entry.text("method") == "DELETE") kept else kept + result))
    } else if (entry.text("path") == "/api/workouts/weigh-in/") put("weigh_in", result)
}

fun withQueuedWeights(server: List<JSONObject>, queue: List<JSONObject>): List<JSONObject> {
    val local = queue.filter { it.text("path") == "/api/workouts/weigh-in/" }.associate { it.text("date") to it.getJSONObject("body") }
    return server.filterNot { it.text("date") in local } + local.values
}

fun workoutLoad(plan: JSONObject): Double {
    val exercises = plan.array("folders").flatMap { it.array("templates") }.flatMap { it.array("exercises") }
        .associateBy { it.optInt("template_exercise_id") }
    return plan.array("logs").sumOf { log ->
        val defaults = exercises[log.optInt("template_exercise")]?.optJSONObject("defaults") ?: JSONObject()
        val reps = log.optDouble("actual_reps", 0.0); val weight = log.optDouble("actual_weight", 0.0); val time = log.optDouble("actual_time", 0.0)
        when {
            weight > 0 && reps > 0 -> weight * reps
            reps > 0 -> reps
            time > 0 -> time / 10
            defaults.optDouble("weight", 0.0) > 0 && defaults.optDouble("reps", 0.0) > 0 -> defaults.optDouble("weight") * defaults.optDouble("reps")
            defaults.optDouble("reps", 0.0) > 0 -> defaults.optDouble("reps")
            else -> defaults.optDouble("time", 0.0) / 10
        }
    }
}

fun setLogPayload(planId: Int, exercise: JSONObject, setIndex: Int, reps: String, weight: String, time: String): JSONObject {
    val source = exercise.optJSONObject("source") ?: JSONObject()
    val defaults = exercise.optJSONObject("defaults") ?: JSONObject()
    val timed = defaults.optBoolean("has_time", source.optBoolean("has_time"))
    val weighted = defaults.optBoolean("has_weight", source.optBoolean("has_weight")) && !timed
    val actualReps = if (timed) null else reps.toIntOrNull()
    val actualTime = if (timed) time.toIntOrNull() else null
    val actualWeight = if (weighted) weight.replace(',', '.').toDoubleOrNull() else null
    require(if (timed) (actualTime ?: 0) > 0 else (actualReps ?: 0) > 0) { "Укажите положительное число повторов или секунд" }
    require(!weighted || (actualWeight != null && actualWeight.isFinite() && actualWeight >= 0)) { "Укажите корректный вес" }
    return obj("workout_day" to planId, "template_exercise" to exercise.getInt("template_exercise_id"), "set_index" to setIndex,
        "actual_reps" to actualReps, "actual_weight" to actualWeight, "actual_time" to actualTime)
}
