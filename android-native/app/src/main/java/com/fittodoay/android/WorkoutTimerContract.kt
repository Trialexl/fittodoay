package com.fittodoay.android

import org.json.JSONObject
import kotlin.math.ceil

fun isFinalWorkoutSet(plan: JSONObject, exercise: JSONObject, set: JSONObject): Boolean {
    val positions = plan.array("folders").flatMap { it.array("templates") }.flatMap { it.array("exercises") }
        .filter { it.optBoolean("is_active", true) }.flatMap { e -> e.array("sets").map { e.optInt("template_exercise_id") to it.optInt("set_index") } }
    val current = positions.indexOf(exercise.optInt("template_exercise_id") to set.optInt("set_index"))
    val logs = plan.array("logs")
    val hasNext = current >= 0 && positions.drop(current + 1).any { pair -> logs.none { it.optInt("template_exercise") == pair.first && it.optInt("set_index") == pair.second } }
    return !hasNext
}

fun restSecondsForSet(plan: JSONObject, exercise: JSONObject, set: JSONObject): Int =
    if (isFinalWorkoutSet(plan, exercise, set)) 10 else set.optInt("rest", exercise.optJSONObject("defaults")?.optInt("rest", 0) ?: 0).coerceAtLeast(0)

fun executionSeconds(state: JSONObject, now: Long): Int {
    val duration = state.text("time").toIntOrNull()?.coerceAtLeast(1) ?: 1
    val start = state.optLong("started_at", state.optLong("end_at") - duration * 1000L)
    return ceil((now - start).coerceAtLeast(0) / 1000.0).toInt().coerceIn(1, duration)
}
